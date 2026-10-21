/**
 * GET /auth/login — start sign-in, fully server-side.
 *
 * The middleware auth guard sends signed-out visitors here. Generates the PKCE
 * verifier + state (node crypto), stashes them in state-keyed cookies for
 * /auth/callback, and sends the browser straight to the API's /authorize with
 * `sso_attempt=1`: a center on shared sign-in (wazzi-backend mig 412) with a
 * live central session comes straight back with a code — no page at all;
 * anything else lands on the central sign-in page. No client bootstrap page:
 * that used to cost a full page + JS load before the redirect could even start.
 */
import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { AUTH_URL, BACKEND_URL, AGENT_CLIENT_ID as CLIENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

// Must EXCEED the backend's magic-code window (15 min): a shorter verifier
// lifetime means a code the backend still accepts mints an auth code this app
// can no longer exchange, and the user gets "expired" after doing everything right.
const PKCE_COOKIE_TTL = 30 * 60; // seconds — also how long a sign-in page left open stays usable

// Loop breaker: more than this many visits here within a minute means
// something after sign-in keeps reading as signed-out (under shared sign-in
// each pass is silent, so it would otherwise spin forever).
const LOGIN_ATTEMPTS_COOKIE = "login_attempts";
const MAX_LOGIN_ATTEMPTS = 4;
const LOGIN_ATTEMPTS_WINDOW = 60; // seconds

/** Same-origin paths only, and never the sign-in plumbing itself. */
function safeRedirect(target: string | null): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  if (target.startsWith("/auth/") || target === "/login" || target.startsWith("/login?")) return "/";
  return target;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  const origin = `${requestUrl.protocol}//${host}`;
  const redirectTo = safeRedirect(requestUrl.searchParams.get("redirect"));

  const attempts = Number(request.cookies.get(LOGIN_ATTEMPTS_COOKIE)?.value ?? 0) + 1;
  if (attempts > MAX_LOGIN_ATTEMPTS) {
    // Stop and explain on the sign-in site; its Try again comes back here
    // with the counter cleared.
    const stop = new URL("/login", AUTH_URL);
    stop.searchParams.set("client_id", CLIENT_ID);
    stop.searchParams.set("redirect_uri", `${origin}/auth/callback`);
    stop.searchParams.set("error", "server_error");
    stop.searchParams.set("error_description", "Sign-in kept repeating without finishing.");
    const stopped = NextResponse.redirect(stop.toString());
    stopped.cookies.delete(LOGIN_ATTEMPTS_COOKIE);
    return stopped;
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

  const authUrl = new URL("/authorize", BACKEND_URL);
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", `${origin}/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("sso_attempt", "1");
  // The center's own light/dark (ThemeCookie), so the sign-in page matches.
  const theme = request.cookies.get("center_theme")?.value;
  if (theme === "light" || theme === "dark") authUrl.searchParams.set("theme", theme);

  const response = NextResponse.redirect(authUrl.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/",
    maxAge: PKCE_COOKIE_TTL,
  };
  response.cookies.set(`pkce_verifier_${state}`, codeVerifier, cookieOpts);
  response.cookies.set(`oauth_redirect_${state}`, redirectTo, cookieOpts);
  response.cookies.set(LOGIN_ATTEMPTS_COOKIE, String(attempts), { ...cookieOpts, maxAge: LOGIN_ATTEMPTS_WINDOW });
  return response;
}
