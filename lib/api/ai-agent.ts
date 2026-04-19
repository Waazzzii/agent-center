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

export interface AgentCapacity {
  max_concurrent_agents: number | null;
  max_concurrent_browsers: number | null;
  active_agents: number;
  active_browser_slots: number;
  active_agent_browser_slots: number;
  queued_agents: number;
}

export async function getAgentCapacity(orgId: string): Promise<AgentCapacity> {
  const response = await apiClient.get<AgentCapacity>(
    `/admin/organizations/${orgId}/ai-agent/capacity`
  );
  return response.data;
}
