import agentClient from './agent-client';

/**
 * An agent-kit "client" — an org-scoped deployment target (backend migration
 * 269). Its `public_id` is a non-secret scoping identifier the host app uses
 * to scope the embedded kit to the agents assigned to it. Distinct from OAuth
 * `oauth_clients`.
 *
 * NOT A USER-FACING CONCEPT ANY MORE. One client is provisioned per product
 * when that product is enabled for the org, and deactivated when it is turned
 * off — so the UI talks about PRODUCTS and lets this remain the storage
 * detail it always was. `product_slug` / `product_name` come from the kit
 * settings row that provisioned it, and are null for clients created by hand
 * before that was automatic.
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
  /** The product this was provisioned for, e.g. 'cc'. Null if hand-created. */
  product_slug?: string | null;
  /** Display name from the products table, e.g. "Commerce Center". */
  product_name?: string | null;
  /** Whether the kit is switched on for that product. */
  kit_enabled?: boolean;
}

/** What to call a client in the UI: its product, falling back to its name. */
export function clientDisplayName(c: Pick<Client, 'name' | 'product_name'>): string {
  return c.product_name ?? c.name;
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
