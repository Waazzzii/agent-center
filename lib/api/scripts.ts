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
  /**
   * Engine pauses for human approval before this step (submits / destructive
   * actions). Set by the AI refine pass; honored by the test replay's gate
   * handling and by the agent runtime.
   */
  requires_approval?: boolean;
  /**
   * Run this step only when its input has a value.
   *
   *   true       — derive the gating params from the {{params}} this step
   *                references
   *   ['vendor'] — these params, even if this step references none of them
   *
   * The named form is for dependent chains: opening a dropdown, waiting for
   * options and clicking one are three steps, only the last of which references
   * {{vendor}}. Skipping just that one leaves the dropdown open and breaks the
   * next field, so all three carry the same param.
   *
   * Absent or false means the step always runs. There is no script-level
   * default — a step states its own behaviour, and the editor has a bulk action
   * for setting it across every input-bearing step at once.
   */
  skip_if_empty?: boolean | string[];
  /**
   * Run this step only when the element is actually on the page.
   *
   *   true       — probe this step's own selector
   *   "<sel>"    — probe that selector instead
   *
   * A different question from skip_if_empty. That asks "do I have data for
   * this?"; this asks "is this part of the flow even here?" — the 2FA challenge
   * that shows on a new device but not a trusted one, a cookie banner that
   * appears once.
   *
   * Prefer it over allow_failure for an optional branch: allow_failure RUNS the
   * step and tolerates the error, so a {{_mfa}} fill would still wait out the
   * whole MFA timeout for a code nobody sent before failing.
   */
  skip_if_missing?: boolean | string;
  /**
   * Log and continue instead of failing the run.
   *
   * Deliberately separate from skip_if_empty: skip is decided BEFORE the step
   * from its inputs, this AFTER from the outcome. Using failure as a proxy for
   * absence would swallow a changed selector. Rejected on a requires_approval
   * step — continuing past a failed submit would report success for work that
   * never happened.
   */
  allow_failure?: boolean;
  /**
   * Display-only reliability annotation from the AI refine pass. Persisted
   * onto the step so the badge survives a save / reload. Not consumed by the
   * runtime — purely for the editor's at-a-glance review badges.
   */
  _reliability?: { tier: 'reliable' | 'review' | 'fragile'; risks: string[] };
}

export interface BrowserSession {
  sessionId: string;
  orgId: string;
  viewerUrl: string;
  lastActivity: string;
  createdAt: string;
  idleExpiresAt: string;
}

/**
 * What a script is FOR (migration 283). All three run through the identical
 * engine — this exists so each picker offers only what fits its slot.
 *
 * Do NOT confuse `kind` with `login_id`. `login_id` is the SESSION BINDING
 * (which login's authenticated session a script runs inside) and is routinely
 * set on `regular` scripts that operate behind a login.
 */
export type ScriptKind = 'regular' | 'login' | 'login_verify';

/** Short labels for the kind chip / column. */
export const SCRIPT_KIND_LABELS: Record<ScriptKind, string> = {
  regular:      'Script',
  login:        'Login',
  login_verify: 'Login check',
};

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
  /**
   * Whether this script can do its job at all without an authenticated
   * browser — a property of the SCRIPT, unlike login_id which is only the
   * editor default.
   *
   * The two are independent on purpose. A script shared across several
   * identities (eight markets, one scrape) sets requires_login = true and
   * leaves login_id NULL, because it has no single correct login. When true,
   * adding the script as an agent action requires choosing a login there —
   * and that per-action choice is what lets one script serve many identities
   * instead of being cloned per credential set.
   */
  requires_login: boolean;
  /**
   * What this script is for. 'login' and 'login_verify' belong to a login
   * profile: they're edited from that login's page and hidden from the
   * general Scripts list and the agent action picker.
   */
  kind: ScriptKind;
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

/**
 * List browser scripts.
 *
 * `kinds` filters by what a script is FOR. Omit it and every kind comes
 * back, so no caller loses rows by forgetting to pass it. Each picker opts
 * in to the kinds that make sense in its slot:
 *   - Scripts list, agent action picker  → ['regular']
 *   - A login's auto-login slot          → ['login']
 *   - A login's verify slot              → ['login_verify']
 */
export async function listScripts(
  orgId: string,
  opts?: { tagIds?: string[]; tagMatch?: 'any' | 'all'; kinds?: ScriptKind[] },
): Promise<{ scripts: BrowserScript[] }> {
  const res = await agentClient.get<{ scripts: BrowserScript[] }>(
    `/api/admin/${orgId}/scripts`,
    {
      params: {
        ...tagFilterParams(opts?.tagIds ?? [], opts?.tagMatch),
        ...(opts?.kinds?.length ? { kinds: opts.kinds.join(',') } : {}),
      },
    }
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
    /**
     * Omit for 'regular'. Recording launched from a login profile's
     * auto-login or verify slot passes the matching kind, so the new script
     * appears in the picker that asked for it.
     */
    kind?: ScriptKind;
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
    /**
     * Toggle whether the script needs an authenticated browser. Independent of
     * login_id: clearing the editor default must not also declare that the
     * script stopped needing auth.
     */
    requires_login: boolean;
    /** Reclassify the script. Omit to leave unchanged. */
    kind: ScriptKind;
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

// ─── AI Refine ─────────────────────────────────────────────────

export interface RefineReport {
  overall: 'reliable' | 'review' | 'fragile';
  summary: string;
  /** Plain-English narration of the overall approach / judgment calls. */
  notes?: string;
  steps: Array<{ index: number; name: string; reliability: 'reliable'|'review'|'fragile'; risks: string[]; requires_approval: boolean; change?: string }>;
}
export interface RefineResult { steps: RecordedStep[]; parameters: Record<string,string>; report: RefineReport; }
/** One narration event from the streaming refine pass. */
export type RefineStreamEvent =
  | { type: 'step'; index: number; name: string | null; action: string | null; dropped?: boolean }
  | { type: 'done'; result: RefineResult }
  | { type: 'error'; error: string };

/**
 * Refine a script, narrating each step as the model emits it.
 *
 * Uses fetch + a stream reader rather than EventSource because the step list
 * has to go up in the request body. The connection lives exactly as long as
 * the pass: it opens here and closes on `done` / `error`, so there is no
 * idle stream and nothing to poll. Aborting `signal` drops the socket, which
 * the server sees as a close and stops writing.
 *
 * Falls back to nothing clever on failure — the caller keeps the raw
 * recording, same as the non-streaming path.
 */
export async function refineScriptStream(
  orgId: string,
  body: {
    steps: RecordedStep[];
    target_indices?: number[];
    instruction?: string;
    context?: { start_url?: string; parameters?: Record<string, string> };
  },
  onEvent: (ev: RefineStreamEvent) => void,
  signal?: AbortSignal,
): Promise<RefineResult> {
  const res = await fetch(`/api/agent/api/admin/${orgId}/scripts/refine/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Refine stream failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let final: RefineResult | null = null;
  let failure: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line. Keep the trailing partial.
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev: RefineStreamEvent;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      onEvent(ev);
      if (ev.type === 'done') final = ev.result;
      if (ev.type === 'error') failure = ev.error;
    }
  }

  if (failure) throw new Error(failure);
  if (!final) throw new Error('Refine stream ended without a result');
  return final;
}

/**
 * Deterministic cleanup — no model call, returns in milliseconds.
 *
 * This is what runs after a recording. It hardens each selector by taking the
 * most stable candidate the recorder already ranked, attaches waits, names
 * steps, gates submits for approval, prunes dead parameters, and drops the few
 * step shapes that provably do nothing (a click on the form background, a
 * click that only focused the field the next step fills).
 *
 * refineScript / refineScriptStream below are the AI pass, now an explicit
 * action rather than a toll on every recording. Reach for it when the capture
 * needs judgement this cannot supply: deciding which of a human's stray clicks
 * were accidental, or whether an ambiguously worded button is destructive.
 */
export async function finalizeScript(orgId: string, body: {
  steps: RecordedStep[];
  parameters?: Record<string, string>;
  denoise?: boolean;
  /** Current script name. When it's a timestamp, the result carries suggestedName. */
  name?: string;
}, signal?: AbortSignal): Promise<RefineResult & { suggestedName?: string | null }> {
  const res = await agentClient.post<RefineResult & { suggestedName?: string | null }>(
    `/api/admin/${orgId}/scripts/finalize`, body, { signal });
  return res.data;
}

export async function refineScript(orgId: string, body: {
  steps: RecordedStep[];
  target_indices?: number[];
  instruction?: string;
  context?: { start_url?: string; parameters?: Record<string,string> };
}, signal?: AbortSignal): Promise<RefineResult> {
  const res = await agentClient.post<RefineResult>(`/api/admin/${orgId}/scripts/refine`, body, { signal });
  return res.data;
}

/** Metadata-only cleanup report from tidyScript. */
export interface TidyReport {
  summary: string;
  named: number;
  renamed: Array<{ from: string; to: string }>;
  parameterized: Array<{ index: number; var_name: string; value: string }>;
  pruned: string[];
}
export interface TidyResult { steps: RecordedStep[]; parameters: Record<string, string>; report: TidyReport; }

/**
 * Tidy a script's METADATA — name every step, rename variables to clearer
 * snake_case, and prune unused variables. Page-independent; never changes
 * selectors, actions, values, or step order. Used as the auto-cleanup pass
 * after a Test & Improve walk.
 */
export async function tidyScript(
  orgId: string,
  body: { steps: RecordedStep[]; parameters?: Record<string, string>; instruction?: string; scopeIndices?: number[] },
): Promise<TidyResult> {
  const res = await agentClient.post<TidyResult>(`/api/admin/${orgId}/scripts/tidy`, body);
  return res.data;
}

// ─── AI Step Assist ────────────────────────────────────────────

export interface AssistResult {
  ok: boolean;
  step?: RecordedStep;
  explanation?: string;
  confidence?: 'high' | 'medium' | 'low';
  error?: string;
}

export async function assistStep(
  orgId: string,
  runId: string,
  body: { instruction: string; step_index?: number },
): Promise<AssistResult> {
  const res = await agentClient.post<AssistResult>(`/api/admin/${orgId}/step-runs/${runId}/assist`, body);
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
  status: 'waiting' | 'running' | 'done' | 'error' | 'provisioning' | 'awaiting_approval';
  /** True when replay hit a `requires_approval` gate it can't run yet. */
  awaiting_approval?: boolean;
  /** Live steps captured during active recording (polled in real-time). */
  recordedSteps?: RecordedStep[];
  recordingActive?: boolean;
}

/**
 * Shared result shape for the two replay calls (execute one step /
 * run-remaining). Carries the approval-gate contract: when replay reaches a
 * `requires_approval` step it can't run yet, the backend returns
 * `awaiting_approval: true` with `currentIndex` pointing at the gated step.
 */
export interface StepRunStepResult {
  done: boolean;
  currentIndex: number;
  totalSteps: number;
  step: RecordedStep | null;
  screenshot: string;
  extracted: Record<string, string>;
  executedStep?: RecordedStep;
  pageUrl?: string | null;
  interrupted?: boolean;
  /** Set when replay paused at a gated step awaiting Approve / Deny. */
  awaiting_approval?: boolean;
  /** Present alongside awaiting_approval — the gated step's index. */
  status?: 'awaiting_approval';
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
  approvedGates?: number[],
  /** See executeStepRunStep — resolves {{_mfa}} server-side. */
  scriptId?: string | null,
  /**
   * Live hints from the EDITOR, which knows things the saved script may not:
   * an unsaved 2FA step, a just-linked login, or a draft with no row yet.
   * Without these the server fell back to the stored copy and silently
   * skipped injecting a code.
   */
  reserved?: { loginId?: string | null; needsTotp?: boolean },
): Promise<StepRunStepResult> {
  const body: Record<string, unknown> = {};
  if (params) body.params = params;
  if (approvedGates && approvedGates.length > 0) body.approved_gates = approvedGates;
  if (scriptId) body.script_id = scriptId;
  if (reserved?.loginId) body.login_id = reserved.loginId;
  if (reserved?.needsTotp !== undefined) body.needs_totp = reserved.needsTotp;
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/run-remaining`,
    Object.keys(body).length > 0 ? body : undefined,
    { signal, timeout: 15 * 60 * 1000 },
  );
  return res.data;
}

/** One entry of the live "Test & Improve" walk's per-step report. */
export interface ImproveReport {
  index: number;
  name?: string | null;
  change: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Result of an improve-walk pass. Extends the step-run contract (so the same
 * progress / awaiting_approval / interrupted handling applies) and adds:
 *  - ok/missingParams: set only when a fresh walk fails its variable pre-flight
 *  - improve_reports: what the AI changed at each targeted step
 *  - steps: the (possibly rewritten) step list to sync into the editor
 */
export interface ImproveWalkResult extends StepRunStepResult {
  ok?: boolean;
  error?: string;
  missingParams?: string[];
  improve_reports?: ImproveReport[];
  steps?: RecordedStep[];
}

/**
 * Live "Test & Improve" walk: replays the script in the run's existing browser,
 * executing each step (so it doubles as a test), pausing on approval gates, and
 * rewriting the targeted steps' selectors against the live page. Mirrors
 * runRemainingStepsAgentMode's transport (15-min budget, abortable). Pass
 * reset=true to start a fresh walk from the top (runs the missing-variable
 * pre-flight); on an approval pause, call again with reset=false and the gate
 * index added to approvedGates to resume.
 */
export async function improveWalk(
  orgId: string,
  runId: string,
  opts: {
    params?: Record<string, string>;
    approvedGates?: number[];
    targetIndices?: number[];
    instruction?: string;
    reset?: boolean;
    targetedOnly?: boolean;
    /** See executeStepRunStep — resolves {{_mfa}} server-side. */
    scriptId?: string | null;
    /** Live editor hints; see executeStepRunStep's `reserved`. */
    reserved?: { loginId?: string | null; needsTotp?: boolean };
  },
  signal?: AbortSignal,
): Promise<ImproveWalkResult> {
  // NOTE: the improve-walk admin route reads camelCase body fields (unlike the
  // older run-remaining route which used approved_gates).
  const body: Record<string, unknown> = {};
  if (opts.params) body.params = opts.params;
  if (opts.approvedGates && opts.approvedGates.length > 0) body.approvedGates = opts.approvedGates;
  if (opts.targetIndices && opts.targetIndices.length > 0) body.targetIndices = opts.targetIndices;
  if (opts.instruction && opts.instruction.trim()) body.instruction = opts.instruction.trim();
  if (opts.reset) body.reset = true;
  if (opts.targetedOnly) body.targetedOnly = true;
  if (opts.scriptId) body.script_id = opts.scriptId;
  if (opts.reserved?.loginId) body.login_id = opts.reserved.loginId;
  if (opts.reserved?.needsTotp !== undefined) body.needs_totp = opts.reserved.needsTotp;
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/improve-walk`,
    body,
    { signal, timeout: 15 * 60 * 1000 },
  );
  return res.data;
}

export async function executeStepRunStep(
  orgId: string,
  runId: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
  approvedGates?: number[],
  /**
   * Lets the server resolve reserved variables ({{_mfa}}) from the script's
   * linked login. Without it a 2FA step fills BLANK in the editor while the
   * same script works under an agent — a test harness that disagrees with
   * production is worse than none.
   */
  scriptId?: string | null,
  /**
   * Live hints from the EDITOR, which knows things the saved script may not:
   * an unsaved 2FA step, a just-linked login, or a draft with no row yet.
   * Without these the server fell back to the stored copy and silently
   * skipped injecting a code.
   */
  reserved?: { loginId?: string | null; needsTotp?: boolean },
): Promise<StepRunStepResult> {
  const body: Record<string, unknown> = {};
  if (params) body.params = params;
  if (approvedGates && approvedGates.length > 0) body.approved_gates = approvedGates;
  if (scriptId) body.script_id = scriptId;
  if (reserved?.loginId) body.login_id = reserved.loginId;
  if (reserved?.needsTotp !== undefined) body.needs_totp = reserved.needsTotp;
  const res = await agentClient.post(
    `/api/admin/${orgId}/step-runs/${runId}/execute`,
    Object.keys(body).length > 0 ? body : undefined,
    { signal },
  );
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
