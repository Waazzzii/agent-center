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
 * The Wazzi admin app (wazzi-frontend) — where org-wide things like access
 * groups and their membership are managed. We link out to it (e.g. to edit a
 * group, deep-linked to /access-groups/:id) rather than duplicating that
 * management here.
 *
 * REQUIRED, no fallback: set NEXT_PUBLIC_WAZZI_APP_URL per environment (dev e.g.
 * http://localhost:3001, prod e.g. https://app.wazzi.io). When unset the
 * "Manage / Edit in Wazzi admin" links are hidden rather than pointing at a
 * wrong host — a bad fallback silently sent people to the wrong place.
 */
export const WAZZI_APP_URL = process.env.NEXT_PUBLIC_WAZZI_APP_URL ?? "";
