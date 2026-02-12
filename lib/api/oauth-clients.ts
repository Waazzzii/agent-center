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

export async function createOAuthClient(data: {
  client_id: string;
  organization_id: string;
  client_name: string;
  redirect_uri: string;
}) {
  const response = await apiClient.post<OAuthClient>('/admin/oauth-clients', data);
  return response.data;
}

export async function updateOAuthClient(
  clientId: string,
  data: {
    client_name?: string;
    redirect_uri?: string;
    organization_id?: string;
    is_active?: boolean;
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
