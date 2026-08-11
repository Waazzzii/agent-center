import agentClient from './agent-client';
import { type Tag, tagFilterParams } from './tags';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  requires_browser: boolean;
  /** ID of the persisted browser session (cookies/storage) for this agent. Null until a browser run completes. */
  browser_session_id?: string | null;
  /** Owning agent-kit client (one per agent). When set, the agent is runnable
   *  from that client's agent kit, which passes the reserved `_client_prompt` /
   *  `_client_media` / `_client_video` inputs straight to the agent's own steps.
   *  Null = not client-assigned. */
  client_id?: string | null;
  created_at: string;
  updated_at: string;
  /** Agents that use this agent as a sub-agent target.  Empty = can have sub-agent actions. */
  used_as_sub_agent_by?: { agent_id: string; name: string }[];
  /** Tags applied to this agent. Present on list/get/create/update responses. */
  tags?: Tag[];
}

export interface AgentAction {
  id: string;
  agent_id: string;
  name: string;
  action_type: 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent';
  approval_instructions?: string | null;
  notify_user_id?: string | null;
  order_index: number;
  /** FKs to reusable entities */
  ai_step_id?: string | null;
  ai_step_name?: string | null;
  login_id?: string | null;
  login_name?: string | null;
  script_id?: string | null;
  script_name?: string | null;
  approval_step_id?: string | null;
  approval_step_name?: string | null;
  /** Resolved instructions from the linked approval_step row.
   *  Falls back to the legacy inline approval_instructions column
   *  via COALESCE on the backend. */
  approval_step_instructions?: string | null;
  approval_step_slack_channel?: string | null;
  target_agent_id?: string | null;
  target_agent_name?: string | null;
  /** sub_agent tuning */
  max_concurrent?: number | null;
  batch_size?: number | null;
  /** browser_script retry — 0 = no retries, max 3 */
  max_retries?: number | null;
  /** Per-action Slack channel override for HITL notifications. Falls
   *  through to program / org-default if null. */
  notification_slack_channel_id?: string | null;
  /** Per-use cross-cutting options stored on agent_actions.execution_options
   *  (JSONB, migration 212). Object always present; absent inner keys =
   *  default behavior. See agent-backend/services/agents/execution-options.js
   *  for the executor's consumer. */
  execution_options?: ExecutionOptions | null;
  created_at: string;
  updated_at: string;
}

/** Predicate operators supported by the executor's conditional gate.
 *  Keep in lock-step with CONDITIONAL_EXECUTION_OPERATORS in
 *  agent-backend/services/agents/agent-actions.service.js. */
export type ConditionalOperator =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte'
  | 'empty' | 'not_empty'
  // Friendlier-named aliases — same semantics as empty / not_empty
  // respectively. Treat null / undefined / '' / empty-array as "missing."
  | 'exists' | 'not_exists'
  | 'contains';

export interface ConditionalExecution {
  /** Dotted path into the previous step's per-item output state. */
  field: string;
  operator: ConditionalOperator;
  /** Omitted for empty/not_empty (nullary operators). */
  value?: string | number | boolean | null;
}

export interface ExecutionOptions {
  conditional_execution?: ConditionalExecution;
  continue_on_failure?: boolean;
}

export interface AgentTrigger {
  id: string;
  agent_id: string;
  trigger_type: 'webhook' | 'cron' | 'manual';
  trigger_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentWebhookKey {
  trigger_id: string;
  key_prefix: string;
  created_at: string;
  updated_at: string;
}

export interface AgentApprovalItem {
  id: string;
  execution_log_id: string;
  action_id: string;
  action_name: string;
  action_type: string;
  status: 'awaiting_approval' | 'approved' | 'denied' | 'aborted';
  output: string | null;
  executed_by: string | null;
  started_at: string;
  completed_at: string | null;
  agent_id: string;
  agent_name: string;
  approval_instructions: string | null;
  /** Login profile id — only set for action_type='login'.  Used to group
   *  concurrent login HITLs (same login_id ⇒ same underlying login). */
  login_id: string | null;
  /** Login profile display name — only set when login_id is set. */
  login_name: string | null;
}

/**
 * Submissions Center routine that's bound to this agent. Multiple bindings
 * can exist (an agent could fill the slot for several authorities under the
 * same domain). Surfaces in the agent detail page so admins can see at a
 * glance "this agent is wired into Submissions Center for X / Y / Z."
 */
export interface AgentRoutineBinding {
  id: string;
  product_slug: string;
  domain_type: string;
  routine_key: string;
  name: string;
  description: string | null;
  is_active: boolean;
  /** Timestamp of the most recent successful contract verification.
   *  NULL = the SSC runtime gate refuses to fire for this routine. */
  agent_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentDetail extends Agent {
  actions: AgentAction[] | null;
  triggers: AgentTrigger[] | null;
  /** Optional — only present when the agent-backend is running with the
   *  ssc tables migrated (171–173). Empty array = not bound to any routine. */
  routine_bindings?: AgentRoutineBinding[];
}

/** Status of a browser-based agent run (tracked in agent-backend memory) */
export interface BrowserRunStatus {
  runId: string;
  agentId: string;
  status: 'pending' | 'running' | 'auth_required' | 'awaiting_approval' | 'completed' | 'failed' | 'aborted' | 'provisioning';
  steps: Array<{ iteration?: number; role?: string; timestamp: string; content?: unknown }>;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoVNCInfo {
  runId: string;
  wsUrl: string;
  novncPort: number;
  /** Relative path to embed in an iframe: /live/run/:runId */
  viewerUrl: string;
}

// ─── Agents ───────────────────────────────────────────────────

export async function getAgents(
  orgId: string,
  opts?: { tagIds?: string[]; tagMatch?: 'any' | 'all' },
) {
  const res = await agentClient.get<{ agents?: Agent[] } | Agent[]>(
    `/api/admin/${orgId}/agents`,
    { params: tagFilterParams(opts?.tagIds ?? [], opts?.tagMatch) }
  );
  // Handle both array and wrapped response shapes
  const data = res.data as any;
  return { agents: Array.isArray(data) ? data : (data.agents ?? []) } as { agents: Agent[] };
}

export async function getAgent(orgId: string, agentId: string) {
  const res = await agentClient.get<AgentDetail>(`/api/admin/${orgId}/agents/${agentId}`);
  return res.data;
}

export async function createAgent(orgId: string, data: { name: string; description?: string; tag_ids?: string[] }) {
  const res = await agentClient.post<Agent>(`/api/admin/${orgId}/agents`, data);
  return res.data;
}

export async function updateAgent(orgId: string, agentId: string, data: { name?: string; description?: string; is_active?: boolean; requires_browser?: boolean; tag_ids?: string[] }) {
  const res = await agentClient.patch<Agent>(`/api/admin/${orgId}/agents/${agentId}`, data);
  return res.data;
}

/**
 * Assign (or clear) the owning agent-kit client for an agent — one client per
 * agent. Assigning makes the agent runnable from that client's kit (which passes
 * the reserved `_client_*` inputs); passing `null` clears the assignment.
 * Returns the refreshed agent.
 */
export async function setAgentClient(orgId: string, agentId: string, clientId: string | null) {
  const res = await agentClient.put<Agent>(`/api/admin/${orgId}/agents/${agentId}/client`, { client_id: clientId });
  return res.data;
}

export async function deleteAgent(orgId: string, agentId: string) {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}`);
}

/**
 * Duplicate an agent and all its actions. Client-side composition over the
 * existing create/update/createAction endpoints — no new backend route
 * needed. The duplicate:
 *   • copies name (with "(copy)" suffix), description, requires_browser
 *   • is created INACTIVE so it doesn't fire while the operator reviews
 *   • clones every action, preserving order_index, FK references
 *     (ai_step_id, login_id, script_id, target_agent_id, approval_step_id)
 *     — the dup uses the same reusable resources as the source — and
 *     per-use config (execution_options for conditional/allow-failure,
 *     notification_slack_channel_id, approval_instructions, notify_user_id)
 *   • does NOT clone triggers (webhook keys would conflict, cron would
 *     double-fire) or routine_bindings — operator wires those up post-dup
 */
export async function duplicateAgent(
  orgId: string,
  sourceAgentId: string,
  newName: string,
): Promise<Agent> {
  const source = await getAgent(orgId, sourceAgentId);
  // getAgent's `actions` field only includes (id, name, action_type,
  // order_index) — the SQL there strips the FK refs (ai_step_id,
  // login_id, script_id, target_agent_id, etc.) to keep the agent-list
  // payload small. We need the FULL action shape to clone the
  // underlying-step references, so fetch from the dedicated actions
  // endpoint (listActions service — returns every column).
  const sourceActions = await getActions(orgId, sourceAgentId);
  const newAgent = await createAgent(orgId, {
    name: newName,
    description: source.description ?? undefined,
  });
  // is_active + requires_browser are only settable via PATCH after create.
  // Always create as inactive — operator activates after reviewing.
  await updateAgent(orgId, newAgent.id, {
    is_active: false,
    requires_browser: source.requires_browser,
  });
  // Replay actions in order_index order so the dup's action sequence
  // matches the source visually.
  if (sourceActions.length > 0) {
    const ordered = [...sourceActions].sort((a, b) => a.order_index - b.order_index);
    for (const a of ordered) {
      // Numeric tuning fields have NOT NULL columns in agent_actions with
      // service-layer defaults that only apply when the keys are `undefined`
      // (JS destructuring defaults — they don't fire on explicit `null`).
      // For non-sub_agent action types the source has these as null, so
      // we omit them from the payload entirely and let the backend default
      // (max_concurrent=3, batch_size=1, max_retries=0) take effect.
      const tuning: Partial<AgentAction> = {};
      if (a.max_concurrent != null) tuning.max_concurrent = a.max_concurrent;
      if (a.batch_size != null) tuning.batch_size = a.batch_size;
      if (a.max_retries != null) tuning.max_retries = a.max_retries;

      await createAction(orgId, newAgent.id, {
        name: a.name,
        action_type: a.action_type,
        approval_instructions: a.approval_instructions ?? null,
        notify_user_id: a.notify_user_id ?? null,
        order_index: a.order_index,
        ai_step_id: a.ai_step_id ?? null,
        login_id: a.login_id ?? null,
        script_id: a.script_id ?? null,
        target_agent_id: a.target_agent_id ?? null,
        approval_step_id: a.approval_step_id ?? null,
        notification_slack_channel_id: a.notification_slack_channel_id ?? null,
        // Per-use cross-cutting config: conditional_execution gate +
        // continue_on_failure tolerance. Previously dropped on clone,
        // forcing operators to re-apply per-step "Allow Failure" /
        // "Conditional" toggles on every duplicate.
        execution_options: a.execution_options ?? null,
        ...tuning,
      });
    }
  }
  return newAgent;
}

// ─── Actions ──────────────────────────────────────────────────

export async function getActions(orgId: string, agentId: string) {
  const res = await agentClient.get<AgentAction[]>(`/api/admin/${orgId}/agents/${agentId}/actions`);
  return res.data;
}

export async function createAction(orgId: string, agentId: string, data: Partial<AgentAction>) {
  const res = await agentClient.post<AgentAction>(`/api/admin/${orgId}/agents/${agentId}/actions`, data);
  return res.data;
}

export async function updateAction(orgId: string, agentId: string, actionId: string, data: Partial<AgentAction>) {
  const res = await agentClient.patch<AgentAction>(`/api/admin/${orgId}/agents/${agentId}/actions/${actionId}`, data);
  return res.data;
}

export async function deleteAction(orgId: string, agentId: string, actionId: string) {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}/actions/${actionId}`);
}

export async function reorderActions(orgId: string, agentId: string, orderedIds: string[]) {
  const res = await agentClient.post<AgentAction[]>(`/api/admin/${orgId}/agents/${agentId}/actions/reorder`, { ordered_ids: orderedIds });
  return res.data;
}

// ─── Triggers ─────────────────────────────────────────────────

export async function getTriggers(orgId: string, agentId: string) {
  const res = await agentClient.get<AgentTrigger[]>(`/api/admin/${orgId}/agents/${agentId}/triggers`);
  return res.data;
}

export async function createTrigger(orgId: string, agentId: string, data: { trigger_type: string; trigger_config?: Record<string, unknown> }) {
  const res = await agentClient.post<AgentTrigger>(`/api/admin/${orgId}/agents/${agentId}/triggers`, data);
  return res.data;
}

export async function updateTrigger(orgId: string, agentId: string, triggerId: string, data: Partial<AgentTrigger>) {
  const res = await agentClient.patch<AgentTrigger>(`/api/admin/${orgId}/agents/${agentId}/triggers/${triggerId}`, data);
  return res.data;
}

export async function deleteTrigger(orgId: string, agentId: string, triggerId: string) {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}/triggers/${triggerId}`);
}

export async function generateWebhookKey(orgId: string, agentId: string, triggerId: string) {
  const res = await agentClient.post<{ triggerId: string; key: string; prefix: string }>(
    `/api/admin/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-key`
  );
  return res.data;
}

export async function getWebhookKey(orgId: string, agentId: string, triggerId: string) {
  const res = await agentClient.get<AgentWebhookKey | null>(
    `/api/admin/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-key`
  );
  return res.data;
}

export async function runAgent(orgId: string, agentId: string) {
  const res = await agentClient.post<{ runId: string }>(`/api/admin/${orgId}/agents/${agentId}/run`);
  return res.data;
}

// ─── Approvals ────────────────────────────────────────────────

export interface ApprovalsListResponse {
  items: AgentApprovalItem[];
  total: number;
  page: number;
  total_pages: number;
}

export async function getApprovals(
  orgId: string,
  params?: { status?: string; agent_id?: string; execution_id?: string; action_types?: string; page?: number; limit?: number }
) {
  const res = await agentClient.get<ApprovalsListResponse>(`/api/admin/${orgId}/approvals`, { params });
  return res.data;
}

export async function approveApproval(orgId: string, approvalId: string) {
  const res = await agentClient.post<AgentApprovalItem>(`/api/admin/${orgId}/approvals/${approvalId}/approve`);
  return res.data;
}

export async function denyApproval(orgId: string, approvalId: string) {
  const res = await agentClient.post<AgentApprovalItem>(`/api/admin/${orgId}/approvals/${approvalId}/deny`);
  return res.data;
}

// ─── Execution History ────────────────────────────────────────

export interface ExecutionRun {
  id: string;
  agent_id: string;
  organization_id: string;
  agent_name: string;
  agent_requires_browser: boolean;
  /** True only when a browser slot is currently allocated in the worker pool
   *  for this run.  Per-action browser model: runs flip between having a
   *  browser and not, so this is checked live at list time. */
  has_active_browser: boolean;
  /** Aggregates rolled up from action_logs, so the feed doesn't need extra queries. */
  tokens_input?: number;
  tokens_output?: number;
  child_count?: number;
  trigger_type: 'webhook' | 'cron' | 'manual' | 'sub_agent';
  trigger_id: string | null;
  status: 'executing' | 'completed' | 'failed' | 'aborted' | 'awaiting_approval' | 'provisioning' | 'queued';
  display_status: 'executing' | 'completed' | 'failed' | 'aborted' | 'awaiting_approval' | 'awaiting_login' | 'provisioning' | 'queued';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  action_logs: ExecutionAction[];
  /** Total number of actions defined in the agent's workflow (not just logged ones). */
  total_actions?: number;
  /** Sub-agent tree tracking */
  parent_execution_id: string | null;
  depth: number;
  item_index: number | null;
  has_children?: boolean;
  /** Tags on this run's agent (tags live on the agent, not the run). */
  tags?: Tag[];
}

export interface ExecutionAction {
  id: string;
  action_name: string | null;
  action_type: 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent';
  status: string;
  started_at: string;
  completed_at?: string | null;
  /** Resolved input the action received (JSON string when structured). */
  input?: string | null;
  output: string | null;
  error_message: string | null;
  tokens_input?: number | null;
  tokens_output?: number | null;
  model?: string | null;
}

/** Node in the execution tree (parent + all descendants) */
export interface ExecutionTreeNode {
  id: string;
  agent_id: string;
  agent_name: string;
  parent_execution_id: string | null;
  parent_action_log_id: string | null;
  depth: number;
  item_index: number | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

/** Direct child execution (sub-agent run) */
export interface ExecutionChild {
  id: string;
  agent_id: string;
  agent_name: string;
  item_index: number | null;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
}

export interface ExecutionHistoryResponse {
  items: ExecutionRun[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export async function getExecutionHistory(
  orgId: string,
  params?: {
    from?: string;
    to?: string;
    agent_id?: string;
    status?: string | string[];
    trigger_type?: string;
    /** Comma-separated tag ids; pair with tag_match. Use tagFilterParams(). */
    tag_ids?: string;
    tag_match?: 'any' | 'all';
    page?: number;
    limit?: number;
  }
): Promise<ExecutionHistoryResponse> {
  const res = await agentClient.get<ExecutionHistoryResponse>(
    `/api/admin/${orgId}/execution-history`,
    {
      params,
      // Serialize arrays as repeated params: status=executing&status=awaiting_approval
      paramsSerializer: { indexes: null },
    }
  );
  return res.data;
}

// ─── Browser HITL (agent-backend in-memory run tracking) ──────

/**
 * Get the status of a browser-based agent run.
 * runId is returned by POST /api/admin/:orgId/agents/:agentId/run
 */
export async function getBrowserRunStatus(runId: string): Promise<BrowserRunStatus> {
  const res = await agentClient.get<BrowserRunStatus>(`/agent/run/${runId}`);
  return res.data;
}

/**
 * Resume an agent run that is paused waiting for a browser login.
 * Call this after the human has logged in via the noVNC iframe.
 *
 * For manual-login login runs (kind='manual'), the backend kicks off an
 * independent post-login verify run and returns its id as `verifyRunId`.
 * Callers can use that to subscribe to the verify's status — drives the
 * "Verifying..." spinner on the login details page back to a settled
 * state once the verify completes. Returns `null` for non-manual flows
 * (e.g. logout, or agent-action resumes that don't spawn a verify).
 */
export async function resumeBrowserRun(runId: string): Promise<{ verifyRunId: string | null }> {
  const res = await agentClient.post<{ ok: boolean; verifyRunId?: string | null }>(
    `/agent/run/${runId}/resume`,
  );
  return { verifyRunId: res.data?.verifyRunId ?? null };
}

/**
 * Abort a running or paused agent run immediately.
 */
export async function abortBrowserRun(runId: string): Promise<void> {
  await agentClient.post(`/agent/run/${runId}/abort`);
}

/**
 * Clear the saved browser session for an agent (logs the agent out).
 * Deletes the stored cookies/storage and sets agent.browser_session_id = null.
 */
export async function clearAgentBrowserSession(orgId: string, agentId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}/browser-session`);
}

/**
 * Get the noVNC viewer URL for a specific run.
 * Also lazily starts x11vnc + websockify for that run's pool slot
 * so the browser is visible as soon as the dialog opens.
 */
export async function getNoVNCInfo(runId: string): Promise<NoVNCInfo> {
  const res = await agentClient.get<NoVNCInfo>(`/novnc/run/${runId}`);
  return res.data;
}

/**
 * Lazy HITL allocation: allocates a browser slot on demand for a paused run.
 * Called when the user clicks "Open Browser" in the Interactions page.
 * Returns the noVNC URL for the iframe.
 */
export async function openBrowserForRun(runId: string): Promise<{ runId: string; novncUrl: string }> {
  const res = await agentClient.post<{ runId: string; novncUrl: string }>(`/agent/run/${runId}/open-browser`);
  return res.data;
}

// ─── Sub-Agent & Execution Tree ─────────────────────────────

/** List agents that can be used as sub-agents (excludes the current agent). */
export async function getValidSubAgents(orgId: string, agentId: string): Promise<Agent[]> {
  const res = await agentClient.get<Agent[]>(`/api/admin/${orgId}/agents/${agentId}/valid-sub-agents`);
  return res.data;
}

/** Get the full execution tree (root + all descendants) for visualization. */
export async function getExecutionTree(orgId: string, executionId: string): Promise<ExecutionTreeNode[]> {
  const res = await agentClient.get<ExecutionTreeNode[]>(`/api/admin/${orgId}/executions/${executionId}/tree`);
  return res.data;
}

/** Get direct child executions (sub-agent runs) for a parent execution. */
export async function getExecutionChildren(orgId: string, executionId: string): Promise<ExecutionChild[]> {
  const res = await agentClient.get<ExecutionChild[]>(`/api/admin/${orgId}/executions/${executionId}/children`);
  return res.data;
}

// ─── Full Execution Tree (nested hierarchy) ─────────────────────

export interface FullTreeNode {
  type: 'execution' | 'action' | 'batch_item';
  id: string;
  label: string;
  status: string;
  started_at: string;
  completed_at?: string | null;
  duration_ms?: number | null;
  // Execution-specific
  agent_name?: string;
  item_index?: number | null;
  depth?: number;
  error_message?: string | null;
  // Action-specific
  action_type?: string;
  tokens_input?: number | null;
  tokens_output?: number | null;
  model?: string | null;
  /** Resolved input the action received (JSON string when structured). */
  input?: string | null;
  output?: string | null;
  /**
   * Signed GCS URL of a screenshot captured during this action. Populated
   * for browser_script and login (auto-login) actions — success-time
   * shows the final page state, failure-time shows the moment-of-failure
   * page. Null for AI-only steps, approvals, sub-agent dispatches, and
   * any action where no screenshot was taken. The URL is short-lived
   * (~7 day TTL) — operators clicking on stale runs may need to refresh
   * if it 404s.
   */
  screenshot_url?: string | null;
  batch_item_count?: number;
  batch_item_index?: number | null;
  // Children
  children?: FullTreeNode[];
  // Ancestor breadcrumb (only on root node) — from top-level agent down to this execution's parent
  // type='execution' for agent nodes, type='action' for the sub_agent action that spawned a child
  ancestors?: { id: string; label: string; item_index?: number | null; depth?: number; type?: string; parent_id?: string }[];
}

export async function getFullExecutionTree(orgId: string, executionId: string): Promise<FullTreeNode> {
  const res = await agentClient.get<FullTreeNode>(`/api/admin/${orgId}/executions/${executionId}/full-tree`);
  return res.data;
}

export async function getActionBatchItems(orgId: string, executionId: string, actionLogId: string): Promise<{ items: FullTreeNode[] }> {
  const res = await agentClient.get<{ items: FullTreeNode[] }>(`/api/admin/${orgId}/executions/${executionId}/actions/${actionLogId}/batch-items`);
  return res.data;
}

// ─── Execution Analytics ──────────────────────────────────────

export interface AnalyticsSummary {
  total: number;
  completed: number;
  failed: number;
  aborted: number;
  running: number;
  avg_duration_s: number | null;
  success_rate: number | null;
}

export interface DailyCount {
  date: string;
  total: number;
  completed: number;
  failed: number;
  aborted: number;
}

export interface AgentStats {
  agent_id: string;
  agent_name: string;
  total: number;
  completed: number;
  failed: number;
  aborted: number;
  avg_duration_s: number | null;
}

export interface BatchItemStats {
  total_items: number;
  completed: number;
  failed: number;
  success_rate: number | null;
}

export interface RecentFailure {
  id: string;
  agent_name: string;
  status: string;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_s: number | null;
  trigger_type: string;
}

export interface TriggerTypeCount {
  trigger_type: string;
  count: number;
}

/**
 * Token-usage stats for an organization over a date range.
 * Renamed from CostStats — we no longer report per-run dollar cost here;
 * real billing lives on the Billing & Usage page (Anthropic Cost API).
 */
export interface TokenStats {
  tokens_input: number | string;
  tokens_output: number | string;
  tokens_cache_read: number | string;
  tokens_cache_write: number | string;
  ai_steps: number | string;
}

export interface ActionTypeStats {
  action_type: string;
  total: number | string;
  completed: number | string;
  failed: number | string;
  paused: number | string;
  avg_duration_s: number | null;
  total_tokens: number | string;
}

export interface FailureHotspot {
  agent_id: string;
  agent_name: string;
  action_name: string;
  action_type: string;
  failures: number | string;
  last_failed_at: string;
  last_error: string | null;
}

export interface LiveSnapshot {
  active: number | string;
  queued: number | string;
  awaiting: number | string;
}

export interface ExecutionAnalytics {
  range: { from: string; to: string };
  summary: AnalyticsSummary;
  daily: DailyCount[];
  perAgent: AgentStats[];
  batchItems: BatchItemStats;
  recentFailures: RecentFailure[];
  triggerTypes: TriggerTypeCount[];
  // Token usage estimates — replaces the old `cost` block, matches the
  // backend's renamed getTokenStats. Surface in the UI as estimates, not
  // invoiced amounts.
  tokens: TokenStats;
  actionTypes: ActionTypeStats[];
  hotspots: FailureHotspot[];
  live: LiveSnapshot;
  previous: {
    summary: AnalyticsSummary;
    tokens: TokenStats;
    from: string;
    to: string;
  } | null;
}

export async function getExecutionAnalytics(
  orgId: string,
  params?: { from?: string; to?: string; compare?: boolean }
): Promise<ExecutionAnalytics> {
  const res = await agentClient.get<ExecutionAnalytics>(
    `/api/admin/${orgId}/execution-analytics`,
    { params }
  );
  return res.data;
}
