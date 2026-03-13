import apiClient from './client';

export interface Agent {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAction {
  id: string;
  agent_id: string;
  name: string;
  action_type: 'agent' | 'approval';
  prompt?: string | null;
  connector_ids?: string[] | null;
  model: string;
  skill_ids?: string[];
  approval_instructions?: string | null;
  notify_user_id?: string | null;
  prior_action_id?: string | null;
  next_action_id?: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AgentTrigger {
  id: string;
  agent_id: string;
  trigger_type: 'webhook' | 'cron' | 'manual';
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentWebhookKey {
  id: string;
  agent_trigger_id: string;
  key_prefix: string;
  is_active: boolean;
  created_at: string;
}

export interface AgentApprovalItem {
  id: string;
  execution_log_id: string;
  action_id: string;
  action_name: string;
  action_type: string;
  status: 'awaiting_approval' | 'approved' | 'denied';
  output: string | null;
  executed_by: string | null;
  started_at: string;
  completed_at: string | null;
  agent_id: string;
  agent_name: string;
  approval_instructions: string | null;
}

export interface AgentDetail extends Agent {
  actions: AgentAction[];
  triggers: AgentTrigger[];
}

// ─── Agents ───────────────────────────────────────────────────

export async function getAgents(orgId: string) {
  const res = await apiClient.get<{ agents: Agent[] }>(`/admin/organizations/${orgId}/agents`);
  return res.data;
}

export async function getAgent(orgId: string, agentId: string) {
  const res = await apiClient.get<AgentDetail>(`/admin/organizations/${orgId}/agents/${agentId}`);
  return res.data;
}

export async function createAgent(orgId: string, data: { name: string; description?: string }) {
  const res = await apiClient.post<Agent>(`/admin/organizations/${orgId}/agents`, data);
  return res.data;
}

export async function updateAgent(orgId: string, agentId: string, data: { name?: string; description?: string; is_active?: boolean }) {
  const res = await apiClient.patch<Agent>(`/admin/organizations/${orgId}/agents/${agentId}`, data);
  return res.data;
}

export async function deleteAgent(orgId: string, agentId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/agents/${agentId}`);
}

// ─── Actions ──────────────────────────────────────────────────

export async function getActions(orgId: string, agentId: string) {
  const res = await apiClient.get<AgentAction[]>(`/admin/organizations/${orgId}/agents/${agentId}/actions`);
  return res.data;
}

export async function createAction(orgId: string, agentId: string, data: Partial<AgentAction>) {
  const res = await apiClient.post<AgentAction>(`/admin/organizations/${orgId}/agents/${agentId}/actions`, data);
  return res.data;
}

export async function updateAction(orgId: string, agentId: string, actionId: string, data: Partial<AgentAction>) {
  const res = await apiClient.patch<AgentAction>(`/admin/organizations/${orgId}/agents/${agentId}/actions/${actionId}`, data);
  return res.data;
}

export async function deleteAction(orgId: string, agentId: string, actionId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/agents/${agentId}/actions/${actionId}`);
}

export async function reorderActions(orgId: string, agentId: string, orderedIds: string[]) {
  const res = await apiClient.post<AgentAction[]>(`/admin/organizations/${orgId}/agents/${agentId}/actions/reorder`, { ordered_ids: orderedIds });
  return res.data;
}

// ─── Triggers ─────────────────────────────────────────────────

export async function getTriggers(orgId: string, agentId: string) {
  const res = await apiClient.get<AgentTrigger[]>(`/admin/organizations/${orgId}/agents/${agentId}/triggers`);
  return res.data;
}

export async function createTrigger(orgId: string, agentId: string, data: { trigger_type: string; config?: Record<string, unknown> }) {
  const res = await apiClient.post<AgentTrigger>(`/admin/organizations/${orgId}/agents/${agentId}/triggers`, data);
  return res.data;
}

export async function updateTrigger(orgId: string, agentId: string, triggerId: string, data: Partial<AgentTrigger>) {
  const res = await apiClient.patch<AgentTrigger>(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}`, data);
  return res.data;
}

export async function deleteTrigger(orgId: string, agentId: string, triggerId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}`);
}

export async function generateWebhookKey(orgId: string, agentId: string, triggerId: string) {
  const res = await apiClient.post<{ raw_key: string; key: AgentWebhookKey }>(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-key`);
  return res.data;
}

export async function getWebhookKey(orgId: string, agentId: string, triggerId: string) {
  const res = await apiClient.get<{ key: AgentWebhookKey | null }>(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-key`);
  return res.data.key;
}

export async function runAgent(orgId: string, agentId: string) {
  const res = await apiClient.post(`/admin/organizations/${orgId}/agents/${agentId}/run`);
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
  params?: { status?: string; page?: number; limit?: number }
) {
  const res = await apiClient.get<ApprovalsListResponse>(`/admin/organizations/${orgId}/approvals`, { params });
  return res.data;
}

export async function approveApproval(orgId: string, approvalId: string) {
  const res = await apiClient.post<AgentApprovalItem>(`/admin/organizations/${orgId}/approvals/${approvalId}/approve`);
  return res.data;
}

export async function denyApproval(orgId: string, approvalId: string) {
  const res = await apiClient.post<AgentApprovalItem>(`/admin/organizations/${orgId}/approvals/${approvalId}/deny`);
  return res.data;
}

// ─── Execution History ────────────────────────────────────────

export interface ExecutionRun {
  id: string;
  agent_id: string;
  agent_name: string;
  trigger_type: 'webhook' | 'cron' | 'manual';
  status: 'executing' | 'completed' | 'failed' | 'awaiting_approval';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number;
  actions: ExecutionAction[];
}

export interface ExecutionAction {
  id: string;
  action_id: string;
  action_name: string;
  action_type: 'agent' | 'approval';
  status: string;
  output: string | null;
  error_message: string | null;
  executed_by: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ExecutionHistoryResponse {
  runs: ExecutionRun[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export async function getExecutionHistory(
  orgId: string,
  params?: {
    from?: string;
    to?: string;
    agent_id?: string;
    status?: string;
    trigger_type?: string;
    page?: number;
    limit?: number;
  }
): Promise<ExecutionHistoryResponse> {
  const res = await apiClient.get<ExecutionHistoryResponse>(`/admin/organizations/${orgId}/execution-history`, { params });
  return res.data;
}
