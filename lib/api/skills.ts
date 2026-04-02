import agentClient from './agent-client';

export interface Skill {
  id: string;
  organization_id: string;
  name: string;
  description?: string | null;
  content: string;
  source: 'manual' | 'anthropic_import' | 'file_import';
  external_ref?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillsPage {
  items: Skill[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface SkillUsage {
  action_id: string;
  action_name: string;
  agent_id: string;
  agent_name: string;
}

export async function getSkills(orgId: string, params?: { page?: number; limit?: number }) {
  const res = await agentClient.get<SkillsPage>(`/api/admin/${orgId}/skills`, { params });
  return res.data;
}

export async function getSkill(orgId: string, skillId: string) {
  const res = await agentClient.get<Skill>(`/api/admin/${orgId}/skills/${skillId}`);
  return res.data;
}

export async function getSkillUsages(orgId: string, skillId: string) {
  const res = await agentClient.get<SkillUsage[]>(`/api/admin/${orgId}/skills/${skillId}/usages`);
  return res.data;
}

export async function createSkill(orgId: string, data: { name: string; description?: string; content: string }) {
  const res = await agentClient.post<Skill>(`/api/admin/${orgId}/skills`, data);
  return res.data;
}

export async function updateSkill(orgId: string, skillId: string, data: { name?: string; description?: string; content?: string }) {
  const res = await agentClient.put<Skill>(`/api/admin/${orgId}/skills/${skillId}`, data);
  return res.data;
}

export async function deleteSkill(orgId: string, skillId: string) {
  await agentClient.delete(`/api/admin/${orgId}/skills/${skillId}`);
}

export async function exportSkills(orgId: string) {
  const res = await agentClient.get<Skill[]>(`/api/admin/${orgId}/skills/export`);
  return res.data;
}

export async function importSkills(orgId: string, skills: { name: string; description?: string; content: string }[]) {
  const res = await agentClient.post<{ imported: number; skills: Skill[] }>(
    `/api/admin/${orgId}/skills/import`,
    { skills }
  );
  return res.data;
}

export async function pushSkillToAnthropic(orgId: string, skillId: string) {
  const res = await agentClient.post<{ externalRef: string }>(
    `/api/admin/${orgId}/skills/${skillId}/push-to-anthropic`
  );
  return res.data;
}
