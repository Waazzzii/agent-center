/**
 * Auth helpers for agent-center.
 *
 * Session verification is delegated to the backend via GET /products/me.
 * No JWT public key is required in the frontend — the backend verifies
 * the token and returns the user, or 401 if invalid/expired.
 */

import { AGENT_CLIENT_ID, AUTH_URL, BACKEND_URL } from "@/lib/config";
import type { ProductUser } from "@/types/api.types";

export const COOKIE_NAME = "agent_token";
export const REFRESH_COOKIE_NAME = "agent_refresh_token";
export const TOKEN_EXP_COOKIE_NAME = "agent_token_exp";

export type AgentSession = ProductUser;

/**
 * Verify a session token by calling GET /products/me on the backend.
 * Returns the user's session or null if the token is missing, expired,
 * or invalid. Used in server components and layouts (Node.js runtime).
 */
export async function getSessionFromToken(
  token: string,
  host: string,
): Promise<AgentSession | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/products/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Wazzi-Domain": host,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.user as AgentSession) ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the centralized auth UI sign-in URL with PKCE.
 */
export function buildAuthorizationUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  mode?: "login" | "signup";
  email?: string;
}): string {
  const url = new URL(`/${params.mode ?? "login"}`, AUTH_URL);
  url.searchParams.set("client_id", AGENT_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "openid email profile");
  if (params.email) url.searchParams.set("email", params.email);
  return url.toString();
}
