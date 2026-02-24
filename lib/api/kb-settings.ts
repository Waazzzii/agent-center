import apiClient from './client';
import type {
  KbOrgSettings,
  VercelDomainStatus,
  ProvisionDomainResult,
  DomainProvisioningStatus,
} from '@/types/api.types';

export interface KbSettingsResponse {
  settings: KbOrgSettings;
  custom_domain_status: VercelDomainStatus | null;
  logo_url: string | null;
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
    vendor_enabled?: boolean;
    internal_enabled?: boolean;
    owner_enabled?: boolean;
    guest_enabled?: boolean;
    custom_theme?: string | null;
  }
): Promise<KbSettingsResponse> {
  const response = await apiClient.put<KbSettingsResponse>(
    `/admin/organizations/${orgId}/kb-settings`,
    data
  );
  return response.data;
}

/** Provision a domain for the KB instance. */
export async function provisionDomain(
  orgId: string,
  domainType: 'wazzi' | 'custom',
  domain?: string
): Promise<ProvisionDomainResult> {
  const response = await apiClient.post<ProvisionDomainResult>(
    `/admin/organizations/${orgId}/kb-settings/provision-domain`,
    { domain_type: domainType, ...(domain ? { domain } : {}) }
  );
  return response.data;
}

/**
 * Check whether a domain is reachable (server-side fetch to avoid CORS).
 * If reachable, the backend transitions status → "active".
 */
export async function checkDomain(
  orgId: string,
  type: 'auto' | 'custom'
): Promise<{ reachable: boolean; status: DomainProvisioningStatus | null }> {
  const response = await apiClient.get<{ reachable: boolean; status: DomainProvisioningStatus | null }>(
    `/admin/organizations/${orgId}/kb-settings/check-domain`,
    { params: { type } }
  );
  return response.data;
}

/**
 * Explicitly set a domain's lifecycle status.
 * Used to mark a domain as "failed" after the 30-minute verification timeout.
 */
export async function setDomainStatus(
  orgId: string,
  type: 'auto' | 'custom',
  status: Extract<DomainProvisioningStatus, 'failed' | 'verifying'>
): Promise<void> {
  await apiClient.patch(
    `/admin/organizations/${orgId}/kb-settings/domain-status`,
    { type, status }
  );
}
