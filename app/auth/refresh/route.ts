import { type NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TOKEN_EXP_COOKIE_NAME,
} from "@/lib/auth";
import { BACKEND_URL, AGENT_CLIENT_ID } from "@/lib/config";
import { getAuthCookieOptions, getPublicCookieOptions } from "@/lib/cookies";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  try {
    const tokenRes = await fetch(`${BACKEND_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: AGENT_CLIENT_ID,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text().catch(() => "");
      console.error("[AUTH-REFRESH] Backend token refresh failed:", tokenRes.status, body);
      return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    }

    const {
      access_token,
      refresh_token: new_refresh_token,
      expires_in,
      refresh_token_expires_in,
    } = await tokenRes.json();

    const expiresIn: number = expires_in ?? 3600;
    const refreshExpiresIn: number =
      refresh_token_expires_in > 0 ? refresh_token_expires_in : 2592000;

    const now = Math.floor(Date.now() / 1000);
    const hostname = new URL(request.url).hostname;
    const schedulerExp = now + Math.min(expiresIn, refreshExpiresIn);

    const response = NextResponse.json({ expiresAt: schedulerExp });

    response.cookies.set(
      COOKIE_NAME,
      access_token,
      getAuthCookieOptions(hostname, refreshExpiresIn, request),
    );

    if (new_refresh_token) {
      response.cookies.set(
        REFRESH_COOKIE_NAME,
        new_refresh_token,
        getAuthCookieOptions(hostname, refreshExpiresIn, request),
      );
    }

    response.cookies.set(
      TOKEN_EXP_COOKIE_NAME,
      String(schedulerExp),
      getPublicCookieOptions(hostname, refreshExpiresIn, request),
    );

    return response;
  } catch (err) {
    console.error("[AUTH-REFRESH] Unexpected error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
