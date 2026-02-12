/**
 * Administrators API Client
 */

import apiClient from './client';
import { Administrator, CreateAdministratorDto, UpdateAdministratorDto } from '@/types/api.types';

export interface ListAdministratorsResponse {
  administrators: Administrator[];
  total: number;
}

export async function getAdministrators(): Promise<ListAdministratorsResponse> {
  const response = await apiClient.get('/admin/administrators');
  return response.data;
}

export async function getAdministrator(id: string): Promise<Administrator> {
  const response = await apiClient.get(`/admin/administrators/${id}`);
  return response.data;
}

export async function createAdministrator(data: CreateAdministratorDto): Promise<Administrator> {
  const response = await apiClient.post('/admin/administrators', data);
  return response.data;
}

export async function updateAdministrator(id: string, data: UpdateAdministratorDto): Promise<Administrator> {
  const response = await apiClient.patch(`/admin/administrators/${id}`, data);
  return response.data;
}

export async function deleteAdministrator(id: string): Promise<void> {
  await apiClient.delete(`/admin/administrators/${id}`);
}
