import apiClient from './client';
import type { OrganizationConnector } from '@/types/api.types';

export async function getConnectors(orgId: string) {
  const response = await apiClient.get<{ connectors: OrganizationConnector[]; total: number }>(
    `/admin/organizations/${orgId}/connectors`
  );
  return response.data;
}

export async function getConnector(orgId: string, connectorId: string) {
  const response = await apiClient.get<OrganizationConnector>(
    `/admin/organizations/${orgId}/connectors/${connectorId}`
  );
  return response.data;
}

export async function createConnector(
  orgId: string,
  data: {
    connector_id: string;
    config?: Record<string, any>;
    secrets?: Record<string, any>;
    is_enabled?: boolean;
  }
) {
  const response = await apiClient.post<OrganizationConnector>(
    `/admin/organizations/${orgId}/connectors`,
    data
  );
  return response.data;
}

export async function updateConnector(
  orgId: string,
  connectorId: string,
  data: {
    config?: Record<string, any>;
    secrets?: Record<string, any>;
    is_enabled?: boolean;
  }
) {
  const response = await apiClient.patch<OrganizationConnector>(
    `/admin/organizations/${orgId}/connectors/${connectorId}`,
    data
  );
  return response.data;
}

export async function deleteConnector(orgId: string, connectorId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/connectors/${connectorId}`);
}

export async function getConnectorGroups(orgId: string, connectorId: string) {
  const response = await apiClient.get<{ groups: any[]; total: number }>(
    `/admin/organizations/${orgId}/connectors/${connectorId}/groups`
  );
  return response.data;
}
