/**
 * DECISION- and LOGIN-grain authorization assignment (migration 409).
 *
 * The notify merge: there is now ONE group system (Wazzi access groups) with
 * THREE separate grains, each a group→target assignment:
 *   • EXECUTION — who may RUN an agent         → agent-run-access.ts
 *   • DECISION  — who may ACT ON its decisions → here (target = agent)
 *   • LOGIN     — who handles its sign-in HITL → here (target = login, pool parent)
 * Membership (who is IN a group) is managed in Wazzi admin; these only set the
 * assignment. Group list is shared with execution (getRunAccessGroups).
 */
import agentClient from './agent-client';
import type { RunAccessGroup } from './agent-run-access';

export type { RunAccessGroup };

/** The three authorization grains (migrations 407 + 409). */
export type Grain = 'execution' | 'decision' | 'login';

// ── Reverse (grain-first) surface for the Authorization page ─────────────────

export interface GrainAssignments {
  /** targetId → the access groups assigned to it for this grain. */
  byTarget: Record<string, RunAccessGroup[]>;
  /** Groups with the org-wide "all targets" grant (apply to every target). */
  allGrants: RunAccessGroup[];
}

/** Every assignment for a grain, grouped for the reverse table. */
export async function listGrainAssignments(orgId: string, grain: Grain) {
  const res = await agentClient.get<GrainAssignments>(
    `/api/admin/${orgId}/grain-access/${grain}/assignments`,
  );
  return res.data;
}

/** Add or remove ONE group across many targets (bulk, or a single per-row chip). */
export async function bulkGrainAssign(orgId: string, grain: Grain, groupId: string, targetIds: string[], op: 'add' | 'remove') {
  const res = await agentClient.post<{ changed: number }>(
    `/api/admin/${orgId}/grain-access/${grain}/bulk`,
    { group_id: groupId, target_ids: targetIds, op },
  );
  return res.data;
}

/** Toggle a group's org-wide "all targets" grant for this grain. */
export async function setGrainAllGrant(orgId: string, grain: Grain, groupId: string, on: boolean) {
  const res = await agentClient.post<{ all: boolean }>(
    `/api/admin/${orgId}/grain-access/${grain}/all-grant`,
    { group_id: groupId, on },
  );
  return res.data;
}

// ── Decision grain (per-agent) ──────────────────────────────────────────────

/** Groups that may act on THIS agent's decisions (excludes the all-agents grant). */
export async function getAgentDecisionGroups(orgId: string, agentId: string) {
  const res = await agentClient.get<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/agents/${agentId}/decision-access-groups`,
  );
  return res.data.groups;
}

/** Replace the groups that may act on this agent's decisions (PUT). */
export async function setAgentDecisionGroups(orgId: string, agentId: string, groupIds: string[]) {
  const res = await agentClient.put<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/agents/${agentId}/decision-access-groups`,
    { group_ids: groupIds },
  );
  return res.data.groups;
}

// ── Decision grain (group-centric, for the Authorization page) ───────────────

export interface GroupDecisionAgents {
  /** The group may act on EVERY agent's decisions (incl. future ones). */
  all_agents: boolean;
  agent_ids: string[];
}

export async function getGroupDecisionAgents(orgId: string, groupId: string) {
  const res = await agentClient.get<GroupDecisionAgents>(
    `/api/admin/${orgId}/decision-access-groups/${groupId}/agents`,
  );
  return res.data;
}

export async function setGroupDecisionAgents(orgId: string, groupId: string, agentIds: string[], allAgents: boolean) {
  const res = await agentClient.put<GroupDecisionAgents>(
    `/api/admin/${orgId}/decision-access-groups/${groupId}/agents`,
    { agent_ids: agentIds, all_agents: allAgents },
  );
  return res.data;
}

// ── Login grain (per-login) ─────────────────────────────────────────────────

/** Groups that may handle THIS login's sign-in HITL (pass the pool parent id). */
export async function getLoginGroups(orgId: string, loginId: string) {
  const res = await agentClient.get<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/logins/${loginId}/login-access-groups`,
  );
  return res.data.groups;
}

/** Replace the groups that may handle this login (PUT). */
export async function setLoginGroups(orgId: string, loginId: string, groupIds: string[]) {
  const res = await agentClient.put<{ groups: RunAccessGroup[] }>(
    `/api/admin/${orgId}/logins/${loginId}/login-access-groups`,
    { group_ids: groupIds },
  );
  return res.data.groups;
}

// ── Login grain (group-centric, for the Authorization page) ─────────────────

export interface GroupLogins {
  /** The group may handle EVERY login's sign-in HITL (incl. future ones). */
  all_logins: boolean;
  login_ids: string[];
}

export async function getGroupLogins(orgId: string, groupId: string) {
  const res = await agentClient.get<GroupLogins>(
    `/api/admin/${orgId}/login-access-groups/${groupId}/logins`,
  );
  return res.data;
}

export async function setGroupLogins(orgId: string, groupId: string, loginIds: string[], allLogins: boolean) {
  const res = await agentClient.put<GroupLogins>(
    `/api/admin/${orgId}/login-access-groups/${groupId}/logins`,
    { login_ids: loginIds, all_logins: allLogins },
  );
  return res.data;
}
