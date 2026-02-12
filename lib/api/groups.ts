import apiClient from './client';
import type { Group, CreateGroupDto, UpdateGroupDto } from '@/types/api.types';

export async function getGroups(orgId: string) {
  const response = await apiClient.get<{ groups: Group[]; total: number }>(
    `/admin/organizations/${orgId}/groups`
  );
  return response.data;
}

export async function getGroup(orgId: string, groupId: string) {
  const response = await apiClient.get<Group>(
    `/admin/organizations/${orgId}/groups/${groupId}`
  );
  return response.data;
}

export async function createGroup(orgId: string, data: CreateGroupDto) {
  const response = await apiClient.post<Group>(
    `/admin/organizations/${orgId}/groups`,
    data
  );
  return response.data;
}

export async function updateGroup(orgId: string, groupId: string, data: UpdateGroupDto) {
  const response = await apiClient.patch<Group>(
    `/admin/organizations/${orgId}/groups/${groupId}`,
    data
  );
  return response.data;
}

export async function deleteGroup(orgId: string, groupId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/groups/${groupId}`);
}
