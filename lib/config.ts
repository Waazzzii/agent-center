/**
 * Centralized runtime configuration for agent-center.
 *
 * Server-side-only: BACKEND_URL, AGENT_BACKEND_URL (used by BFF routes).
 * Browser-readable (NEXT_PUBLIC_*): AUTH_URL, AGENT_CLIENT_ID.
 */

export const BACKEND_URL =
  process.env.BACKEND_URL || "http://localhost:4000";

export const AGENT_BACKEND_URL =
  process.env.AGENT_BACKEND_URL || "http://localhost:4001";

export const AGENT_CLIENT_ID =
  process.env.NEXT_PUBLIC_CLIENT_ID || "agent-center";

/**
 * Centralized auth UI. All sign-in / sign-up / reset flows are rendered by
 * auth.wazzi.io — this product just redirects there and receives users back
 * at /auth/callback with a fresh auth code.
 */
export const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3100";
