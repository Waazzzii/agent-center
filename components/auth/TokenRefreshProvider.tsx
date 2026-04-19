"use client";

import { useEffect } from "react";
import { start } from "@/lib/auth/token-refresh";
import { TOKEN_EXP_COOKIE_NAME } from "@/lib/auth";

/**
 * Mounts the proactive token refresh scheduler for agent-center.
 *
 * Token storage: httpOnly cookies (never readable by JS).
 * Expiry hint:   agent_token_exp cookie (plain Unix timestamp — not a secret).
 * Refresh:       POST /auth/refresh (Next.js route handler reads the httpOnly
 *                refresh cookie, calls the backend, and rotates all cookies).
 */

function readTokenExp(): number | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_EXP_COOKIE_NAME}=([^;]+)`),
  );
  return match ? parseInt(match[1]!, 10) : null;
}

export function TokenRefreshProvider() {
  useEffect(() => {
    return start({
      readExp: readTokenExp,

      refresh: async (signal) => {
        try {
          const res = await fetch("/auth/refresh", {
            method: "POST",
            signal,
            credentials: "same-origin",
          });
          if (!res.ok) return null;
          const { expiresAt } = await res.json();
          return typeof expiresAt === "number" ? expiresAt : null;
        } catch {
          return null;
        }
      },

      lockName: "agent-center-token-refresh",
      loginPath: "/auth/login",
    });
  }, []);

  return null;
}
