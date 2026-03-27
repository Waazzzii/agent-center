import apiClient from './client';
import type {
  CenterOrgSettings,
  CenterConnectorConfig,
  VercelDomainStatus,
} from '@/types/api.types';

export interface CenterSettingsResponse {
  settings: CenterOrgSettings;
  custom_domain_status: VercelDomainStatus | null;
  logo_url: string | null;
  favicon_url: string | null;
}

export async function getCenterSettings(orgId: string): Promise<CenterSettingsResponse> {
  const response = await apiClient.get<CenterSettingsResponse>(
    `/admin/organizations/${orgId}/center-settings`,
  );
  return response.data;
}

export async function updateCenterSettings(
  orgId: string,
  data: {
    is_enabled?: boolean;
    name?: string | null;
    custom_domain?: string | null;
    custom_theme?: string | null;
    connector_config?: CenterConnectorConfig;
  },
): Promise<CenterSettingsResponse> {
  const response = await apiClient.put<CenterSettingsResponse>(
    `/admin/organizations/${orgId}/center-settings`,
    data,
  );
  return response.data;
}

