/**
 * User Groups API Client
 */

import apiClient from './client';

export interface GroupMembership {
  id: string;
  name: string;
  slug: string;
  description?: string;
  joined_at: string;
}

export interface UserMembership {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  is_active: boolean;
  joined_at: string;
}

// Get all groups a user belongs to
export async function getUserGroups(orgId: string, userId: string) {
  const response = await apiClient.get<{ groups: GroupMembership[]; total: number }>(
    `/admin/organizations/${orgId}/users/${userId}/groups`
  );
  return response.data;
}

// Get all users in a group
export async function getGroupUsers(orgId: string, groupId: string) {
  const response = await apiClient.get<{ users: UserMembership[]; total: number }>(
    `/admin/organizations/${orgId}/groups/${groupId}/users`
  );
  return response.data;
}

// Add multiple groups to a user
export async function addGroupsToUser(orgId: string, userId: string, groupIds: string[]) {
  const response = await apiClient.post(
    `/admin/organizations/${orgId}/users/${userId}/groups`,
    { group_ids: groupIds }
  );
  return response.data;
}

// Remove multiple groups from a user
export async function removeGroupsFromUser(orgId: string, userId: string, groupIds: string[]) {
  await apiClient.delete(
    `/admin/organizations/${orgId}/users/${userId}/groups`,
    { data: { group_ids: groupIds } }
  );
}

// Add multiple users to a group
export async function addUsersToGroup(orgId: string, groupId: string, userIds: string[]) {
  const response = await apiClient.post(
    `/admin/organizations/${orgId}/groups/${groupId}/users`,
    { user_ids: userIds }
  );
  return response.data;
}

// Remove multiple users from a group
export async function removeUsersFromGroup(orgId: string, groupId: string, userIds: string[]) {
  await apiClient.delete(
    `/admin/organizations/${orgId}/groups/${groupId}/users`,
    { data: { user_ids: userIds } }
  );
}
