import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TOKEN_EXP_COOKIE_NAME,
} from "@/lib/auth";
import { AUTH_URL, BACKEND_URL, AGENT_CLIENT_ID } from "@/lib/config";
import { getAuthCookieOptions, getPublicCookieOptions } from "@/lib/cookies";

/**
 * Fail back to the CENTRAL auth app, clearing this product's session on the way.
 *
 * Sign-in error copy + retry affordances live in auth-frontend
 * (lib/auth/error-copy.ts) so every product says the same thing, and an
 * unauthenticated person is never dropped into a product just to read an error.
 * This route keeps only what it alone can do: the token exchange and clearing
 * its own httpOnly cookies (no other origin can).
 *
 * `code` uses the shared vocabulary the auth app's copy map keys off.
 */
/**
 * Read the backend's stable reason out of a failed /oauth/token response.
 *
 * The backend returns a spec-compliant `error` (RFC 6749) plus an additive
 * `error_code` with the specific reason. Prefer `error_code`, fall back to
 * `error`, then to a generic. No pattern-matching on prose — that breaks
 * silently whenever a message is reworded.
 */
function tokenErrorFrom(body: string): [code: string, detail: string] {
  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      error_code?: string;
      error_description?: string;
    };
    const code = parsed.error_code || parsed.error;
    if (code)
      return [
        code,
        parsed.error_description || "The sign-in could not be completed.",
      ];
  } catch {
    // non-JSON body (proxy error page, empty response) — fall through
  }
  return ["server_error", "The sign-in could not be completed."];
}

function errorRedirect(code: string, detail: string) {
  const target = new URL("/login", AUTH_URL);
  target.searchParams.set("error", code);
  target.searchParams.set("error_description", detail);
  const response = NextResponse.redirect(target.toString());
  response.cookies.delete(COOKIE_NAME);
  response.cookies.delete(REFRESH_COOKIE_NAME);
  response.cookies.delete(TOKEN_EXP_COOKIE_NAME);
  return response;
}

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
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");

  if (oauthError) {
    // The backend already speaks the shared error vocabulary — pass its code
    // straight through so the auth app renders the matching copy.
    console.error(
      "[AUTH-CALLBACK] Upstream OAuth error:",
      oauthError,
      oauthErrorDescription,
    );
    return errorRedirect(oauthError, oauthErrorDescription || oauthError);
  }

  if (!code || !returnedState) {
    return errorRedirect(
      "server_error",
      "The sign-in response was missing required parameters.",
    );
  }

  // State-keyed cookies: finding the verifier cookie for this exact state
  // proves this browser started this flow (no separate oauth_state check).
  const codeVerifier = request.cookies.get(`pkce_verifier_${returnedState}`)?.value;
  const redirectTo =
    request.cookies.get(`oauth_redirect_${returnedState}`)?.value || "/";

  if (!codeVerifier) {
    console.error(
      "[AUTH-CALLBACK] PKCE verifier cookie missing for state — login window expired or state mismatch",
    );
    return errorRedirect(
      "expired",
      "The sign-in window expired before it completed.",
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
      return errorRedirect(...tokenErrorFrom(body));
    }

    const { access_token, refresh_token, expires_in, refresh_token_expires_in } =
      await tokenRes.json();

    const expiresIn: number = expires_in ?? 3600;
    const refreshExpiresIn: number =
      refresh_token_expires_in > 0 ? refresh_token_expires_in : 2592000;

    if (!access_token) {
      return errorRedirect("server_error", "No access token was returned.");
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

    response.cookies.delete(`pkce_verifier_${returnedState}`);
    response.cookies.delete(`oauth_redirect_${returnedState}`);
    // Clean up any legacy single-slot cookies from the old flow.
    response.cookies.delete("pkce_verifier");
    response.cookies.delete("oauth_state");
    response.cookies.delete("oauth_redirect");

    return response;
  } catch (err) {
    console.error("[AUTH-CALLBACK] Unexpected error:", err);
    return errorRedirect("server_error", "An unexpected error occurred.");
  }
}
