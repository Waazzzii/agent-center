/**
 * AI Script Builder API client.
 *
 * A build session is a server-side Claude agent that explores a site on a
 * worker VM, authors a browser script in the platform step schema, verifies
 * it through the real execution engine, and saves it to Browser Scripts.
 * The UI watches via the live viewer + SSE topic `builder:{sessionId}` and
 * steers with messages/approvals.
 */

import agentClient from './agent-client';
import type { RecordedStep } from './scripts';

export type BuilderStatus =
  | 'provisioning'
  | 'exploring'
  | 'testing'
  | 'awaiting_approval'
  | 'awaiting_user'
  | 'saving'
  | 'done'
  | 'failed'
  | 'stopped';

export const BUILDER_TERMINAL_STATUSES: BuilderStatus[] = ['done', 'failed', 'stopped'];

export function isBuilderTerminal(status: BuilderStatus | string | undefined): boolean {
  return !!status && (BUILDER_TERMINAL_STATUSES as string[]).includes(status);
}

export interface BuilderEvent {
  seq: number;
  ts: string;
  /** narration | tool_use | draft_updated | run_draft_started | run_draft_result
   *  | user_message | question | approval_request | approval_decision
   *  | status_change | error | saved — render unknown types generically. */
  type: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface BuilderDraft {
  steps: RecordedStep[];
  parameters: Record<string, string>;
  test_values: Record<string, string>;
  verified: boolean;
}

export interface BuilderSession {
  sessionId: string;
  status: BuilderStatus;
  goal: string;
  start_url: string;
  login_id: string | null;
  viewerUrl: string | null;
  draft: BuilderDraft | null;
  scriptId: string | null;
  error: string | null;
  run_draft_count?: number;
  tokens?: { input: number; output: number };
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  pendingApproval?: { reason: string; action?: string | null } | null;
  pendingQuestion?: { question: string } | null;
  events: BuilderEvent[];
}

export interface BuilderSessionSummary {
  sessionId: string;
  status: BuilderStatus;
  goal: string;
  start_url: string;
  scriptId: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBuilderInput {
  goal: string;
  start_url: string;
  login_id?: string | null;
  /** Parameter names the user wants in the script, e.g. ["guest_name"]. */
  parameters?: string[];
  model?: string;
}

export async function createBuilderSession(
  orgId: string,
  input: CreateBuilderInput,
): Promise<{ sessionId: string; status: BuilderStatus; viewerUrl: string }> {
  const res = await agentClient.post(`/api/admin/${orgId}/script-builder`, input);
  return res.data;
}

export async function getBuilderSession(
  orgId: string,
  sessionId: string,
  afterSeq?: number,
): Promise<BuilderSession> {
  const res = await agentClient.get(`/api/admin/${orgId}/script-builder/${sessionId}`, {
    params: afterSeq ? { after_seq: afterSeq } : undefined,
  });
  return res.data;
}

export async function listBuilderSessions(orgId: string): Promise<BuilderSessionSummary[]> {
  const res = await agentClient.get(`/api/admin/${orgId}/script-builder`);
  return res.data;
}

export async function sendBuilderMessage(orgId: string, sessionId: string, text: string): Promise<void> {
  await agentClient.post(`/api/admin/${orgId}/script-builder/${sessionId}/message`, { text });
}

export async function sendBuilderApproval(
  orgId: string,
  sessionId: string,
  approved: boolean,
  note?: string,
): Promise<void> {
  await agentClient.post(`/api/admin/${orgId}/script-builder/${sessionId}/approval`, { approved, note });
}

export async function stopBuilderSession(orgId: string, sessionId: string): Promise<void> {
  await agentClient.post(`/api/admin/${orgId}/script-builder/${sessionId}/stop`);
}
