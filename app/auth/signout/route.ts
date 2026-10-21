import { type NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  TOKEN_EXP_COOKIE_NAME,
} from "@/lib/auth";
import { BACKEND_URL, AGENT_CLIENT_ID } from "@/lib/config";

const AUTH_COOKIES = [COOKIE_NAME, REFRESH_COOKIE_NAME, TOKEN_EXP_COOKIE_NAME] as const;

function getOrigin(request: NextRequest): string {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  return `${requestUrl.protocol}//${host}`;
}

/**
 * POST = the user's explicit Logout. Besides this app's own cookies it ends the
 * shared center sign-in (wazzi-backend mig 412), via a top-level redirect to
 * the API host that holds that session: otherwise the next sign-in page would
 * sign this browser straight back in. The backend checks the redirect_uri is
 * registered to this client and sends the browser back here.
 *
 * GET (below) is the AUTOMATIC sign-out on an expired session — it must NOT
 * end the shared sign-in, or one lapsed token would sign you out everywhere.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const redirectTo = formData.get("redirect") as string | null;
  const target =
    redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : "/auth/login";
  const origin = getOrigin(request);
  const logout = new URL("/auth/center-sso/logout", BACKEND_URL);
  logout.searchParams.set("client_id", AGENT_CLIENT_ID);
  logout.searchParams.set("redirect_uri", `${origin}/auth/callback`);
  logout.searchParams.set("return_to", new URL(target, origin).toString());
  // 303, not Next's default 307: a 307 makes the browser re-POST to the API
  // (cross-origin, Origin: null → refused by its CORS check). 303 turns it
  // into the plain GET navigation the logout endpoint expects.
  const response = NextResponse.redirect(logout, 303);
  AUTH_COOKIES.forEach((name) => response.cookies.delete(name));
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect");
  const target =
    redirectTo && /^\/[^/]/.test(redirectTo) ? redirectTo : "/auth/login";
  const response = NextResponse.redirect(new URL(target, getOrigin(request)));
  AUTH_COOKIES.forEach((name) => response.cookies.delete(name));
  return response;
}
