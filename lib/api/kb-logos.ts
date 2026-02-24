import apiClient from './client';

export async function fetchKbLogoBlob(orgId: string): Promise<string> {
  const response = await apiClient.get<Blob>(
    `/admin/organizations/${orgId}/kb-settings/logo`,
    { responseType: 'blob' }
  );
  return URL.createObjectURL(response.data);
}

export async function uploadKbLogo(orgId: string, file: File): Promise<{ logo_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ logo_url: string }>(
    `/admin/organizations/${orgId}/kb-settings/logo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export async function deleteKbLogo(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/kb-settings/logo`);
}
