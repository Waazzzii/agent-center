import apiClient from './client';
import type { AccessGroup, CreateAccessGroupDto, UpdateAccessGroupDto } from '@/types/api.types';

export async function getAccessGroups(orgId: string) {
  const response = await apiClient.get<{ access_groups: AccessGroup[]; total: number }>(
    `/admin/organizations/${orgId}/access-groups`
  );
  return response.data;
}

export async function getAccessGroup(orgId: string, accessGroupId: string) {
  const response = await apiClient.get<AccessGroup>(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}`
  );
  return response.data;
}

export async function createAccessGroup(orgId: string, data: CreateAccessGroupDto) {
  const response = await apiClient.post<AccessGroup>(
    `/admin/organizations/${orgId}/access-groups`,
    data
  );
  return response.data;
}

export async function updateAccessGroup(orgId: string, accessGroupId: string, data: UpdateAccessGroupDto) {
  const response = await apiClient.patch<AccessGroup>(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}`,
    data
  );
  return response.data;
}

export async function updateAccessGroupAccess(
  orgId: string,
  accessGroupId: string,
  access: Record<string, boolean>
) {
  const response = await apiClient.put<AccessGroup>(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}/access`,
    { access }
  );
  return response.data;
}

export async function deleteAccessGroup(orgId: string, accessGroupId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/access-groups/${accessGroupId}`);
}

export async function getAccessGroupUsers(orgId: string, accessGroupId: string) {
  const response = await apiClient.get<{ users: any[]; total: number }>(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}/users`
  );
  return response.data;
}

export async function addUsersToAccessGroup(orgId: string, accessGroupId: string, userIds: string[]) {
  const response = await apiClient.post(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}/users`,
    { user_ids: userIds }
  );
  return response.data;
}

export async function removeUsersFromAccessGroup(orgId: string, accessGroupId: string, userIds: string[]) {
  await apiClient.delete(
    `/admin/organizations/${orgId}/access-groups/${accessGroupId}/users`,
    { data: { user_ids: userIds } }
  );
}

export async function getUserAccessGroups(orgId: string, userId: string) {
  const response = await apiClient.get<{ access_groups: AccessGroup[]; total: number }>(
    `/admin/organizations/${orgId}/users/${userId}/access-groups`
  );
  return response.data;
}

export async function assignAccessGroupsToUser(orgId: string, userId: string, accessGroupIds: string[]) {
  const response = await apiClient.post(
    `/admin/organizations/${orgId}/users/${userId}/access-groups`,
    { access_group_ids: accessGroupIds }
  );
  return response.data;
}

export async function removeAccessGroupsFromUser(orgId: string, userId: string, accessGroupIds: string[]) {
  await apiClient.delete(
    `/admin/organizations/${orgId}/users/${userId}/access-groups`,
    { data: { access_group_ids: accessGroupIds } }
  );
}

