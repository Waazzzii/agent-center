import apiClient from './client';
import type { User, CreateUserDto, UpdateUserDto } from '@/types/api.types';

export async function getUsers(orgId: string) {
  const response = await apiClient.get<{ users: User[]; total: number }>(
    `/admin/organizations/${orgId}/users`
  );
  return response.data;
}

export async function getUser(orgId: string, userId: string) {
  const response = await apiClient.get<User>(
    `/admin/organizations/${orgId}/users/${userId}`
  );
  return response.data;
}

export async function createUser(orgId: string, data: CreateUserDto) {
  const response = await apiClient.post<User>(
    `/admin/organizations/${orgId}/users`,
    data
  );
  return response.data;
}

export async function updateUser(
  orgId: string,
  userId: string,
  data: UpdateUserDto
) {
  const response = await apiClient.patch<User>(
    `/admin/organizations/${orgId}/users/${userId}`,
    data
  );
  return response.data;
}

export async function deleteUser(orgId: string, userId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/users/${userId}`);
}
