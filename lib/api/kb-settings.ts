import apiClient from './client';
import type {
  KbOrgSettings,
  VercelDomainStatus,
} from '@/types/api.types';

export interface KbSettingsResponse {
  settings: KbOrgSettings;
  custom_domain_status: VercelDomainStatus | null;
  logo_url: string | null;
  favicon_url: string | null;
}

export async function getKbSettings(orgId: string): Promise<KbSettingsResponse> {
  const response = await apiClient.get<KbSettingsResponse>(
    `/admin/organizations/${orgId}/kb-settings`
  );
  return response.data;
}

export async function updateKbSettings(
  orgId: string,
  data: {
    is_enabled?: boolean;
    name?: string | null;
    custom_domain?: string | null;
    custom_theme?: string | null;
  }
): Promise<KbSettingsResponse> {
  const response = await apiClient.put<KbSettingsResponse>(
    `/admin/organizations/${orgId}/kb-settings`,
    data
  );
  return response.data;
}

