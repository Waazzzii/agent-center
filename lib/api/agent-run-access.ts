/**
 * Agent RUN-authorization assignment (migration 407).
 *
 * Which WAZZI access groups may RUN an agent. DISTINCT from agent-access-groups.ts
 * (System B — who may ACT ON / be notified for an agent): these are the Wazzi
 * groups that also gate center access, and they gate agent EXECUTION. Membership
 * is managed in Wazzi admin; this only sets the group→agent assignment.
 */
import agentClient from './agent-client';

export interface RunAccessGroup {
  id: string;
  name: string;
  member_count: number;
}

/** Wazzi access groups in the org — the picker's source. */
export async function getRunAccessGroups(orgId: string) {
  const res = await agentClient.get<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/run-access-groups`,
  );
  return res.data.groups;
}

/** Groups granted run on this agent (excludes any org-wide "all agents" grant). */
export async function getAgentRunGroups(orgId: string, agentId: string) {
  const res = await agentClient.get<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/agents/${agentId}/run-access-groups`,
  );
  return res.data.groups;
}

/** Replace the groups granted run on this agent (PUT). */
export async function setAgentRunGroups(orgId: string, agentId: string, groupIds: string[]) {
  const res = await agentClient.put<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/agents/${agentId}/run-access-groups`,
    { group_ids: groupIds },
  );
  return res.data.groups;
}

// ── Group-centric (the central Authorization page: a group → its agents) ────────

export interface GroupRunAgents {
  /** The group runs EVERY agent in the org (incl. future ones). */
  all_agents: boolean;
  /** Specific agents the group may run (ignored when all_agents is true). */
  agent_ids: string[];
}

/** What agents a group may run. */
export async function getGroupRunAgents(orgId: string, groupId: string) {
  const res = await agentClient.get<GroupRunAgents>(
    `/api/admin/${orgId}/run-access-groups/${groupId}/agents`,
  );
  return res.data;
}

/** Replace what a group may run (PUT). all_agents wins over agent_ids. */
export async function setGroupRunAgents(orgId: string, groupId: string, agentIds: string[], allAgents: boolean) {
  const res = await agentClient.put<GroupRunAgents>(
    `/api/admin/${orgId}/run-access-groups/${groupId}/agents`,
    { agent_ids: agentIds, all_agents: allAgents },
  );
  return res.data;
}
