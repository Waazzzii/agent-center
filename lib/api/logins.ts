import agentClient from './agent-client';

export interface Login {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  verify_text: string;
  browser_session_id: string | null;
  /** Any time we ran a verify (regardless of outcome). */
  last_checked_at: string | null;
  /** Last time the session was confirmed / refreshed valid. */
  last_logged_in_at: string | null;
  status: 'valid' | 'needs_login' | 'unknown';
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
  verify_text: string;
}

/** Patch payload for updateLogin. auto_login_script_id semantics:
 *   undefined → leave unchanged
 *   null      → explicitly clear the script link
 *   <uuid>    → set to that script
 *  (Credentials use the dedicated setLoginCredentials / clearLoginCredentials
 *   endpoints — never set them via patch since they need encryption.) */
export interface LoginPatch {
  name?: string;
  url?: string;
  verify_text?: string;
  auto_login_script_id?: string | null;
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
