import apiClient from './client';
import type { OAuthClient } from '@/types/api.types';

export async function getOAuthClients() {
  const response = await apiClient.get<{ clients: OAuthClient[]; total: number }>(
    '/admin/oauth-clients'
  );
  return response.data;
}

export async function getOAuthClient(clientId: string) {
  const response = await apiClient.get<OAuthClient>(`/admin/oauth-clients/${clientId}`);
  return response.data;
}

export interface CreateOAuthClientData {
  client_id: string;
  client_name: string;
  organization_id?: string;  // Required for MCP clients, optional for platform clients
  redirect_uri?: string;      // Required for MCP clients, optional for platform clients
  description?: string;
  refresh_token_expiry_seconds?: number | null;
}

export async function createOAuthClient(data: CreateOAuthClientData) {
  const response = await apiClient.post<OAuthClient>(
    '/admin/oauth-clients',
    data
  );
  return response.data;
}

export async function updateOAuthClient(
  clientId: string,
  data: {
    client_name?: string;
    redirect_uri?: string;
    organization_id?: string;
    is_active?: boolean;
    description?: string;
    refresh_token_expiry_seconds?: number | null;
  }
) {
  const response = await apiClient.patch<OAuthClient>(
    `/admin/oauth-clients/${clientId}`,
    data
  );
  return response.data;
}

export async function deleteOAuthClient(clientId: string) {
  await apiClient.delete(`/admin/oauth-clients/${clientId}`);
}
