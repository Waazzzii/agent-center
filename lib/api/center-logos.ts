import apiClient from './client';

export async function fetchCenterLogoBlob(orgId: string): Promise<string> {
  const response = await apiClient.get<Blob>(
    `/admin/organizations/${orgId}/center-settings/logo?t=${Date.now()}`,
    { responseType: 'blob' }
  );
  return URL.createObjectURL(response.data);
}

export async function uploadCenterLogo(orgId: string, file: File): Promise<{ logo_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ logo_url: string }>(
    `/admin/organizations/${orgId}/center-settings/logo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export async function deleteCenterLogo(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/center-settings/logo`);
}

export async function uploadCenterFavicon(orgId: string, file: File): Promise<{ favicon_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ favicon_url: string }>(
    `/admin/organizations/${orgId}/center-settings/favicon`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export async function fetchCenterFaviconBlob(orgId: string): Promise<string> {
  const response = await apiClient.get<Blob>(
    `/admin/organizations/${orgId}/center-settings/favicon?t=${Date.now()}`,
    { responseType: 'blob' }
  );
  return URL.createObjectURL(response.data);
}

export async function deleteCenterFavicon(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/center-settings/favicon`);
}
