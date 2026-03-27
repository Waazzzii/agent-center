import apiClient from './client';
import type { DataSourceConfig, UpsertDataSourceConfigDto } from '@/types/api.types';

export async function getDataSourceConfigs(orgId: string): Promise<DataSourceConfig[]> {
  const response = await apiClient.get<{ categories: DataSourceConfig[] }>(
    `/admin/organizations/${orgId}/data-source-configs`
  );
  return response.data.categories;
}

export async function upsertDataSourceConfig(
  orgId: string,
  categoryKey: string,
  data: UpsertDataSourceConfigDto
): Promise<DataSourceConfig> {
  const response = await apiClient.put<DataSourceConfig>(
    `/admin/organizations/${orgId}/data-source-configs/${categoryKey}`,
    data
  );
  return response.data;
}

export async function bulkUpsertDataSourceConfigs(
  orgId: string,
  updates: Array<{ categoryKey: string; data: UpsertDataSourceConfigDto }>
): Promise<DataSourceConfig[]> {
  const results = await Promise.all(
    updates.map(({ categoryKey, data }) => upsertDataSourceConfig(orgId, categoryKey, data))
  );
  return results;
}

export async function deleteDataSourceConfig(orgId: string, categoryKey: string): Promise<void> {
  await apiClient.delete(
    `/admin/organizations/${orgId}/data-source-configs/${categoryKey}`
  );
}
