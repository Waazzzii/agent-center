import apiClient from './client';
import type { PermissionDefinition } from '@/types/api.types';

export async function getAccessDefinitions(orgId?: string): Promise<PermissionDefinition[]> {
  const url = orgId
    ? `/admin/access-definitions?org_id=${encodeURIComponent(orgId)}`
    : '/admin/access-definitions';
  const response = await apiClient.get<{ definitions: PermissionDefinition[] }>(url);
  return response.data.definitions;
}

/** @deprecated Use getAccessDefinitions instead */
export const getPermissionDefinitions = getAccessDefinitions;

export async function getUserPermissions(
  orgId: string,
  userId: string
): Promise<Record<string, boolean>> {
  const response = await apiClient.get<{ permissions: Record<string, boolean> }>(
    `/admin/organizations/${orgId}/users/${userId}/permissions`
  );
  return response.data.permissions;
}

export async function updateUserPermissions(
  orgId: string,
  userId: string,
  permissions: Record<string, boolean>
): Promise<void> {
  await apiClient.put(`/admin/organizations/${orgId}/users/${userId}/permissions`, {
    permissions,
  });
}
