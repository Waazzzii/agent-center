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

// Add user to group
export async function addUserToGroup(orgId: string, userId: string, groupId: string) {
  const response = await apiClient.post(
    `/admin/organizations/${orgId}/users/${userId}/groups/${groupId}`
  );
  return response.data;
}

// Remove user from group
export async function removeUserFromGroup(orgId: string, userId: string, groupId: string) {
  await apiClient.delete(
    `/admin/organizations/${orgId}/users/${userId}/groups/${groupId}`
  );
}
