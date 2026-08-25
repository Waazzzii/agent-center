/**
 * Chat-driven authoring sessions — read + end.
 *
 * These sessions are STARTED elsewhere: a chat client (Claude Desktop, Claude
 * Code) calls wazzi-backend's `browser-authoring` MCP connector, which opens a
 * browser on a worker VM. What the Agent Center provides is the place to watch
 * it, take the mouse, and — if a chat wanders off and leaves a browser open on
 * the org's budget — end it.
 *
 * The link a chat hands the operator points at /sessions/[runId] here rather
 * than at agent-backend's own /live/run/:runId viewer, which is unauthenticated
 * and interactive. Routing through this page means a link pasted into a
 * transcript is inert to anyone outside the org.
 */

import agentClient from './agent-client';

export interface AuthoringSessionSummary {
  runId: string;
  scriptId: string | null;
  userId: string | null;
  userEmail: string | null;
  startUrl: string | null;
  createdAt: number;
  /** Absolute (gated) or relative viewer URL, depending on org domain provisioning. */
  viewerUrl: string;
}

export interface AuthoringSessionDetail {
  runId: string;
  scriptId: string | null;
  startUrl: string | null;
  userEmail: string | null;
  createdAt: number;
  /** Path on agent-backend that serves the noVNC viewer for this run. */
  viewerPath: string;
  /** Steps captured so far — by the model AND by anything the operator did by hand. */
  steps: AuthoringStep[];
  stepCount: number;
  active: boolean;
}

/**
 * A captured step. Same shape the script editor renders, because it IS the
 * same shape — chat-authored steps go through the recorder's own
 * normalisation, so there's no second format to support here.
 */
export interface AuthoringStep {
  action: string;
  name?: string;
  selector?: string;
  value?: string;
  url?: string;
  key?: string;
  text?: string;
  frame_selector?: string;
  tab_index?: number;
  requires_approval?: boolean;
  _reliability?: { tier?: string; risks?: string[] };
  _defaultValue?: string;
  waitFor?: { selector?: string; description?: string } | null;
}

export async function listAuthoringSessions(orgId: string): Promise<AuthoringSessionSummary[]> {
  const res = await agentClient.get<{ sessions: AuthoringSessionSummary[] }>(
    `/api/admin/${orgId}/authoring-sessions`
  );
  return res.data.sessions ?? [];
}

export async function getAuthoringSession(orgId: string, runId: string): Promise<AuthoringSessionDetail> {
  const res = await agentClient.get<AuthoringSessionDetail>(
    `/api/admin/${orgId}/authoring-sessions/${runId}`
  );
  return res.data;
}

export async function endAuthoringSession(orgId: string, runId: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/authoring-sessions/${runId}`);
}
