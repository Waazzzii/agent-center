import apiClient from './client';
import type { AgentAuthorizationStatus } from '@/types/api.types';

export interface AiAgentStatus extends AgentAuthorizationStatus {
  has_anthropic_key: boolean;
  anthropic_key_masked: string | null;
}

export async function getAiAgentStatus(orgId: string): Promise<AiAgentStatus> {
  const response = await apiClient.get<AiAgentStatus>(`/admin/organizations/${orgId}/ai-agent`);
  return response.data;
}

export async function enableAgent(orgId: string): Promise<AgentAuthorizationStatus> {
  const response = await apiClient.post<AgentAuthorizationStatus>(
    `/admin/organizations/${orgId}/ai-agent/enable`
  );
  return response.data;
}

export async function disableAgent(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/ai-agent`);
}

export async function saveAnthropicKey(orgId: string, api_key: string): Promise<{ anthropic_key_masked: string }> {
  const response = await apiClient.put<{ anthropic_key_masked: string }>(
    `/admin/organizations/${orgId}/ai-agent/anthropic-key`,
    { api_key }
  );
  return response.data;
}

export async function removeAnthropicKey(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/ai-agent/anthropic-key`);
}

export interface CapacityWorker {
  worker_id: string;
  status: string;            // 'ready' | 'draining'
  reserved: boolean;         // pinned to this org (vs shared/dev worker)
  memory_pct: number | null; // 0..1 utilization from worker heartbeat telemetry
  cpu_pct: number | null;    // 0..1 utilization (EMA) from worker heartbeat telemetry
  gated: string[];           // admission-gated resources; non-empty = pod refusing new work
  last_seen: number;         // epoch ms
}

export interface AgentCapacity {
  max_concurrent_agents: number | null;
  max_concurrent_browsers: number | null;
  active_agents: number;
  active_browser_slots: number;
  active_agent_browser_slots: number;
  queued_agents: number;
  /** Reserved worker pods serving this org (may be absent on older backends). */
  workers?: CapacityWorker[];
}

export async function getAgentCapacity(orgId: string): Promise<AgentCapacity> {
  const response = await apiClient.get<AgentCapacity>(
    `/admin/organizations/${orgId}/ai-agent/capacity`
  );
  return response.data;
}

/**
 * One capacity-blockage window: opened on the first refused browser
 * allocation, extended while refusals continue, closed by the next
 * successful allocation. ongoing = blocked right now.
 */
export interface CapacityEvent {
  id: string;
  kind: 'at_capacity' | 'no_workers';
  reason: string | null;
  refusal_count: number;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  ongoing: boolean;
}

export async function getCapacityEvents(
  orgId: string,
  range?: { from?: string; to?: string }
): Promise<CapacityEvent[]> {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  const qs = params.toString();
  const response = await apiClient.get<{ events: CapacityEvent[] }>(
    `/admin/organizations/${orgId}/ai-agent/capacity-events${qs ? `?${qs}` : ''}`
  );
  return response.data.events ?? [];
}
