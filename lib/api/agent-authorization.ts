import apiClient from './client';
import type { AgentAuthorizationStatus } from '@/types/api.types';

export async function getAgentAuthorizationStatus(orgId: string): Promise<AgentAuthorizationStatus> {
  const response = await apiClient.get<AgentAuthorizationStatus>(
    `/admin/organizations/${orgId}/agent-authorization`
  );
  return response.data;
}

export async function authorizeAgent(orgId: string): Promise<AgentAuthorizationStatus> {
  const response = await apiClient.post<AgentAuthorizationStatus>(
    `/admin/organizations/${orgId}/agent-authorization`
  );
  return response.data;
}

export async function disconnectAgentAuthorization(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/agent-authorization`);
}
