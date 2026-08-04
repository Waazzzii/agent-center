import agentClient from './agent-client';

/**
 * An agent-kit "client" — an org-scoped deployment target (backend migration
 * 269). Its `public_id` is a non-secret scoping identifier an operator pastes
 * into a host app (Commerce Center, Admin Center, …); the embedded kit then
 * shows only the agents assigned directly to that client. Distinct from OAuth
 * `oauth_clients`.
 */
export interface Client {
  id: string;
  organization_id: string;
  name: string;
  /** The opaque identifier pasted into host deployments. Immutable. */
  public_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  /** Number of agents assigned to this client — only present on list(). */
  agent_count?: number;
}

export interface ClientInput {
  name: string;
  is_active?: boolean;
}

export async function listClients(orgId: string): Promise<Client[]> {
  const res = await agentClient.get<{ clients: Client[] }>(`/api/admin/${orgId}/clients`);
  return res.data.clients;
}

export async function getClient(orgId: string, id: string): Promise<Client> {
  const res = await agentClient.get<Client>(`/api/admin/${orgId}/clients/${id}`);
  return res.data;
}

/** Create a client. The backend generates the immutable public_id. */
export async function createClient(orgId: string, data: ClientInput): Promise<Client> {
  const res = await agentClient.post<Client>(`/api/admin/${orgId}/clients`, data);
  return res.data;
}

/** Rename / (de)activate. public_id can't be changed — deactivate + recreate to rotate. */
export async function updateClient(orgId: string, id: string, data: Partial<ClientInput>): Promise<Client> {
  const res = await agentClient.patch<Client>(`/api/admin/${orgId}/clients/${id}`, data);
  return res.data;
}

export async function deleteClient(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/clients/${id}`);
}
