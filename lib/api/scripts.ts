import agentClient from './agent-client';
import { type Tag, tagFilterParams } from './tags';

export interface SelectorCandidate {
  /** CSS selector, XPath expression, or plain text depending on `type` */
  sel: string;
  /** How this candidate was derived */
  type: 'id' | 'data-testid' | 'data-test-id' | 'data-cy' | 'data-qa' | 'data-id' | 'data-e2e'
      | 'name' | 'aria-label' | 'placeholder' | 'input-compound' | 'href'
      | 'text' | 'css-path' | 'xpath' | string;
}

export interface ElementSnapshot {
  tag: string;
  id: string | null;
  name: string | null;
  type: string | null;
  classes: string[];
  placeholder: string | null;
  ariaLabel: string | null;
  ariaRole: string | null;
  href: string | null;
  innerText: string;
  /** Ranked selector candidates — highest confidence first */
  candidates: SelectorCandidate[];
}

export interface RecordedStep {
  action: 'navigate' | 'click' | 'fill' | 'select' | 'press_key' | 'extract' | 'switch_tab' | 'close_tab' | 'wait_for' | 'wait_for_tab' | 'pause';
  /** Optional user-supplied label. When set, the step list and edit
   *  modal show this instead of the auto-generated stepLabel. Lets
   *  operators give meaningful names like "Open contract form" instead
   *  of "Click: button.submit-contract". Empty / unset → fall back to
   *  the auto label. */
  name?: string;
  /** For wait_for_tab steps: which tab event to wait for. */
  tab_action?: 'open';
  url?: string;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  field_name?: string;
  tab_index?: number;
  /** For wait_for steps: optional timeout override in ms */
  timeout?: number;
  /** For wait_for steps: which DOM state to wait for.
   *  - 'visible' (default) — element appears AND becomes visible.
   *    Tries selector candidates, falls back through the ranked list.
   *  - 'hidden' — element is missing OR not visible (display:none,
   *    visibility:hidden, detached). Use to wait for a drawer/modal
   *    to close before proceeding.
   *  - 'detached' — strictest: element is fully removed from the DOM. */
  wait_state?: 'visible' | 'hidden' | 'detached';
  /** For pause steps: how long to sleep before the next step. Capped
   *  worker-side at 5 minutes (300_000ms). Positive integer or omitted. */
  duration_ms?: number;
  /**
   * When the recorded interaction happened inside an iframe, the CSS
   * selector that picks out the iframe in the parent document. At
   * replay time the worker uses `page.frameLocator(frame_selector)` to
   * scope `selector` resolution to the right document. Unset / empty
   * means the step targets the top-level page (default).
   */
  frame_selector?: string;
  /** Rich element snapshot captured at recording time; used for robust replay */
  elementSnapshot?: ElementSnapshot;
  /**
   * What this step waits for before executing.
   * One best selector + a human-readable label.
   * (Old scripts may still have legacy fields — worker JS handles them gracefully.)
   */
  waitFor?: {
    selector?: string | null;
    description?: string | null;
  };
  /** Human-readable label for what this step waits for. Computed server-side via annotateStep(). */
  _waitLabel?: string | null;
  /** Original literal value before auto-parameterization (used as test default). */
  _defaultValue?: string;
  /** Set to true after the step has been successfully executed during testing. */
  _tested?: boolean;
  /** URL extraction config — only set when selector === '__url__'. */
  url_extraction?: {
    method: 'query_param' | 'path_segment' | 'url_match';
    /** Query parameter name (method=query_param) */
    param_name?: string;
    /** Path segment index, 0-based (method=path_segment) */
    path_index?: number;
    /** Literal value to find in the URL (method=url_match) */
    match_value?: string;
  };
}

export interface BrowserSession {
  sessionId: string;
  orgId: string;
  viewerUrl: string;
  lastActivity: string;
  createdAt: string;
  idleExpiresAt: string;
}

export interface BrowserScript {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  steps: RecordedStep[];
  /** Variable name → recording-time default. E.g. { "email": "user@example.com" } */
  parameters: Record<string, string>;
  /** Variable name → latest test value (persisted across sessions). */
  test_values: Record<string, string>;
  /**
   * Optional FK to agent_logins.id — the login profile whose authenticated
   * session this script needs. When set:
   *   • The agent executor seeds the script's browser context from this
   *     login's storage_state (regardless of agent step ordering).
   *   • The script editor offers an in-window "Log in" button that runs
   *     the linked login's auto-login script in the test session.
   *   • Adding this script as an agent action auto-adds a paired login step.
   */
  login_id: string | null;
  created_at: string;
  updated_at: string;
  /** Tags applied to this script. Present on list/get/create/update responses. */
  tags?: Tag[];
}

// ─── Recording ────────────────────────────────────────────────

export async function startRecording(
  orgId: string,
  startUrl?: string,
  sessionId?: string,
  browserClientId?: string,
): Promise<{ recordingId: string; viewerUrl: string }> {
  const res = await agentClient.post<{ recordingId: string; viewerUrl: string }>(
    `/api/admin/${orgId}/record/start`,
    {
      ...(startUrl ? { start_url: startUrl } : {}),
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(browserClientId ? { browser_client_id: browserClientId } : {}),
    }
  );
  return res.data;
}

export async function getRecordingSteps(
  orgId: string,
  recordingId: string
): Promise<{ steps: RecordedStep[] }> {
  const res = await agentClient.get<{ steps: RecordedStep[] }>(
    `/api/admin/${orgId}/record/${recordingId}/steps`
  );
  return res.data;
}

export async function stopRecording(
  orgId: string,
  recordingId: string
): Promise<{ steps: RecordedStep[] }> {
  const res = await agentClient.post<{ steps: RecordedStep[] }>(
    `/api/admin/${orgId}/record/${recordingId}/stop`
  );
  return res.data;
}

export async function cancelRecording(
  orgId: string,
  recordingId: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/record/${recordingId}`);
}

// ─── Scripts ──────────────────────────────────────────────────

export async function listScripts(
  orgId: string,
  opts?: { tagIds?: string[]; tagMatch?: 'any' | 'all' },
): Promise<{ scripts: BrowserScript[] }> {
  const res = await agentClient.get<{ scripts: BrowserScript[] }>(
    `/api/admin/${orgId}/scripts`,
    { params: tagFilterParams(opts?.tagIds ?? [], opts?.tagMatch) }
  );
  return res.data;
}

export async function createScript(
  orgId: string,
  data: {
    name: string;
    description?: string;
    steps: RecordedStep[];
    parameters: Record<string, string>;
    test_values?: Record<string, string>;
    /** Optional login profile to link at creation time (record-mode "Build with login"). */
    login_id?: string | null;
    tag_ids?: string[];
  }
): Promise<BrowserScript> {
  const res = await agentClient.post<BrowserScript>(
    `/api/admin/${orgId}/scripts`,
    data
  );
  return res.data;
}

export async function updateScript(
  orgId: string,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    steps: RecordedStep[];
    parameters: Record<string, string>;
    test_values: Record<string, string>;
    /** Pass a uuid to set, null to clear the link. Omit to leave unchanged. */
    login_id: string | null;
    /** Replace the script's tag set. Omit to leave unchanged. */
    tag_ids: string[];
  }>
): Promise<BrowserScript> {
  const res = await agentClient.patch<BrowserScript>(
    `/api/admin/${orgId}/scripts/${id}`,
    data
  );
  return res.data;
}

export async function deleteScript(
  orgId: string,
  id: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/scripts/${id}`);
}

export async function runScript(
  orgId: string,
  id: string,
  params: Record<string, string>
): Promise<{ ok: boolean; steps_run: number; screenshot?: string }> {
  const res = await agentClient.post<{ ok: boolean; steps_run: number; screenshot?: string }>(
    `/api/admin/${orgId}/scripts/${id}/run`,
    { params }
  );
  return res.data;
}

// ─── Browser Sessions ──────────────────────────────────────────

export async function createBrowserSession(
  orgId: string,
  startUrl?: string
): Promise<{ sessionId: string; viewerUrl: string }> {
  const res = await agentClient.post(`/api/admin/${orgId}/browser-sessions`, {
    start_url: startUrl,
  });
  return res.data;
}

export async function listBrowserSessions(
  orgId: string
): Promise<{ sessions: BrowserSession[] }> {
  const res = await agentClient.get(`/api/admin/${orgId}/browser-sessions`);
  return res.data;
}

export async function touchBrowserSession(
  orgId: string,
  sessionId: string
): Promise<void> {
  await agentClient.post(`/api/admin/${orgId}/browser-sessions/${sessionId}/touch`);
}

export async function destroyBrowserSession(
  orgId: string,
  sessionId: string
): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/browser-sessions/${sessionId}`);
}

export async function getScript(orgId: string, id: string): Promise<BrowserScript> {
  const res = await agentClient.get<BrowserScript>(`/api/admin/${orgId}/scripts/${id}`);
  return res.data;
}

// ─── Step Runs ────────────────────────────────────────────────

export interface StepRun {
  runId: string;
  currentIndex: number;
  totalSteps: number;
  step: RecordedStep | null;
  steps: RecordedStep[];
  extracted: Record<string, string>;
  lastScreenshot: string | null;
  /** Current page URL — used by "Extract from URL" to auto-detect query/path params. */
  pageUrl?: string | null;
  status: 'waiting' | 'running' | 'done' | 'error' | 'provisioning';
  /** Live steps captured during active recording (polled in real-time). */
  recordedSteps?: RecordedStep[];
  recordingActive?: boolean;
}

/** Returned (HTTP 202) when a browser VM needs to be provisioned first. */
export interface StepRunProvisioning {
  runId: string;
  status: 'provisioning';
}

export interface StepRunReady {
  status?: never;
  runId: string;
  currentIndex: number;
  totalSteps: number;
  step: RecordedStep | null;
  viewerUrl: string;
}

export async function startStepRun(
  orgId: string,
  scriptId: string,
  params: Record<string, string> = {},
  sessionId?: string,
  browserClientId?: string | null,
): Promise<StepRunProvisioning | StepRunReady> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/scripts/${scriptId}/step-run`,
    {
      params,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(browserClientId ? { browser_client_id: browserClientId } : {}),
    }
  );
  return res.data;
}

export async function getStepRun(orgId: string, runId: string): Promise<StepRun> {
  const res = await agentClient.get<StepRun>(`/api/admin/${orgId}/step-runs/${runId}`);
  return res.data;
}

/**
 * Run every remaining step server-side in one HTTP request, matching
 * agent-runtime pacing (no inter-step network latency). Long-running —
 * the request stays open until the script completes, fails, or is
 * interrupted. UI should poll getStepRun() in parallel for live
 * progress updates.
 */
export async function runRemainingStepsAgentMode(
  orgId: string,
  runId: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ done: boolean; currentIndex: number; totalSteps: number; step: RecordedStep | null; screenshot: string; extracted: Record<string, string>; executedStep?: RecordedStep; pageUrl?: string | null; interrupted?: boolean }> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/run-remaining`,
    params ? { params } : undefined,
    { signal, timeout: 15 * 60 * 1000 },
  );
  return res.data;
}

export async function executeStepRunStep(
  orgId: string,
  runId: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ done: boolean; currentIndex: number; totalSteps: number; step: RecordedStep | null; screenshot: string; extracted: Record<string, string>; executedStep?: RecordedStep; pageUrl?: string | null; interrupted?: boolean }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/execute`, params ? { params } : undefined, { signal });
  return res.data;
}

/**
 * Interrupt the in-flight step on the worker. Sibling to executeStepRunStep
 * — operator's Stop button fires this so the running step gives up its
 * Playwright primitive and the session state flips back to "waiting" so
 * the operator can click another step right away (vs the old behavior:
 * worker keeps running the orphan action, session locks up until
 * timeout).
 */
export async function interruptStepRun(
  orgId: string,
  runId: string,
): Promise<{ interrupted: boolean; status?: string; reason?: string }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/interrupt`);
  return res.data;
}

export async function retryStepRunStep(
  orgId: string,
  runId: string,
  replacementStep?: RecordedStep
): Promise<{ currentIndex: number; totalSteps: number; step: RecordedStep; screenshot: string; extracted: Record<string, string> }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/retry`, {
    ...(replacementStep ? { step: replacementStep } : {}),
  });
  return res.data;
}

export async function updateStepRunStep(
  orgId: string,
  runId: string,
  step: Partial<RecordedStep>
): Promise<StepRun> {
  const res = await agentClient.patch<StepRun>(
    `/api/admin/${orgId}/step-runs/${runId}/step`,
    { step }
  );
  return res.data;
}

export async function deleteStepRunStep(
  orgId: string,
  runId: string,
  stepIndex: number,
): Promise<StepRun> {
  const res = await agentClient.delete<StepRun>(
    `/api/admin/${orgId}/step-runs/${runId}/steps/${stepIndex}`
  );
  return res.data;
}

export async function jumpStepRunToIndex(
  orgId: string,
  runId: string,
  targetIndex: number
): Promise<{ currentIndex: number; totalSteps: number; step: RecordedStep | null; screenshot: string; extracted: Record<string, string> }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/jump`, { targetIndex });
  return res.data;
}

export async function abortStepRun(orgId: string, runId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/step-runs/${runId}`);
}

/** Sync the full step list to the worker after local edits (insert, reorder, delete). */
export async function syncStepRunSteps(orgId: string, runId: string, steps: RecordedStep[]): Promise<StepRun> {
  const res = await agentClient.put<StepRun>(`/api/admin/${orgId}/step-runs/${runId}/steps`, { steps });
  return res.data;
}

export async function startStepRunRecording(orgId: string, runId: string): Promise<StepRun & { recordingActive: boolean }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/record-start`);
  return res.data;
}

/**
 * Trigger the script's linked login's auto-login flow inside the editor's
 * current browser session. Doesn't disturb the recorded steps — only sets
 * cookies/localStorage so subsequent step tests run authenticated.
 * Backend resolves credentials + auto-login script from script.login_id.
 */
export async function runLinkedLoginInStepRun(
  orgId: string,
  runId: string,
  scriptId: string,
): Promise<{ ok: true; login_name: string; steps_run: number }> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/run-linked-login`,
    { script_id: scriptId },
    { timeout: 5 * 60 * 1000 }, // matches the worker's 5-min budget
  );
  return res.data;
}

/**
 * Distinct-agent count for a script — drives the "This script is used
 * by N agents. Continue?" confirm before propagating a login change.
 */
export async function getScriptAgentUsage(
  orgId: string,
  scriptId: string,
): Promise<{ count: number }> {
  const res = await agentClient.get(`/api/admin/${orgId}/scripts/${scriptId}/agent-usage`);
  return res.data;
}

/**
 * Returns the count of logins that reference this script in each role:
 *   - verify     — how many logins use it as their verify script
 *   - auto_login — how many use it as their auto-login script
 *
 * If either count > 0, the script CANNOT be deleted (FK is ON DELETE
 * RESTRICT in the DB). Use this to gate the delete UI and show a
 * "in use by N logins" warning before the operator clicks Delete.
 */
export async function getScriptLoginUsage(
  orgId: string,
  scriptId: string,
): Promise<{ verify: number; auto_login: number }> {
  const res = await agentClient.get(`/api/admin/${orgId}/scripts/${scriptId}/login-usage`);
  return res.data;
}

/**
 * Insert / replace / remove the paired login step on every agent that
 * currently uses this script. login_id=null clears the pairing on all
 * agents. Idempotent.
 */
export async function propagateScriptLogin(
  orgId: string,
  scriptId: string,
  loginId: string | null,
): Promise<{
  agents_touched: number;
  actions_added: number;
  actions_removed: number;
  affected_agent_ids: string[];
}> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/scripts/${scriptId}/propagate-login`,
    { login_id: loginId },
  );
  return res.data;
}

export async function stopStepRunRecording(
  orgId: string,
  runId: string
): Promise<StepRun & { recordingActive: boolean; insertedCount: number; insertedStart: number | null }> {
  const res = await agentClient.post(`/api/admin/${orgId}/step-runs/${runId}/record-stop`);
  return res.data;
}

/**
 * Inject the wait-for element picker overlay onto the live browser page.
 * Blocks (up to ~30s) until the user clicks an element or presses Esc.
 * Pass an AbortSignal to cancel from the UI side.
 */
export async function captureStepRunWaitFor(
  orgId: string,
  runId: string,
  signal?: AbortSignal
): Promise<{ selector: string; description: string | null; elementSnapshot?: ElementSnapshot }> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/capture-wait-for`,
    {},
    { signal, timeout: 35_000 }
  );
  return res.data;
}

/**
 * Cancel an in-progress wait-for capture (e.g. user dismissed the dialog).
 */
export async function cancelStepRunWaitForCapture(orgId: string, runId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/step-runs/${runId}/capture-wait-for`).catch(() => {});
}

/**
 * Inject the extract element picker overlay onto the live browser page.
 * Blocks (up to ~30s) until the user clicks an element or presses Esc.
 */
export async function captureStepRunExtract(
  orgId: string,
  runId: string,
  signal?: AbortSignal
): Promise<{ selector: string; description: string | null; value: string; elementSnapshot?: ElementSnapshot }> {
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/capture-extract`,
    {},
    { signal, timeout: 35_000 }
  );
  return res.data;
}

/**
 * Cancel an in-progress extract capture.
 */
export async function cancelStepRunExtractCapture(orgId: string, runId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/step-runs/${runId}/capture-extract`).catch(() => {});
}
