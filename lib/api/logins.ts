import agentClient from './agent-client';

export interface Login {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  verify_text: string;
  browser_session_id: string | null;
  /** Any time we ran a verify (regardless of outcome). */
  last_checked_at: string | null;
  /** Last time the session was confirmed / refreshed valid. */
  last_logged_in_at: string | null;
  status: 'valid' | 'needs_login' | 'unknown';
  created_at: string;
  updated_at: string;
}

export interface LoginInput {
  name: string;
  url: string;
  verify_text: string;
}

export interface VerifyResult {
  executionLogId: string;
}

export async function listLogins(orgId: string): Promise<Login[]> {
  const res = await agentClient.get<Login[]>(`/api/admin/${orgId}/logins`);
  return res.data;
}

export async function getLogin(orgId: string, id: string): Promise<Login> {
  const res = await agentClient.get<Login>(`/api/admin/${orgId}/logins/${id}`);
  return res.data;
}

export async function createLogin(orgId: string, data: LoginInput): Promise<Login> {
  const res = await agentClient.post<Login>(`/api/admin/${orgId}/logins`, data);
  return res.data;
}

export async function updateLogin(orgId: string, id: string, data: Partial<LoginInput>): Promise<Login> {
  const res = await agentClient.patch<Login>(`/api/admin/${orgId}/logins/${id}`, data);
  return res.data;
}

export async function deleteLogin(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/logins/${id}`);
}

export async function verifyLogin(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/verify`);
  return res.data;
}

/** Start an interactive manual login — allocates a browser, navigates to the
 *  login URL, and pauses for the user.  Returns the execution log id to open
 *  in the noVNC dialog. */
export async function startLogin(orgId: string, id: string): Promise<VerifyResult> {
  const res = await agentClient.post<VerifyResult>(`/api/admin/${orgId}/logins/${id}/login`);
  return res.data;
}
