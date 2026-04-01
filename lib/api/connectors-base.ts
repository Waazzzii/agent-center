/**
 * Connectors (Base Catalog) API Client
 */

import apiClient from './client';
import { CenterDataCategory, Connector, ConnectorConfiguration, CreateConnectorDto, UpdateConnectorDto } from '@/types/api.types';

export interface ListConnectorsResponse {
  connectors: Connector[];
  total: number;
}

export async function getConnectors(): Promise<ListConnectorsResponse> {
  const response = await apiClient.get('/admin/connectors');
  return response.data;
}

export async function getConnector(id: string): Promise<Connector> {
  const response = await apiClient.get(`/admin/connectors/${id}`);
  return response.data;
}

export async function createConnector(data: CreateConnectorDto): Promise<Connector> {
  const response = await apiClient.post('/admin/connectors', data);
  return response.data;
}

export async function updateConnector(id: string, data: UpdateConnectorDto): Promise<Connector> {
  const response = await apiClient.patch(`/admin/connectors/${id}`, data);
  return response.data;
}

export async function deleteConnector(id: string): Promise<void> {
  await apiClient.delete(`/admin/connectors/${id}`);
}

export async function getCenterDataCategories(): Promise<CenterDataCategory[]> {
  const response = await apiClient.get<{ categories: CenterDataCategory[] }>('/admin/center-data-categories');
  return response.data.categories;
}

export interface ConnectorAccessDefinition {
  key: string;
  label: string;
  description: string | null;
  crud_type: 'create' | 'read' | 'update' | 'delete';
  sort_order: number;
}

export interface ConnectorAccessDefinitionsResponse {
  definitions: ConnectorAccessDefinition[];
}

export async function getConnectorAccessDefinitions(id: string): Promise<ConnectorAccessDefinitionsResponse> {
  const response = await apiClient.get(`/admin/connectors/${id}/access-definitions`);
  return response.data;
}

export async function putConnectorAccessDefinitions(
  id: string,
  definitions: ConnectorAccessDefinition[]
): Promise<ConnectorAccessDefinitionsResponse> {
  const response = await apiClient.put(`/admin/connectors/${id}/access-definitions`, { definitions });
  return response.data;
}

export async function syncConnectorAccessDefinitions(id: string): Promise<ConnectorAccessDefinitionsResponse> {
  const response = await apiClient.post(`/admin/connectors/${id}/access-definitions/sync`);
  return response.data;
}

// ── Connector Configurations (Field Library) ──────────────────────────────────

export async function getFieldLibrary(): Promise<ConnectorConfiguration[]> {
  const response = await apiClient.get<{ fields: ConnectorConfiguration[] }>('/admin/connectors/field-library');
  return response.data.fields;
}

export async function createFieldLibraryEntry(
  data: Omit<ConnectorConfiguration, 'id' | 'is_system' | 'created_at' | 'updated_at'>
): Promise<ConnectorConfiguration> {
  const response = await apiClient.post<{ field: ConnectorConfiguration }>('/admin/connectors/field-library', data);
  return response.data.field;
}

export async function updateFieldLibraryEntry(
  id: string,
  data: Partial<Omit<ConnectorConfiguration, 'id' | 'key' | 'is_system' | 'created_at' | 'updated_at'>>
): Promise<ConnectorConfiguration> {
  const response = await apiClient.put<{ field: ConnectorConfiguration }>(`/admin/connectors/field-library/${id}`, data);
  return response.data.field;
}

export async function deleteFieldLibraryEntry(id: string): Promise<void> {
  await apiClient.delete(`/admin/connectors/field-library/${id}`);
}
