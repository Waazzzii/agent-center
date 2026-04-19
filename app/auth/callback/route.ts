import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TOKEN_EXP_COOKIE_NAME,
} from "@/lib/auth";
import { BACKEND_URL, AGENT_CLIENT_ID } from "@/lib/config";
import { getAuthCookieOptions, getPublicCookieOptions } from "@/lib/cookies";

/**
 * OAuth callback: exchanges code for tokens server-side and sets httpOnly
 * cookies, then redirects to the originally intended destination.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  const origin = `${requestUrl.protocol}//${host}`;
  const searchParams = requestUrl.searchParams;
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Authentication failed: no code received.")}`,
    );
  }

  const storedState = request.cookies.get("oauth_state")?.value;
  const codeVerifier = request.cookies.get("pkce_verifier")?.value;
  const redirectTo = request.cookies.get("oauth_redirect")?.value || "/";

  if (storedState && returnedState && storedState !== returnedState) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Authentication failed: state mismatch.")}`,
    );
  }

  try {
    const tokenRes = await fetch(`${BACKEND_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/auth/callback`,
        client_id: AGENT_CLIENT_ID,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error("[AUTH-CALLBACK] Token exchange failed:", tokenRes.status, body);
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent("Authentication failed: token exchange error.")}`,
      );
    }

    const { access_token, refresh_token, expires_in, refresh_token_expires_in } =
      await tokenRes.json();

    const expiresIn: number = expires_in ?? 3600;
    const refreshExpiresIn: number =
      refresh_token_expires_in > 0 ? refresh_token_expires_in : 2592000;

    if (!access_token) {
      return NextResponse.redirect(
        `${origin}/auth/error?message=${encodeURIComponent("Authentication failed: no access token received.")}`,
      );
    }

    const response = NextResponse.redirect(`${origin}${redirectTo}`);
    const now = Math.floor(Date.now() / 1000);
    const hostname = host.split(":")[0];

    response.cookies.set(
      COOKIE_NAME,
      access_token,
      getAuthCookieOptions(hostname, refreshExpiresIn, request),
    );

    if (refresh_token) {
      response.cookies.set(
        REFRESH_COOKIE_NAME,
        refresh_token,
        getAuthCookieOptions(hostname, refreshExpiresIn, request),
      );
    }

    const schedulerExp = now + Math.min(expiresIn, refreshExpiresIn);
    response.cookies.set(
      TOKEN_EXP_COOKIE_NAME,
      String(schedulerExp),
      getPublicCookieOptions(hostname, refreshExpiresIn, request),
    );

    response.cookies.delete("pkce_verifier");
    response.cookies.delete("oauth_state");
    response.cookies.delete("oauth_redirect");

    return response;
  } catch (err) {
    console.error("[AUTH-CALLBACK] Unexpected error:", err);
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Authentication failed. Please try again.")}`,
    );
  }
}
