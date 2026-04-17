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
  login_count?: number;
  approval_count?: number;
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

// ── Group usage (which logins + approvals use this group) ────────────────────

export interface GroupUsageLogin { id: string; name: string; url: string; status: string; }
export interface GroupUsageApproval { id: string; action_name: string; agent_name: string; agent_id: string; }

export async function getGroupUsage(orgId: string, groupId: string): Promise<{ logins: GroupUsageLogin[]; approvals: GroupUsageApproval[] }> {
  const res = await agentClient.get<{ logins: GroupUsageLogin[]; approvals: GroupUsageApproval[] }>(
    `/api/admin/${orgId}/access-groups/${groupId}/usage`
  );
  return res.data;
}

// ── Action-level group assignments ───────────────────────────────────────────

export async function getActionAccessGroups(orgId: string, actionId: string) {
  const res = await agentClient.get<{ groups: AgentAccessGroup[] }>(
    `/api/admin/${orgId}/actions/${actionId}/access-groups`
  );
  return res.data.groups;
}

export async function setActionAccessGroups(orgId: string, actionId: string, groupIds: string[]) {
  await agentClient.put(`/api/admin/${orgId}/actions/${actionId}/access-groups`, { group_ids: groupIds });
}

// ── Login-level group assignments (centralized per login profile) ────────────

export async function getLoginAccessGroups(orgId: string, loginId: string) {
  const res = await agentClient.get<{ groups: AgentAccessGroup[] }>(
    `/api/admin/${orgId}/logins/${loginId}/access-groups`
  );
  return res.data.groups;
}

export async function setLoginAccessGroups(orgId: string, loginId: string, groupIds: string[]) {
  await agentClient.put(`/api/admin/${orgId}/logins/${loginId}/access-groups`, { group_ids: groupIds });
}

// Legacy — kept for backwards compat during migration, can be removed later
export async function getAssignedAccessGroups(orgId: string, agentId: string) {
  return [] as AgentAccessGroup[];
}
export async function assignAccessGroupToAgent(_orgId: string, _agentId: string, _groupId: string) {}
export async function unassignAccessGroupFromAgent(_orgId: string, _agentId: string, _groupId: string) {}
