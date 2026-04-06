/**
 * Agent-backend access groups API.
 * Separate from the wazzi-backend access_groups (access-groups.ts) —
 * these control who gets notified for HITL steps on agents.
 */
import agentClient from './agent-client';

export interface AgentAccessGroup {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  member_count: number;
}

export interface AgentAccessGroupMember {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  added_at: string;
  has_product_access: boolean;
}

export interface AgentOrgUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  has_product_access: boolean;
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function getAgentAccessGroups(orgId: string) {
  const res = await agentClient.get<{ groups: AgentAccessGroup[] }>(`/api/admin/${orgId}/access-groups`);
  return res.data.groups;
}

export async function createAgentAccessGroup(orgId: string, name: string) {
  const res = await agentClient.post<{ group: AgentAccessGroup }>(`/api/admin/${orgId}/access-groups`, { name });
  return res.data.group;
}

export async function deleteAgentAccessGroup(orgId: string, groupId: string) {
  await agentClient.delete(`/api/admin/${orgId}/access-groups/${groupId}`);
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function getAgentGroupMembers(orgId: string, groupId: string) {
  const res = await agentClient.get<{ members: AgentAccessGroupMember[] }>(
    `/api/admin/${orgId}/access-groups/${groupId}/members`
  );
  return res.data.members;
}

export async function addAgentGroupMember(orgId: string, groupId: string, userId: string) {
  await agentClient.post(`/api/admin/${orgId}/access-groups/${groupId}/members`, { user_id: userId });
}

export async function removeAgentGroupMember(orgId: string, groupId: string, userId: string) {
  await agentClient.delete(`/api/admin/${orgId}/access-groups/${groupId}/members/${userId}`);
}

// ── Org users ─────────────────────────────────────────────────────────────────

export async function getAgentOrgUsers(orgId: string) {
  const res = await agentClient.get<{ users: AgentOrgUser[] }>(`/api/admin/${orgId}/access-groups-users`);
  return res.data.users;
}

// ── Agent assignments ─────────────────────────────────────────────────────────

export async function getAssignedAccessGroups(orgId: string, agentId: string) {
  const res = await agentClient.get<{ groups: AgentAccessGroup[] }>(
    `/api/admin/${orgId}/agents/${agentId}/access-groups`
  );
  return res.data.groups;
}

export async function assignAccessGroupToAgent(orgId: string, agentId: string, groupId: string) {
  await agentClient.post(`/api/admin/${orgId}/agents/${agentId}/access-groups`, { group_id: groupId });
}

export async function unassignAccessGroupFromAgent(orgId: string, agentId: string, groupId: string) {
  await agentClient.delete(`/api/admin/${orgId}/agents/${agentId}/access-groups/${groupId}`);
}
