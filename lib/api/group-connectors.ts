/**
 * Group Connectors API Client
 */

import apiClient from './client';
import { GroupConnector, CreateGroupConnectorDto, UpdateGroupConnectorDto } from '@/types/api.types';

export interface ListGroupConnectorsResponse {
  connectors: GroupConnector[];
  total: number;
}

// List connectors for a group
export async function getGroupConnectors(orgId: string, groupId: string): Promise<ListGroupConnectorsResponse> {
  const response = await apiClient.get(`/admin/organizations/${orgId}/groups/${groupId}/connectors`);
  return response.data;
}

// Get specific group connector
export async function getGroupConnector(
  orgId: string,
  groupId: string,
  connectorId: string
): Promise<GroupConnector> {
  const response = await apiClient.get(
    `/admin/organizations/${orgId}/groups/${groupId}/connectors/${connectorId}`
  );
  return response.data;
}

// Add connector to group
export async function addConnectorToGroup(
  orgId: string,
  groupId: string,
  data: CreateGroupConnectorDto
): Promise<GroupConnector> {
  const response = await apiClient.post(`/admin/organizations/${orgId}/groups/${groupId}/connectors`, data);
  return response.data;
}

// Update group connector
export async function updateGroupConnector(
  orgId: string,
  groupId: string,
  connectorId: string,
  data: UpdateGroupConnectorDto
): Promise<GroupConnector> {
  const response = await apiClient.patch(
    `/admin/organizations/${orgId}/groups/${groupId}/connectors/${connectorId}`,
    data
  );
  return response.data;
}

// Remove connector from group
export async function removeConnectorFromGroup(
  orgId: string,
  groupId: string,
  connectorId: string
): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/groups/${groupId}/connectors/${connectorId}`);
}
