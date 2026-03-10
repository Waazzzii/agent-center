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
  action_type: 'prompt' | 'hitl';
  prompt?: string | null;
  connector_ids?: string[] | null;
  model: string;
  hitl_instructions?: string | null;
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
  trigger_type: 'webhook' | 'cron' | 'manual' | 'hitl';
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

export interface AgentHitlItem {
  id: string;
  agent_id: string;
  action_id: string;
  execution_run_id?: string | null;
  context: Record<string, unknown>;
  status: 'pending' | 'approved' | 'denied';
  decided_by?: string | null;
  decided_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  agent_name?: string;
  action_name?: string;
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
  const res = await apiClient.post<{ rawKey: string; record: AgentWebhookKey }>(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-keys`);
  return res.data;
}

export async function listWebhookKeys(orgId: string, agentId: string, triggerId: string) {
  const res = await apiClient.get<AgentWebhookKey[]>(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-keys`);
  return res.data;
}

export async function revokeWebhookKey(orgId: string, agentId: string, triggerId: string, keyId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/agents/${agentId}/triggers/${triggerId}/webhook-keys/${keyId}`);
}

// ─── HITL ─────────────────────────────────────────────────────

export async function getPendingHitl(orgId: string) {
  const res = await apiClient.get<{ items: AgentHitlItem[] }>(`/admin/organizations/${orgId}/hitl`);
  return res.data;
}

export async function approveHitl(orgId: string, hitlId: string) {
  const res = await apiClient.post<AgentHitlItem>(`/admin/organizations/${orgId}/hitl/${hitlId}/approve`);
  return res.data;
}

export async function denyHitl(orgId: string, hitlId: string) {
  const res = await apiClient.post<AgentHitlItem>(`/admin/organizations/${orgId}/hitl/${hitlId}/deny`);
  return res.data;
}

// ─── Execution History ────────────────────────────────────────

export async function getExecutionHistory(orgId: string, params?: { from?: string; to?: string; agent_id?: string; user_id?: string; action?: string; limit?: number }) {
  const res = await apiClient.get(`/admin/organizations/${orgId}/execution-history`, { params });
  return res.data;
}
