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
  /**
   * Where the 2FA code comes from.
   *   none  — no second factor
   *   totp  — generated from the enrolled authenticator secret
   *   slack — read from a Slack channel by matching mfa_code_regex against
   *           messages that arrive after the login attempt starts
   *
   * The script never knows the difference: it fills {{_mfa}} either way.
   */
  mfa_source: 'none' | 'totp' | 'slack';
  /** Channel to read codes from. Required when mfa_source is slack. */
  mfa_slack_channel_id: string | null;
  /** Extracts the code. Capture group 1 if present, else the whole match. */
  mfa_code_regex: string | null;
  /**
   * How long to wait for a Slack code before failing the login. Unlike TOTP a
   * Slack code does not exist until the site sends it, so waiting is inherent.
   */
  mfa_timeout_seconds: number;
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
  /** UUID of the encrypted TOTP (authenticator-app) seed in
   *  organization_secrets. Like credentials, the seed itself is NEVER
   *  returned by the API — `!!totp_secret_id` = "2FA is enrolled". When
   *  enrolled, a browser script can reference the reserved `{{_mfa}}`
   *  variable and the executor supplies a fresh code at run time instead
   *  of pausing for a human. */
  totp_secret_id: string | null;
  /** When the current TOTP seed was enrolled (or last re-enrolled). */
  totp_enrolled_at: string | null;
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
  mfa_source?: 'none' | 'totp' | 'slack';
  /** undefined = leave alone, null = clear, string = set. */
  mfa_slack_channel_id?: string | null;
  mfa_code_regex?: string | null;
  mfa_timeout_seconds?: number;
}

/** One message the pattern was tried against. Codes come back masked. */
export interface MfaTestMessage {
  ts: string;
  excerpt: string;
  matched: boolean;
  /** e.g. "48••••" — proves extraction worked without echoing a live code. */
  code_preview: string | null;
  code_length: number | null;
}

export interface MfaTestResult {
  ok: boolean;
  error?: string;
  scanned?: number;
  matched?: number;
  messages?: MfaTestMessage[];
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

/**
 * Try a code pattern against the channel's recent messages.
 *
 * Omit either argument to re-check what is already stored. Resolves even when
 * the pattern matched nothing — `ok` is about whether the CHECK ran, not about
 * whether it found a code, because "ran fine, matched nothing" is the most
 * useful answer this can give.
 */
export async function testLoginMfaPattern(
  orgId: string,
  id: string,
  opts?: { channelId?: string | null; pattern?: string | null },
): Promise<MfaTestResult> {
  try {
    const res = await agentClient.post<MfaTestResult>(
      `/api/admin/${orgId}/logins/${id}/mfa/test`,
      { channel_id: opts?.channelId ?? undefined, pattern: opts?.pattern ?? undefined },
    );
    return res.data;
  } catch (err: unknown) {
    const e = err as { response?: { data?: MfaTestResult } };
    return e.response?.data ?? { ok: false, error: 'Could not reach the channel' };
  }
}

export async function updateLogin(orgId: string, id: string, data: LoginPatch): Promise<Login> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}`, data);
  return res.data;
}

/** One agent action that depends on a login. */
export interface LoginUsageAction {
  action_id: string;
  agent_id: string;
  agent_name: string;
  action_type: string;
  order_index: number;
}

/**
 * What breaks if a login is removed.
 *
 * `blocking` is agent actions only. Scripts naming the login as their editor
 * default are reported too but do not block: that FK still nulls harmlessly,
 * whereas an agent action losing its login would send a run out
 * unauthenticated.
 */
export interface LoginUsage {
  actions: LoginUsageAction[];
  agent_count: number;
  agents: { id: string; name: string }[];
  scripts: { id: string; name: string }[];
  blocking: boolean;
}

export async function getLoginUsage(orgId: string, id: string): Promise<LoginUsage> {
  const res = await agentClient.get(`/api/admin/${orgId}/logins/${id}/usage`);
  return res.data;
}

/** Move every agent action off this login and onto another. */
export async function reassignLogin(
  orgId: string,
  id: string,
  toLoginId: string,
): Promise<{ moved: number; agent_ids: string[] }> {
  const res = await agentClient.post(`/api/admin/${orgId}/logins/${id}/reassign`, {
    to_login_id: toLoginId,
  });
  return res.data;
}

/**
 * Delete a login.
 *
 * Rejects with a 409 carrying { error, usage } while agent actions still point
 * at it — callers should render that usage and offer reassign rather than
 * jumping to force. force:true clears those bindings, which leaves the actions
 * running unauthenticated until they are repaired.
 */
export async function deleteLogin(orgId: string, id: string, opts?: { force?: boolean }): Promise<void> {
  await agentClient.delete(
    `/api/admin/${orgId}/logins/${id}${opts?.force ? '?force=true' : ''}`,
  );
}

/**
 * MERGE values into the login's auto-login credentials.
 *
 * Send only the keys you're changing — everything else is preserved
 * server-side. A key whose value is '' is treated as UNCHANGED, not
 * cleared: the UI can never display stored values, so every box renders
 * blank and blank-means-clear would wipe untouched credentials on save.
 * Use deleteLoginCredentialKey to remove one.
 *
 * Pass replace:true to overwrite the whole blob instead.
 */
export async function setLoginCredentials(
  orgId: string,
  id: string,
  credentials: Record<string, string>,
  opts?: { replace?: boolean },
): Promise<Login> {
  const res = await agentClient.put<Login>(
    `/api/admin/${orgId}/logins/${id}/credentials`,
    { credentials, ...(opts?.replace ? { replace: true } : {}) },
  );
  return res.data;
}

/**
 * The NAMES of the stored credentials — never the values.
 *
 * Drives the per-key "Set / Not set" indicator. Safe to expose: the names
 * are already visible as {{variables}} in the login script.
 */
export async function getLoginCredentialKeys(orgId: string, id: string): Promise<string[]> {
  const res = await agentClient.get<{ keys: string[] }>(
    `/api/admin/${orgId}/logins/${id}/credentials/keys`,
  );
  return res.data.keys ?? [];
}

/** Remove ONE stored credential, leaving the rest intact. */
export async function deleteLoginCredentialKey(orgId: string, id: string, key: string): Promise<Login> {
  const res = await agentClient.delete<Login>(
    `/api/admin/${orgId}/logins/${id}/credentials/${encodeURIComponent(key)}`,
  );
  return res.data;
}

/** Drop the stored credentials. Auto-login attempts fall through to HITL. */
export async function clearLoginCredentials(orgId: string, id: string): Promise<Login> {
  const res = await agentClient.delete<Login>(`/api/admin/${orgId}/logins/${id}/credentials`);
  return res.data;
}

/** Partial live code returned by previewLoginTotp — confirms enrollment. */
export interface TotpPreview {
  /**
   * The LAST 3 DIGITS of the current code — never the whole thing.
   *
   * Enough to confirm the stored secret matches your authenticator app,
   * not enough to authenticate with. The code is only ever meant to be used
   * by the login script via `{{_mfa}}`, never typed by a human, so the full
   * value is truncated on the server and never crosses the wire.
   */
  code_suffix: string;
  seconds_remaining: number;
  period: number;
  /** Total length of the real code, so the UI can mask the right amount. */
  digits: number;
  issuer: string | null;
  account: string | null;
  algorithm: string | null;
}

/**
 * Enroll (or re-enroll) the login's authenticator (TOTP) seed.
 *
 * `input` is whatever the operator pasted — a full `otpauth://` URI or the
 * raw base32 setup key shown next to the site's QR code. The backend parses
 * both and rejects a malformed key with a 400 whose message names the
 * problem, so surface `error` directly to the operator.
 *
 * Like credentials, the seed is write-only: the API never echoes it back.
 */
export async function setLoginTotp(orgId: string, id: string, input: string): Promise<Login> {
  const res = await agentClient.put<Login>(`/api/admin/${orgId}/logins/${id}/totp`, { input });
  return res.data;
}

/** Un-enroll 2FA. A 2FA-protected site falls back to manual HITL login. */
export async function clearLoginTotp(orgId: string, id: string): Promise<Login> {
  const res = await agentClient.delete<Login>(`/api/admin/${orgId}/logins/${id}/totp`);
  return res.data;
}

/**
 * Fetch the last 3 digits of the current code, so the operator can confirm
 * the stored secret matches their authenticator app.
 *
 * Truncated server-side on purpose: the seed never reaches the browser, and
 * neither does a usable code. Throws (409) when nothing is enrolled.
 */
export async function previewLoginTotp(orgId: string, id: string): Promise<TotpPreview> {
  const res = await agentClient.post<TotpPreview>(`/api/admin/${orgId}/logins/${id}/totp/preview`);
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

/**
 * Slack channels the connector can see, for the 2FA channel picker.
 *
 * Resolves to [] rather than throwing when Slack is not connected — the picker
 * falls back to a raw channel-ID field, which is worse but not a dead end.
 */
export async function listSlackChannels(
  orgId: string,
): Promise<{ id: string; name: string; is_private: boolean; is_member: boolean | null }[]> {
  try {
    const res = await agentClient.get<{ channels: { id: string; name: string; is_private: boolean; is_member: boolean | null }[] }>(
      `/api/admin/${orgId}/slack/channels`,
    );
    return res.data.channels ?? [];
  } catch {
    return [];
  }
}
