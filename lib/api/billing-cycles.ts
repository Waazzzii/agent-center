import apiClient from './client';

export interface BillingCycle {
  id: string;
  cycle_start: string;
  cycle_end: string;
  status: 'active' | 'closed' | 'invoiced';
  total_amount_usd: number | null;
  closed_at: string | null;
}

export interface BillingCycleResponse {
  active: BillingCycle | null;
  recent: BillingCycle[];
}

export async function getBillingCycle(orgId: string): Promise<BillingCycleResponse> {
  const res = await apiClient.get<BillingCycleResponse>(`/admin/organizations/${orgId}/billing-cycle`);
  return res.data;
}

export async function updateBillingCycleEnd(orgId: string, cycle_end: string): Promise<BillingCycle> {
  const res = await apiClient.patch<BillingCycle>(`/admin/organizations/${orgId}/billing-cycle`, { cycle_end });
  return res.data;
}
