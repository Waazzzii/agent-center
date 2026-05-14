import agentClient from './agent-client';

/**
 * Slack notification readiness for one org. Drives the inline "Slack:
 * Connected / Not configured" badge on every per-entity channel input.
 *
 * `connected` is true iff a Slack connector row exists for the org AND
 * its MCP transport is enabled (the post path requires MCP). The
 * pre-198 `agent_enabled` flag was deliberately retired as a gate — it
 * controls whether Slack is exposed as an agent tool, not whether
 * these per-entity notifications can be delivered. The per-entity
 * channel override is the opt-in for notifications.
 */
export interface SlackNotificationStatus {
  connected: boolean;
}

export async function getSlackNotificationStatus(orgId: string): Promise<SlackNotificationStatus> {
  const res = await agentClient.get<SlackNotificationStatus>(
    `/api/admin/${orgId}/notifications/slack/status`
  );
  return res.data;
}
