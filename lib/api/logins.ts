import agentClient from './agent-client';

export interface Login {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  /** @deprecated — superseded by verify_script_id. Kept in the type only
   *  because the column still exists in the DB until a future migration
   *  drops it. No UI surface reads this anymore. */
  verify_text: string;
  /** Browser script that proves the session is logged in. Required for new
   *  logins (enforced at API + UI). Running the script to completion = valid;
   *  any step error or timeout = needs_login. ON DELETE RESTRICT: the script
   *  cannot be deleted while any login still references it here. */
  verify_script_id: string | null;
  browser_session_id: string | null;
  /** Any time we ran a verify (regardless of outcome). */
  last_checked_at: string | null;
  /** Last time the session was confirmed / refreshed valid. */
  last_logged_in_at: string | null;
  // Login profile status lifecycle:
  //   valid       — the saved session has been verified (recently or
  //                 just now) to authenticate against the site.
  //   needs_login — the saved session doesn't authenticate (expired,
  //                 logged out, never set up, etc.) and a human needs
  //                 to log in via the "Log In" button.
  //   verifying   — INTERMEDIATE: the user clicked Done after a
  //                 manual login / completed HITL, and a background
  //                 verify is in flight to confirm the saved state.
  //                 Transitions to valid or needs_login when the
  //                 verify finishes (~5s typical). The UI renders this
  //                 with a spinner so the operator knows we don't yet
  //                 know the outcome. Without this state, the previous
  //                 design optimistically wrote 'valid' on Done click
  //                 and reverted to 'needs_login' once verify failed —
  //                 a stale-valid window operators occasionally caught
  //                 in flight and made decisions on.
  //   unknown     — never been checked (fresh login profile, no verify
  //                 has run yet).
  status: 'valid' | 'needs_login' | 'verifying' | 'unknown';
  /** Optional browser script that the agent executor will attempt before
   *  falling through to HITL when verification fails. Auto-login is only
   *  attempted when BOTH this AND credentials_secret_id are set. */
  auto_login_script_id: string | null;
  /** UUID of the encrypted credentials row in organization_secrets. The
   *  actual values are NEVER returned by the API — operators re-enter to
   *  update. Boolean check `!!credentials_secret_id` = "credentials are
   *  on file" (for UI display). */
  credentials_secret_id: string | null;
  /** Optional Slack channel override for HITL notifications when this
   *  login HITL-pauses. Falls through to program / org-default if null. */
  notification_slack_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginInput {
  name: string;
  url: string;
  /** Required: browser-script ID that verifies the login state. */
  verify_script_id: string;
}

/** Patch payload for updateLogin.
 *   undefined → leave unchanged
 *   null      → explicitly clear (only for fields that allow clearing —
 *               verify_script_id does NOT allow null, the API rejects it)
 *   <uuid>    → set to that value
 *  (Credentials use the dedicated setLoginCredentials / clearLoginCredentials
 *   endpoints — never set them via patch since they need encryption.) */
export interface LoginPatch {
  name?: string;
  url?: string;
  auto_login_script_id?: string | null;
  /** Required field — can be replaced but not cleared. API rejects null. */
  verify_script_id?: string;
  /** undefined = leave alone, null = clear, string = set. Empty string is
   *  treated as null at the API call site. */
  notification_slack_channel_id?: string | null;
}

export interface VerifyResult {
  executionLogId: string;
}

/**
 * One row from the persistent login-run audit log. Covers every kind of
 * run that touches a login profile — manual login/logout from the Logins
 * page, the Verify button, the Test auto-login button, and the login
 * action inside an agent run (which carries an agent_execution_log_id so
 * the UI can deep-link back).
 */
export interface LoginRunAudit {
  id: string;
  kind: 'verify' | 'manual' | 'logout' | 'auto_test' | 'agent_login';
  status: 'executing' | 'completed' | 'failed' | 'aborted';
  /** Categorical sub-result, see backend service for the full list per-kind. */
  outcome: string | null;
  error_message: string | null;
  triggered_by_user_id: string | null;
  triggered_by_email: string | null;
  agent_execution_log_id: string | null;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

export async function listLogins(orgId: string): Promise<Login[]> {
  const res = await agentClient.get<Login[]>(`/api/admin/${orgId}/logins`);
  return res.data;
}

export async function getLogin(orgId: string, id: string): Promise<Login> {
  const res = await agentClient.get<Login>(`/api/admin/${orgId}/logins/${id}`);
  return res.data;
}

export async function createLogin(orgId: string, data: LoginInput): Promise<Login> {
  const res = await agentClient.post<Login>(`/api/admin/${orgId}/logins`, data);
  return res.data;
}

export async function updateLogin(orgId: string, id: string, data: LoginPatch): Promise<Login> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}`, data);
  return res.data;
}

export async function deleteLogin(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/logins/${id}`);
}

/**
 * Store (or replace) the login's auto-login credentials. The full
 * key-value object is encrypted as a single secret on the backend; the
 * API never echoes the values back. To "update" a credential, re-PUT the
 * full object — the system has no way to merge against unknown plaintext.
 */
export async function setLoginCredentials(orgId: string, id: string, credentials: Record<string, string>): Promise<Login> {
  const res = await agentClient.put<Login>(`/api/admin/${orgId}/logins/${id}/credentials`, { credentials });
  return res.data;
}

/** Drop the stored credentials. Auto-login attempts fall through to HITL. */
export async function clearLoginCredentials(orgId: string, id: string): Promise<Login> {
  const res = await agentClient.delete<Login>(`/api/admin/${orgId}/logins/${id}/credentials`);
  return res.data;
}

export async function verifyLogin(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/verify`);
  return res.data;
}

/** Start an interactive manual login — allocates a browser, navigates to the
 *  login URL, and pauses for the user.  Returns the execution log id to open
 *  in the noVNC dialog. */
export async function startLogin(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/login`);
  return res.data;
}

/** Start an interactive manual logout — same mechanics as startLogin but
 *  intended for the user to click "log out" in the app UI. When the user
 *  clicks Done, the now logged-out session state is persisted and the
 *  profile status flips to 'needs_login'. */
export async function startLogout(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/logout`);
  return res.data;
}

/** Operator-driven wipe of the persisted storage_state row, and —
 *  when a logId is supplied — the live browser session (cookies +
 *  localStorage) of an active HITL run too.
 *
 *  Two call sites:
 *   • Inside the HITL login dialog (Clear session button): pass logId
 *     so the live context gets wiped and the page reloads to logged-out.
 *   • Before starting a new login (Log In button on the Interactions /
 *     Logins list): omit logId. No browser slot exists yet — only the
 *     DB row needs zeroing so the next startLogin's slot allocation
 *     seeds from an empty state. Avoids the "stale cookies survive into
 *     a fresh manual login attempt" trap that required closing and
 *     reopening the browser.
 */
export async function clearLoginSession(
  orgId: string,
  id: string,
  logId?: string,
): Promise<{ liveCleared: boolean; dbCleared: boolean }> {
  const res = await agentClient.post<{ liveCleared: boolean; dbCleared: boolean }>(
    `/api/admin/${orgId}/logins/${id}/clear-session`,
    logId ? { logId } : {},
  );
  return res.data;
}

/**
 * Test the auto-login chain end-to-end — runs the same verify → script →
 * re-verify path the agent uses, but standalone (no HITL fallback). Lets
 * operators confirm a fresh credentials + script config works before
 * relying on it in production.
 *
 * Returns 400 from the API if auto-login isn't fully configured
 * (script + credentials both required).
 */
export async function testAutoLogin(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/test-auto-login`);
  return res.data;
}

export interface LoginRunsPage {
  rows: LoginRunAudit[];
  total: number;
  limit: number;
  offset: number;
}

/** Recent run-audit history for one login profile, newest first, paginated. */
export async function listLoginRuns(
  orgId: string,
  id: string,
  { limit = 10, offset = 0 }: { limit?: number; offset?: number } = {}
): Promise<LoginRunsPage> {
  const res = await agentClient.get<LoginRunsPage>(`/api/admin/${orgId}/logins/${id}/runs`, {
    params: { limit, offset },
  });
  return res.data;
}
