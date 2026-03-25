import apiClient from './client';

export interface KbPortal {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  access_level: 'public' | 'public_noindex' | 'authenticated';
  default_language: string;
  supported_languages: string[];
  description: string | null;
  seo_crawlable: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type CreatePortalDto = {
  name: string;
  slug: string;
  access_level: 'public' | 'public_noindex' | 'authenticated';
  default_language?: string;
  supported_languages?: string[];
  description?: string | null;
  seo_crawlable?: boolean;
  enabled?: boolean;
};

export type UpdatePortalDto = Partial<Omit<CreatePortalDto, 'slug'> & { slug: string; enabled: boolean }>;

export async function listKbPortals(orgId: string): Promise<KbPortal[]> {
  const response = await apiClient.get<{ portals: KbPortal[] }>(
    `/admin/organizations/${orgId}/kb-portals`,
  );
  return response.data.portals;
}

export async function createKbPortal(orgId: string, data: CreatePortalDto): Promise<KbPortal> {
  const response = await apiClient.post<{ portal: KbPortal }>(
    `/admin/organizations/${orgId}/kb-portals`,
    data,
  );
  return response.data.portal;
}

export async function updateKbPortal(orgId: string, portalId: string, data: UpdatePortalDto): Promise<KbPortal> {
  const response = await apiClient.patch<{ portal: KbPortal }>(
    `/admin/organizations/${orgId}/kb-portals/${portalId}`,
    data,
  );
  return response.data.portal;
}

export async function deleteKbPortal(orgId: string, portalId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/kb-portals/${portalId}`);
}

export async function seedDefaultKbPortals(orgId: string): Promise<KbPortal[]> {
  const response = await apiClient.post<{ portals: KbPortal[] }>(
    `/admin/organizations/${orgId}/kb-portals/seed-defaults`,
  );
  return response.data.portals;
}
