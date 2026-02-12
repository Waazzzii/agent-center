import apiClient from './client';
import type { Organization } from '@/types/api.types';

export async function getOrganizations() {
  const response = await apiClient.get<{ organizations: Organization[]; total: number }>('/admin/organizations');
  return response.data;
}

export async function getOrganization(id: string) {
  const response = await apiClient.get<Organization>(`/admin/organizations/${id}`);
  return response.data;
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
  groups_enabled?: boolean;
}) {
  const response = await apiClient.post<Organization>('/admin/organizations', data);
  return response.data;
}

export async function updateOrganization(id: string, data: Partial<Organization>) {
  const response = await apiClient.patch<Organization>(`/admin/organizations/${id}`, data);
  return response.data;
}

export async function deleteOrganization(id: string) {
  await apiClient.delete(`/admin/organizations/${id}`);
}
