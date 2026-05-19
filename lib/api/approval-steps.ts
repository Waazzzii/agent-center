import agentClient from './agent-client';

/**
 * Reusable approval-step definition. Mirrors AiStep / Login / BrowserScript:
 * a centrally-managed library entity that agent_actions can reference
 * via approval_step_id. Renaming or editing the instructions
 * propagates everywhere the step is used.
 */
export interface ApprovalStep {
  id: string;
  organization_id: string;
  name: string;
  /** Markdown / plain text shown to the approver. Supports {{var}} templates. */
  instructions: string;
  /** Optional Slack channel override for HITL notifications. Null = fall
   *  through to program / org default. */
  notification_slack_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalStepInput {
  name: string;
  instructions?: string;
  notification_slack_channel_id?: string | null;
}

export async function listApprovalSteps(orgId: string): Promise<ApprovalStep[]> {
  const res = await agentClient.get<ApprovalStep[]>(`/api/admin/${orgId}/approval-steps`);
  return res.data;
}

export async function getApprovalStep(orgId: string, id: string): Promise<ApprovalStep> {
  const res = await agentClient.get<ApprovalStep>(`/api/admin/${orgId}/approval-steps/${id}`);
  return res.data;
}

export async function createApprovalStep(orgId: string, data: ApprovalStepInput): Promise<ApprovalStep> {
  const res = await agentClient.post<ApprovalStep>(`/api/admin/${orgId}/approval-steps`, data);
  return res.data;
}

export async function updateApprovalStep(
  orgId: string,
  id: string,
  data: Partial<ApprovalStepInput>,
): Promise<ApprovalStep> {
  const res = await agentClient.patch<ApprovalStep>(`/api/admin/${orgId}/approval-steps/${id}`, data);
  return res.data;
}

export async function deleteApprovalStep(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/approval-steps/${id}`);
}
