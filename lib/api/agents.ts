import agentClient from './agent-client';
import { type Tag, tagFilterParams } from './tags';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
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

export async function updateAgent(orgId: string, agentId: string, data: { name?: string; description?: string; is_active?: boolean; tag_ids?: string[] }) {
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
 *   • copies name (with "(copy)" suffix) and description
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
  // is_active is only settable via PATCH after create.
  // Always create as inactive — operator activates after reviewing.
  await updateAgent(orgId, newAgent.id, { is_active: false });
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
        // Per-use cross-cutting config: the conditional_execution gate.
        // Previously dropped on clone, forcing operators to re-apply the
        // per-step "Conditional" toggle on every duplicate.
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
  /** True only when a browser slot is currently allocated in the worker pool
   *  for this run.  Per-action browser model: runs flip between having a
   *  browser and not, so this is checked live at list time. */
  has_active_browser: boolean;
  /** Aggregates rolled up from action_logs, so the feed doesn't need extra queries. */
  tokens_input?: number;
  tokens_output?: number;
  /**
   * Cached prompt tokens. Prompt caching is ON, so `tokens_input` carries only
   * the UNCACHED remainder — routinely single digits against a prompt of tens
   * of thousands. Anything showing "input" must add these, or it is reporting
   * a rounding error as the prompt size.
   */
  tokens_cache_read?: number;
  tokens_cache_write?: number;
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
  /** See ExecutionRun.tokens_cache_read — input alone is the uncached remainder. */
  tokens_cache_read?: number | null;
  tokens_cache_write?: number | null;
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

// ─── On-completion rules & decisions ──────────────────────────────────
//
// An outcome rule is the bookend to a trigger: a trigger is how work comes
// in, a rule is what happens when the run is done. It never blocks a run —
// the run fires its rules, records that they fired, and completes. See
// agent-backend/AGENT_OUTCOMES_PLAN.md.
//
// An agent has a LIST of rules. Every rule is evaluated against every
// finished item independently and EVERY MATCH FIRES, in parallel. There is no
// precedence and no fallback: matching nothing is a valid, common result.

export type OutcomeType = 'none' | 'notify' | 'decision';
export type OptionStyle = 'default' | 'primary' | 'danger';

/**
 * One button on a decision.
 *
 * @deprecated The buttons are fixed now (Approve / Deny / Review). This
 * survives only to type the legacy `config.options` on rules saved before
 * that, which are read and never written.
 */
export interface OutcomeOption {
  key: string;
  label: string;
  style?: OptionStyle;
  then?: { type: 'none' } | { type: 'run_agent'; target_agent_id: string };
}

export interface OutcomeConfig {
  channel_id?: string;
  recipient_user_ids?: string[];
  message_template?: string;
  /** Fields allowed into the Slack message. The review screen shows everything. */
  field_allowlist?: string[];
  expires_after_hours?: number;
  /**
   * What Approve starts. The ONLY configurable part of a decision — the
   * buttons themselves are fixed (Approve / Deny / Review).
   */
  on_approve?: { target_agent_id: string } | null;
  /**
   * @deprecated Author-defined options. Reads only, for outcomes saved before
   * the buttons were fixed; the backend rejects it on write. Nothing new
   * should set it.
   */
  options?: OutcomeOption[];
}

export interface AgentOutcome {
  id: string;
  agent_id: string;
  /**
   * What this rule is, e.g. "Tucson". Shown on the decisions it raises —
   * without it, two rules firing on one run produce two identical-looking
   * asks. Falls back to the channel id.
   */
  name: string | null;
  /** Display and posting order. Does NOT decide whether a rule fires. */
  sort_order: number;
  /**
   * DERIVED from config.on_approve, never set directly: a rule that starts an
   * agent is a decision, one that does not is a notification. Read-only here.
   */
  outcome_type: OutcomeType;
  /** {field, operator, value} — which finished items this rule acts on. {} = all. */
  conditional_execution: Record<string, unknown>;
  config: OutcomeConfig;
  is_active: boolean;
  updated_at?: string;
}

/**
 * What the editor sends. A rule with config.on_approve is always a decision;
 * `outcome_type: 'decision'` additionally allows a decision that runs nothing
 * on Approve (a recorded judgement). Anything else is a notification.
 */
export type OutcomeRuleInput = {
  outcome_type?: 'notify' | 'decision';
  name?: string | null;
  sort_order?: number;
  conditional_execution?: Record<string, unknown>;
  config: OutcomeConfig;
  is_active?: boolean;
};

export type DecisionStatus = 'pending' | 'decided' | 'expired';

export interface Decision {
  id: string;
  desk_id: string;
  item_index: number | null;
  status: DecisionStatus;
  chosen_option: string | null;
  decided_at: string | null;
  note: string | null;
  created_at: string;
  launch_error: string | null;
  /** Rendered from the outcome's message_template at raise time. */
  message_text: string | null;
  source_output: unknown;
  proposed_input: unknown;
  final_input: unknown;
  was_edited?: boolean;
  source_agent_id: string;
  source_agent_name: string;
  /**
   * The rule that raised this. Null when the rule was deleted, or for
   * decisions raised before rules existed — one run can match several rules,
   * and this is the only thing distinguishing their rows.
   */
  outcome_id?: string | null;
  outcome_name?: string | null;
  execution_log_id: string;
  expires_at: string | null;
  desk_status?: string;
  resulting_execution_id: string | null;
  target_agent_id: string | null;
  target_agent_name: string | null;
  target_run_status: string | null;
  decided_by_first_name?: string | null;
  decided_by_last_name?: string | null;
  /**
   * @deprecated No longer sent. Label and colour are derived from
   * `chosen_option` itself — see lib/decision-wording — now that the option
   * set is fixed. Kept so any reader still referencing them type-checks.
   */
  chosen_option_label?: string | null;
  chosen_option_style?: OptionStyle | null;
}

export interface DecisionDesk {
  id: string;
  agent_id: string;
  agent_name: string;
  execution_log_id: string;
  status: 'open' | 'closed' | 'expired';
  expires_at: string | null;
  /**
   * The rule that raised this desk. Null when the rule was deleted, or for
   * desks raised before rules existed — the desk still opens and its
   * decisions are still answerable either way.
   */
  outcome_id: string | null;
  outcome_name: string | null;
  outcome_config: OutcomeConfig | null;
  outcome_type: OutcomeType | null;
}

export async function getAgentOutcomes(orgId: string, agentId: string) {
  const res = await agentClient.get<AgentOutcome[]>(`/api/admin/${orgId}/agents/${agentId}/outcomes`);
  return res.data;
}

export async function createAgentOutcome(orgId: string, agentId: string, data: OutcomeRuleInput) {
  const res = await agentClient.post<AgentOutcome>(
    `/api/admin/${orgId}/agents/${agentId}/outcomes`, data,
  );
  return res.data;
}

/**
 * Update ONE rule. The id is required and not inferable — an agent has many
 * rules, so a save without it would add a second one that also fires.
 */
export async function updateAgentOutcome(
  orgId: string, agentId: string, outcomeId: string, data: OutcomeRuleInput,
) {
  const res = await agentClient.put<AgentOutcome>(
    `/api/admin/${orgId}/agents/${agentId}/outcomes/${outcomeId}`, data,
  );
  return res.data;
}

export async function deleteAgentOutcome(orgId: string, agentId: string, outcomeId: string) {
  const res = await agentClient.delete<{ removed: boolean }>(
    `/api/admin/${orgId}/agents/${agentId}/outcomes/${outcomeId}`,
  );
  return res.data;
}

export interface DecisionListResponse {
  items: Decision[];
  total: number;
  /**
   * Per-status totals for the shortcut cards, computed with the SAME filters
   * as the list minus status — so a count reflects the range and agents you
   * are looking at, not the whole org.
   */
  counts?: Partial<Record<DecisionStatus, number>>;
  page: number;
  limit: number;
  pages: number;
}

export async function getDecisions(
  orgId: string,
  params?: {
    status?: string | string[];
    source_agent_id?: string;
    target_agent_id?: string;
    decided_by?: string;
    chosen_option?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
  },
) {
  const res = await agentClient.get<DecisionListResponse>(`/api/admin/${orgId}/decisions`, {
    params,
    paramsSerializer: { indexes: null },
  });
  return res.data;
}

export async function getDecisionDesk(orgId: string, deskId: string) {
  const res = await agentClient.get<{ desk: DecisionDesk; decisions: Decision[] }>(
    `/api/admin/${orgId}/decision-desks/${deskId}`,
  );
  return res.data;
}

/**
 * Answer a decision. FINAL — it records, launches whatever the chosen option
 * runs, and closes the desk once nothing is left pending.
 *
 * Editing the payload happens before answering, not after. A 409 means
 * somebody answered first; the response carries their decision.
 */
export interface AnsweredDecision extends Decision {
  launched?: { target_agent_id: string; execution_id: string; items: number } | null;
  /** Decisions still pending on the same desk. */
  remaining?: number;
}

export async function resolveDecision(
  orgId: string,
  decisionId: string,
  data: { chosen_option: string; final_input?: unknown; note?: string },
) {
  const res = await agentClient.post<AnsweredDecision>(`/api/admin/${orgId}/decisions/${decisionId}/resolve`, data);
  return res.data;
}

/**
 * Answer every pending decision on a desk the same way — Approve All / Deny
 * All, and the bulk action on the review screen.
 *
 * Each item still records its own decision and starts its own follow-on run;
 * the bulk is in the clicking, never in the record. Only pending items are
 * touched, so this is safe to retry.
 */
export async function answerDecisionDesk(
  orgId: string,
  deskId: string,
  data: { chosen_option: string; note?: string },
) {
  const res = await agentClient.post<{
    ok: true; answered: number; launched: number; failed: number;
    remaining: number; summary: string;
  }>(`/api/admin/${orgId}/decision-desks/${deskId}/answer`, data);
  return res.data;
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
    /** Server-side; the backend whitelists the column. */
    sort_by?: string;
    sort_dir?: 'asc' | 'desc';
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
 * Nothing re-checks the operator afterwards. This used to return the id of an
 * independent post-login verify run, which the login page subscribed to for a
 * "Verifying..." spinner; that run, and verification generally, is gone.
 */
/**
 * A login action row that did nothing, and so is not worth showing.
 *
 * The login step used to open a browser, run a verify script, and sign in when
 * that failed. It does none of that now: proving the session is a step of the
 * BROWSER SCRIPT (login_indicator), and the sign-in it triggers is recorded
 * against that script's row, beside the step that prompted it. What is left is
 * a passthrough — same items in, same items out, no browser.
 *
 * Shown, it claimed a login had happened before the script, which is the one
 * thing that is no longer true, and sent anyone looking for the sign-in to an
 * empty row.
 *
 * Only the INERT cases are hidden. A login row that failed, was aborted, or is
 * still parked (older runs, from when the login step could pause for HITL) had
 * something happen to it and still shows — a failure here is a real config
 * fault (no login_id, deleted login profile), and burying it would leave
 * someone with a broken agent and nothing on screen.
 *
 * 'skipped' counts as inert, and missing it was a bug. The handler only ever
 * writes 'completed', so this rule was written against that one value — but
 * the per-item partition runs BEFORE any handler and stamps 'skipped' on a step
 * whose items all arrived cascade-failed or gated. A login step after a failed
 * step therefore surfaced, which is precisely the "a login happened here"
 * claim this function exists to suppress, in the one run where it is least
 * true: nothing ran at all.
 *
 * The row is NOT deleted — resolveActiveSessionId reads agent_action_log to
 * bind an AI step with the browser connector to this run's session, and the
 * executor's gating/cascade bookkeeping runs per row. This is a view decision.
 */
export function isInertLoginRow(row: { action_type?: string | null; status?: string | null }): boolean {
  if (row.action_type !== 'login') return false;
  return row.status === 'completed' || row.status === 'skipped';
}

/**
 * An on-completion row, not a step.
 *
 * agent_action_log holds both: the steps a routine declares, and the events
 * that happened because it finished. One rule writes one row, so an agent with
 * five rules adds five rows that no step count should include — a two-step
 * routine reported "7" against a declared total of 2, which is a true count of
 * rows and a false count of anything anyone recognises.
 *
 * Shared because the history list and the run detail each derive their own
 * count, and the whole reason this is a function is that they drifted.
 */
export function isOutcomeRow(row: { action_type?: string | null }): boolean {
  return row.action_type === 'outcome';
}

export async function resumeBrowserRun(runId: string): Promise<void> {
  await agentClient.post(`/agent/run/${runId}/resume`);
}

/**
 * Put a stuck run (says queued/executing, nothing working on it) back in the
 * queue. It continues after its last finished step. The backend refuses
 * while the run is genuinely still running.
 */
export async function forceResumeRun(runId: string): Promise<void> {
  await agentClient.post(`/agent/run/${runId}/force-resume`);
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
  /** The routine that produced this run — drives the "Open routine" link. */
  agent_id?: string;
  item_index?: number | null;
  depth?: number;
  error_message?: string | null;
  /** What set this run off — webhook | cron | manual | decision | sub_agent. */
  trigger_type?: string | null;
  trigger_id?: string | null;
  /**
   * THE EXACT PAYLOAD THE RUN WAS HANDED, and the only record of it — a step's
   * log shows what that step produced, never what arrived. Null for runs
   * started before this was recorded.
   */
  trigger_input?: unknown;
  /** Resolved name of whoever started it, when a platform user did. */
  triggered_by_name?: string | null;
  /** Raw handle — e.g. "mcp:someone@example.com". Not always a user id. */
  triggered_by?: string | null;
  /**
   * The decision that launched this run, when trigger_type is 'decision'.
   * Links the run back to the desk and to the run that raised it.
   */
  origin_decision?: {
    decision_id: string;
    desk_id: string | null;
    chosen_option: string | null;
    decided_at: string | null;
    decided_by_name: string | null;
    item_index: number | null;
    execution_id: string | null;
    agent_name: string | null;
    rule_name: string | null;
  } | null;
  // Action-specific
  action_type?: string;
  tokens_input?: number | null;
  tokens_output?: number | null;
  /** See ExecutionRun.tokens_cache_read — input alone is the uncached remainder. */
  tokens_cache_read?: number | null;
  tokens_cache_write?: number | null;
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
  /** The login this step runs as (the pool parent), when it has one — so a
   *  step parked on a sign-in can link to where a person fixes it. */
  login_id?: string | null;
  login_name?: string | null;
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
