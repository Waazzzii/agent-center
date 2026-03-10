/**
 * Connectors (Base Catalog) API Client
 */

import apiClient from './client';
import { Connector, CreateConnectorDto, UpdateConnectorDto } from '@/types/api.types';

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
