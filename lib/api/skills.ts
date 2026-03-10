import apiClient from './client';

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

export async function getSkills(orgId: string) {
  const res = await apiClient.get<{ skills: Skill[]; total: number }>(`/admin/organizations/${orgId}/skills`);
  return res.data;
}

export async function getSkill(orgId: string, skillId: string) {
  const res = await apiClient.get<Skill>(`/admin/organizations/${orgId}/skills/${skillId}`);
  return res.data;
}

export async function createSkill(orgId: string, data: { name: string; description?: string; content: string }) {
  const res = await apiClient.post<Skill>(`/admin/organizations/${orgId}/skills`, data);
  return res.data;
}

export async function updateSkill(orgId: string, skillId: string, data: { name?: string; description?: string; content?: string; is_active?: boolean }) {
  const res = await apiClient.put<Skill>(`/admin/organizations/${orgId}/skills/${skillId}`, data);
  return res.data;
}

export async function deleteSkill(orgId: string, skillId: string) {
  await apiClient.delete(`/admin/organizations/${orgId}/skills/${skillId}`);
}

export async function exportSkills(orgId: string) {
  const res = await apiClient.get<Skill[]>(`/admin/organizations/${orgId}/skills/export`);
  return res.data;
}

export async function importSkills(orgId: string, skills: { name: string; description?: string; content: string }[]) {
  const res = await apiClient.post<{ created: number; errors: string[] }>(`/admin/organizations/${orgId}/skills/import`, { skills });
  return res.data;
}


export async function pushSkillToAnthropic(orgId: string, skillId: string, apiKey: string) {
  const res = await apiClient.post<{ external_ref: string }>(`/admin/organizations/${orgId}/skills/${skillId}/push-to-anthropic`, { api_key: apiKey });
  return res.data;
}
