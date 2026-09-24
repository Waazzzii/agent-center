import agentClient from './agent-client';

export interface Login {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  /** @deprecated — the column still exists in the DB until a future migration
   *  drops it. Nothing reads it. */
  verify_text: string;
  /**
   * Where the 2FA code comes from.
   *   none  — no second factor
   *   totp  — generated from the enrolled authenticator secret
   *   slack — read from a Slack channel by matching mfa_code_regex against
   *           messages that arrive after the login attempt starts
   *
   * The script never knows the difference: it fills {{_mfa}} either way.
   */
  mfa_source: 'none' | 'totp' | 'slack' | 'gmail';
  /** Channel to read codes from. Required when mfa_source is slack. */
  mfa_slack_channel_id: string | null;
  /**
   * Mailbox whose inbox holds the codes. Required when mfa_source is gmail.
   *
   * Two fields where Slack needs one, because Gmail authenticates by
   * impersonating a NAMED mailbox rather than as an org-level bot — there is no
   * "the org's Gmail" to read. This is the impersonation subject.
   */
  mfa_gmail_mailbox: string | null;
  /**
   * Gmail search syntax narrowing to the sender that issues codes, e.g.
   * `from:noreply@vendor.com`. Distinct from mfa_code_regex: the query picks
   * the MESSAGE server-side, the regex extracts the CODE from its text.
   */
  mfa_gmail_query: string | null;
  /** Extracts the code. Capture group 1 if present, else the whole match. */
  mfa_code_regex: string | null;
  /**
   * How long to wait for a Slack code before failing the login. Unlike TOTP a
   * Slack code does not exist until the site sends it, so waiting is inherent.
   */
  mfa_timeout_seconds: number;
  browser_session_id: string | null;
  /** Any time a run reported on this login's state, either outcome. */
  last_checked_at: string | null;
  /** Last time the session was confirmed / refreshed valid. */
  last_logged_in_at: string | null;
  // Login profile status lifecycle:
  //   valid       — a script ran against this session and its
  //                 login_indicator step passed, or a sign-in just
  //                 completed.
  //   needs_login — a sign-in was needed and automation could not
  //                 finish it, so a human has to use "Log In".
  //   unknown     — nothing has reported on it yet.
  //
  // There is no 'verifying'. A manual Done marks the login valid in the same
  // request and nothing runs behind it, so the state had nothing left to
  // describe. Checked before removing: no row in dev or prod carries it.
  status: 'valid' | 'needs_login' | 'unknown';
  /** Browser script that signs this login in. Runs when a script's
   *  login_indicator step fails. Only attempted when BOTH this AND
   *  credentials_secret_id are set; otherwise the run parks for a human. */
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
  /**
   * POOLING. A login can stand for several interchangeable browsers.
   *
   * A member is an ordinary login row whose pool_parent_id points at the
   * login it stands in for. It shares the parent's url and scripts (the
   * backend keeps those in step) but has its OWN profile directory, which is
   * the entire point: one profile dir means one Chrome, one X display and one
   * viewer, so without members two concurrent runs on a login share a screen
   * and an operator cannot tell their window from an agent's.
   *
   * null on a parent and on any login that has not opted in. Nesting is one
   * level only — a member can never itself be a parent.
   */
  pool_parent_id: string | null;
  /** How many browsers this login may have at once. 1 = not pooled. Always
   *  1 on a member; the cap lives on the parent. */
  max_browsers: number;
  /** Whether the pool may mint a new member on demand up to max_browsers. */
  pool_autogrow: boolean;
  /**
   * Pool parent only — read it off the parent, never a member. true: every
   * browser uses this login's credentials, TOTP and MFA settings, and they are
   * edited on Browser 1 only. false: each browser has its own.
   *
   * Also decides sign-in concurrency: shared credentials sign in one browser
   * at a time (one account, one MFA code); separate ones in parallel.
   */
  pool_shared_credentials: boolean;
  /** Pool member only: when the pool was scaled down past this browser. It
   *  takes no new runs and is deleted once its current run lets go. */
  pool_removing_at: string | null;
  /**
   * PROXY. Whether this login goes out through the org's dedicated proxy, and
   * which of its IPs.
   *
   * `proxy_enabled` is login-level: every browser in a pool follows the parent.
   * `proxy_ip_id` follows the pool's CREDENTIAL MODE, like credentials do — in
   * a shared pool every browser is on the login's IP (one account, one home);
   * in a separate pool each browser chooses its own. Any number of logins may
   * share an IP.
   */
  proxy_enabled: boolean;
  proxy_ip_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A name is all it takes. The sign-in URL comes from the login script's first
 * navigate step, read at the moment a manual sign-in needs it, so it is not
 * stored on the login and not asked for here.
 */
export interface LoginInput {
  name: string;
}

/** Patch payload for updateLogin.
 *   undefined → leave unchanged
 *   null      → explicitly clear
 *   <uuid>    → set to that value
 *  (Credentials use the dedicated setLoginCredentials / clearLoginCredentials
 *   endpoints — never set them via patch since they need encryption.) */
export interface LoginPatch {
  name?: string;
  auto_login_script_id?: string | null;
  /** undefined = leave alone, null = clear, string = set. Empty string is
   *  treated as null at the API call site. */
  notification_slack_channel_id?: string | null;
  mfa_source?: 'none' | 'totp' | 'slack' | 'gmail';
  /** undefined = leave alone, null = clear, string = set. */
  mfa_slack_channel_id?: string | null;
  mfa_gmail_mailbox?: string | null;
  mfa_gmail_query?: string | null;
  mfa_code_regex?: string | null;
  mfa_timeout_seconds?: number;
}

/** One message the pattern was tried against. Codes come back masked. */
export interface MfaTestMessage {
  /** Slack's message timestamp. Absent for Gmail, which identifies by id. */
  ts?: string;
  /** Gmail's message id. Absent for Slack. */
  id?: string;
  /** Gmail only — helps confirm the QUERY picked the right sender. */
  from?: string;
  subject?: string;
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
 * Copy a login's configuration to a new row: script, 2FA wiring, notification
 * channel, access groups.
 *
 * NOT copied — credentials, the authenticator seed, and the Chrome profile.
 * Those are the identity rather than the configuration, and sharing them
 * between two rows means a delete or a logout on either takes out both. The
 * copy starts signed-out with no credentials on file.
 *
 * The 2FA METHOD comes across, including 'totp' — the type was never in
 * question, only the secret behind it. `warning` is set in that case, because
 * the copy then says "authenticator" with nothing enrolled yet. Slack and Gmail
 * copy whole: a channel, a query and a regex are configuration, not secrets.
 */
export async function duplicateLogin(orgId: string, id: string): Promise<Login & { warning?: string }> {
  const res = await agentClient.post<Login & { warning?: string }>(
    `/api/admin/${orgId}/logins/${id}/duplicate`,
  );
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

/**
 * Try a query + pattern against the mailbox's recent messages.
 *
 * Same contract as the Slack test — `ok` is about whether the CHECK ran, not
 * whether it found a code. Reports `scanned` separately from `matched` because
 * Gmail has two things that can be wrong: a query that selects no messages looks
 * identical to a pattern that matches none of them.
 */
export async function testLoginGmailMfaPattern(
  orgId: string,
  id: string,
  opts?: { mailbox?: string | null; query?: string | null; pattern?: string | null },
): Promise<MfaTestResult> {
  try {
    const res = await agentClient.post<MfaTestResult>(
      `/api/admin/${orgId}/logins/${id}/mfa/gmail/test`,
      {
        mailbox: opts?.mailbox ?? undefined,
        query: opts?.query ?? undefined,
        pattern: opts?.pattern ?? undefined,
      },
    );
    return res.data;
  } catch (err: unknown) {
    const e = err as { response?: { data?: MfaTestResult } };
    return e.response?.data ?? { ok: false, error: 'Could not reach the mailbox' };
  }
}

/**
 * A save that succeeded but left the login inconsistent with its script comes
 * back with `warning` alongside the row — currently only for turning 2FA off
 * while the script still fills {{_mfa}}. It is not an error: the write landed.
 */
export type LoginWithWarning = Login & { warning?: string };

export async function updateLogin(orgId: string, id: string, data: LoginPatch): Promise<LoginWithWarning> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}`, data);
  return res.data;
}

/**
 * How many browsers a login may use at once. Applies to the whole pool,
 * whichever browser's id is passed — the backend routes it to the parent.
 * Raising it does not create browsers; they are added as concurrent runs need
 * them. Lowering it below the number in use is refused (409) with a message
 * that says what to remove.
 */
/** What a pool-size change did, by browser position (Browser 2 = 2). */
export interface PoolSizeResult {
  id: string;
  name: string;
  max_browsers: number;
  /** Idle, so deleted straight away. */
  removed: number[];
  /** In use: finishes its current run, then is deleted. */
  draining: number[];
  /** Was being removed; raising the size put it back in service. */
  restored: number[];
}

export async function setPoolSize(
  orgId: string, id: string, maxBrowsers: number,
): Promise<PoolSizeResult> {
  const res = await agentClient.patch(`/api/admin/${orgId}/logins/${id}/pool`, { max_browsers: maxBrowsers });
  return res.data;
}

/**
 * Switch a pool between one shared set of credentials and one per browser.
 * Applies to the whole pool whichever browser's id is passed.
 *
 * Going SEPARATE copies Browser 1's credentials into each browser as its own
 * record, so nothing stops working. Going SHARED deletes every browser's own
 * credentials and TOTP — confirm with the user first.
 */
export async function setPoolCredentialMode(orgId: string, id: string, shared: boolean): Promise<Login> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}/pool/credentials`, { shared });
  return res.data;
}

/**
 * How many browsers would lose credentials that DIFFER from Browser 1's if the
 * pool went shared. 0 means switching is lossless — e.g. undoing an accidental
 * uncheck, where every browser only holds a copy of Browser 1's. Returns a
 * count only; no secret value ever reaches the browser.
 */
export async function previewPoolCredentialMode(
  orgId: string, id: string,
): Promise<{ browsers: number; wouldDiscard: number }> {
  const res = await agentClient.get(`/api/admin/${orgId}/logins/${id}/pool/credentials/preview`);
  return res.data;
}

export interface LoginProxyPatch {
  enabled?: boolean;
  /** One of the org's discovered IPs. null unassigns. */
  ip_id?: string | null;
}

/**
 * Proxy for a login. `enabled` applies to the whole pool; `ip_id` to the login
 * in a shared pool and to this browser in a separate one.
 */
export async function setLoginProxy(orgId: string, id: string, patch: LoginProxyPatch): Promise<Login> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}/proxy`, patch);
  return res.data;
}

/** One of the org's dedicated proxy IPs, as a login's picker shows it. */
export interface ProxyIpOption {
  id: string;
  ip: string;
  port: number;
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
  available: boolean;
  logins_using: number;
}

/**
 * Whether the org has a proxy account (set in Agent settings), and the IPs a
 * login can choose from. Never any credential.
 */
export async function getProxyAccountConfigured(orgId: string): Promise<{ configured: boolean; ips: ProxyIpOption[] }> {
  const res = await agentClient.get<{ configured: boolean; ips: ProxyIpOption[] }>(`/api/admin/${orgId}/proxy-account`);
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
 * Test the auto-login script with its stored credentials — the same path an
 * agent takes when a script's login_indicator step fails, but standalone (no
 * HITL fallback). Clears the stored session first, so the script is actually
 * exercised rather than skipped by an already-live one.
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
 * What Slack actually returned, so an EMPTY list can explain itself.
 *
 * An empty picker has two causes that look identical: the token could not SEE
 * private channels (no groups:read — Slack omits them silently rather than
 * erroring), or the bot is not a member of any channel it did see. Only the
 * counts separate them.
 */
export type SlackChannelMeta = {
  /** Rows Slack returned, before filtering. */
  returned: number;
  /** How many were private. Zero here points at the missing scope. */
  private: number;
  /** Survivors — channels the bot can actually read. */
  kept: number;
};

export type SlackChannelOption = {
  id: string; name: string; is_private: boolean; is_member: boolean | null;
};

/**
 * Slack channels the connector can see, for the 2FA channel picker.
 *
 * Returns the REASON alongside the list rather than collapsing everything to [].
 *
 * It used to return a bare array and swallow every failure into an empty one, so
 * "the workspace has no channels", "the connector is not enabled", "the token
 * could not be minted" and "Slack refused the scope" all rendered as the same
 * empty dropdown. The API reports the cause now; throwing it away here would
 * just move the silence one layer up.
 *
 * Still never throws — the picker keeps its paste-the-id fallback, which is
 * worse but not a dead end.
 */
export async function listSlackChannels(
  orgId: string,
): Promise<{ channels: SlackChannelOption[]; error: string | null; meta: SlackChannelMeta | null }> {
  try {
    const res = await agentClient.get<{
      channels?: SlackChannelOption[];
      error?: string;
      meta?: SlackChannelMeta;
    }>(
      `/api/admin/${orgId}/slack/channels`,
    );
    return {
      channels: res.data.channels ?? [],
      error: res.data.error ?? null,
      meta: res.data.meta ?? null,
    };
  } catch (err: any) {
    return {
      channels: [],
      meta: null,
      error: err?.response?.data?.error ?? err?.message ?? 'Could not reach the server',
    };
  }
}
