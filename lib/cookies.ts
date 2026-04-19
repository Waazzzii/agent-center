/**
 * Cookie configuration helpers for agent-center auth.
 */

import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

function isSecure(request?: Request): boolean {
  if (request) {
    const proto = new URL(request.url).protocol;
    const forwarded = request.headers.get("x-forwarded-proto");
    if (proto === "https:" || forwarded === "https") return true;
  }
  return process.env.NODE_ENV === "production";
}

export function getAuthCookieOptions(
  _hostname: string,
  maxAge: number,
  request?: Request,
): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: isSecure(request),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function getPublicCookieOptions(
  hostname: string,
  maxAge: number,
  request?: Request,
): Partial<ResponseCookie> {
  return {
    ...getAuthCookieOptions(hostname, maxAge, request),
    httpOnly: false,
  };
}
