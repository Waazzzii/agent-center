/**
 * Centralized runtime configuration for agent-center.
 *
 * Server-side-only: BACKEND_URL (used by BFF routes).
 * Browser-readable (NEXT_PUBLIC_*): AUTH_URL, AGENT_CLIENT_ID, AGENT_BACKEND_URL.
 *
 * AGENT_BACKEND_URL is browser-readable because the noVNC iframe loads
 * directly from it in the user's browser. The server-side BFF catchall
 * also reads this same var — one URL, one env entry.
 */

export const BACKEND_URL =
  process.env.BACKEND_URL || "http://localhost:4000";

export const AGENT_BACKEND_URL =
  process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:4001";

export const AGENT_CLIENT_ID =
  process.env.NEXT_PUBLIC_CLIENT_ID || "agent-center";

/**
 * Centralized auth UI. All sign-in / sign-up / reset flows are rendered by
 * auth.wazzi.io — this product just redirects there and receives users back
 * at /auth/callback with a fresh auth code.
 */
export const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3100";

/**
 * AI Script Builder ("Build with AI" on Browser Scripts) — hidden by default
 * while the feature is being tested. Set NEXT_PUBLIC_AI_SCRIPT_BUILDER=true
 * to surface the entry point + resume banner. NEXT_PUBLIC_* is baked at
 * build time, so flipping this requires a rebuild/redeploy.
 */
export const AI_SCRIPT_BUILDER_ENABLED =
  process.env.NEXT_PUBLIC_AI_SCRIPT_BUILDER === "true";
