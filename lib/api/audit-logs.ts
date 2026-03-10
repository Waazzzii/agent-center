import apiClient from './client';

export type ActorType = 'super_admin' | 'org_admin' | 'org_member' | 'user';
export type OperationType = 'create' | 'update' | 'delete';

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_type: ActorType;
  actor_name?: string | null;
  resource_type: string;
  resource_id: string | null;
  operation: OperationType;
  metadata?: {
    ip?: string;
    userAgent?: string;
    method?: string;
    path?: string;
  };
  created_at: string;
}

export interface GetAuditLogsParams {
  actor_id?: string;
  actor_type?: ActorType;
  resource_type?: string;
  resource_id?: string;
  operation?: OperationType;
  limit?: number;
  offset?: number;
}

export interface GetAuditLogsResponse {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

function buildAuditLogParams(params?: GetAuditLogsParams): string {
  const searchParams = new URLSearchParams();
  if (params?.actor_id) searchParams.append('actor_id', params.actor_id);
  if (params?.actor_type) searchParams.append('actor_type', params.actor_type);
  if (params?.resource_type) searchParams.append('resource_type', params.resource_type);
  if (params?.resource_id) searchParams.append('resource_id', params.resource_id);
  if (params?.operation) searchParams.append('operation', params.operation);
  if (params?.limit) searchParams.append('limit', params.limit.toString());
  if (params?.offset) searchParams.append('offset', params.offset.toString());
  return searchParams.toString();
}

export async function getAuditLogs(params?: GetAuditLogsParams): Promise<GetAuditLogsResponse> {
  const query = buildAuditLogParams(params);
  const response = await apiClient.get<GetAuditLogsResponse>(`/admin/audit-logs${query ? `?${query}` : ''}`);
  return response.data;
}

export async function getOrgAuditLogs(orgId: string, params?: GetAuditLogsParams): Promise<GetAuditLogsResponse> {
  const query = buildAuditLogParams(params);
  const response = await apiClient.get<GetAuditLogsResponse>(`/admin/organizations/${orgId}/audit-logs${query ? `?${query}` : ''}`);
  return response.data;
}
