import agentClient from './agent-client';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  requires_browser: boolean;
  /** ID of the persisted browser session (cookies/storage) for this agent. Null until a browser run completes. */
  browser_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentAction {
  id: string;
  agent_id: string;
  name: string;
  action_type: 'agent' | 'approval' | 'login' | 'browser_script';
  prompt?: string | null;
  connector_ids?: string[] | null;
  model: string;
  skill_ids?: string[];
  approval_instructions?: string | null;
  notify_user_id?: string | null;
  prior_action_id?: string | null;
  next_action_id?: string | null;
  order_index: number;
  /** browser_script actions only */
  script_id?: string | null;
  script_params?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
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
}

export interface AgentDetail extends Agent {
  actions: AgentAction[] | null;
  triggers: AgentTrigger[] | null;
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

export async function getAgents(orgId: string) {
  const res = await agentClient.get<{ agents?: Agent[] } | Agent[]>(
    `/api/admin/${orgId}/agents`
  );
  // Handle both array and wrapped response shapes
  const data = res.data as any;
  return { agents: Array.isArray(data) ? data : (data.agents ?? []) } as { agents: Agent[] };
}

export async function getAgent(orgId: string, agentId: string) {
  const res = await agentClient.get<AgentDetail>(`/api/admin/${orgId}/agents/${agentId}`);
  return res.data;
}

export async function createAgent(orgId: string, data: { name: string; description?: string }) {
  const res = await agentClient.post<Agent>(`/api/admin/${orgId}/agents`, data);
  return res.data;
}

export async function updateAgent(orgId: string, agentId: string, data: { name?: string; description?: string; is_active?: boolean; requires_browser?: boolean }) {
  const res = await agentClient.patch<Agent>(`/api/admin/${orgId}/agents/${agentId}`, data);
  return res.data;
}

export async function deleteAgent(orgId: string, agentId: string) {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}`);
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

export async function getApprovals(orgId: string, params?: { status?: string; agent_id?: string; execution_id?: string; page?: number; limit?: number }) {
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
  trigger_type: 'webhook' | 'cron' | 'manual';
  trigger_id: string | null;
  status: 'executing' | 'completed' | 'failed' | 'aborted' | 'awaiting_approval' | 'provisioning' | 'queued';
  display_status: 'executing' | 'completed' | 'failed' | 'aborted' | 'awaiting_approval' | 'awaiting_login' | 'provisioning' | 'queued';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  action_logs: ExecutionAction[];
}

export interface ExecutionAction {
  id: string;
  action_name: string | null;
  action_type: 'agent' | 'approval' | 'login' | 'browser_script';
  status: string;
  started_at: string;
  output: string | null;
  error_message: string | null;
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
 */
export async function resumeBrowserRun(runId: string): Promise<void> {
  await agentClient.post(`/agent/run/${runId}/resume`);
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
