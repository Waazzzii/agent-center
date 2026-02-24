import apiClient from './client';

function kbHeaders(kbDomain: string) {
  return { 'X-KB-Domain': kbDomain };
}

export async function fetchKbLogoBlob(kbDomain: string, storagePath: string): Promise<string> {
  const response = await apiClient.get<Blob>(`/kb/logo/content?v=${encodeURIComponent(storagePath)}`, {
    headers: kbHeaders(kbDomain),
    responseType: 'blob',
  });
  return URL.createObjectURL(response.data);
}

export async function uploadKbLogo(kbDomain: string, file: File): Promise<{ storage_path: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ storage_path: string }>('/kb/logo', formData, {
    headers: {
      ...kbHeaders(kbDomain),
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
}

export async function deleteKbLogo(kbDomain: string): Promise<void> {
  await apiClient.delete('/kb/logo', {
    headers: kbHeaders(kbDomain),
  });
}
