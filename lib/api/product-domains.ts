import apiClient from './client';
import type { OrgProductSettings, DomainProvisioningStatus } from '@/types/api.types';

export interface ProductDomainProvisionResult {
  domain: string;
  domain_type: 'auto' | 'custom';
  cname_target: string;
  dns_instructions: {
    type: 'CNAME';
    name: string;
    value: string;
    auto_provisioned: boolean;
    note: string;
  };
  settings: OrgProductSettings;
}

export async function provisionProductDomain(
  orgId: string,
  product: string,
  domainType: 'auto' | 'custom',
  domain?: string,
): Promise<ProductDomainProvisionResult> {
  const response = await apiClient.post<ProductDomainProvisionResult>(
    `/admin/organizations/${orgId}/product-domains/provision`,
    { product, domain_type: domainType, ...(domain ? { domain } : {}) },
  );
  return response.data;
}

export async function checkProductDomain(
  orgId: string,
  product: string,
  type: 'auto' | 'custom',
): Promise<{ reachable: boolean; status: DomainProvisioningStatus | null }> {
  const response = await apiClient.get<{ reachable: boolean; status: DomainProvisioningStatus | null }>(
    `/admin/organizations/${orgId}/product-domains/check`,
    { params: { product, type } },
  );
  return response.data;
}

export async function setProductDomainStatus(
  orgId: string,
  product: string,
  type: 'auto' | 'custom',
  status: Extract<DomainProvisioningStatus, 'failed' | 'verifying'>,
): Promise<void> {
  await apiClient.patch(
    `/admin/organizations/${orgId}/product-domains/status`,
    { product, type, status },
  );
}
