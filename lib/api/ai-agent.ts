import apiClient from './client';
import type { AgentAuthorizationStatus } from '@/types/api.types';

export interface AiAgentStatus extends AgentAuthorizationStatus {
  has_anthropic_key: boolean;
  anthropic_key_masked: string | null;
}

export async function getAiAgentStatus(orgId: string): Promise<AiAgentStatus> {
  const response = await apiClient.get<AiAgentStatus>(`/admin/organizations/${orgId}/ai-agent`);
  return response.data;
}

export async function enableAgent(orgId: string): Promise<AgentAuthorizationStatus> {
  const response = await apiClient.post<AgentAuthorizationStatus>(
    `/admin/organizations/${orgId}/ai-agent/enable`
  );
  return response.data;
}

export async function disableAgent(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/ai-agent`);
}

export async function saveAnthropicKey(orgId: string, api_key: string): Promise<{ anthropic_key_masked: string }> {
  const response = await apiClient.put<{ anthropic_key_masked: string }>(
    `/admin/organizations/${orgId}/ai-agent/anthropic-key`,
    { api_key }
  );
  return response.data;
}

export async function removeAnthropicKey(orgId: string): Promise<void> {
  await apiClient.delete(`/admin/organizations/${orgId}/ai-agent/anthropic-key`);
}

export interface CapacityWorker {
  worker_id: string;
  status: string;            // 'ready' | 'draining'
  reserved: boolean;         // pinned to this org (vs shared/dev worker)
  memory_pct: number | null; // 0..1 utilization from worker heartbeat telemetry
  cpu_pct: number | null;    // 0..1 utilization (EMA) from worker heartbeat telemetry
  gated: string[];           // admission-gated resources; non-empty = pod refusing new work
  last_seen: number;         // epoch ms
}

export interface AgentCapacity {
  active_agents: number;
  active_browser_slots: number;
  active_agent_browser_slots: number;
  queued_agents: number;
  /** Reserved worker pods serving this org (may be absent on older backends). */
  workers?: CapacityWorker[];
}

export async function getAgentCapacity(orgId: string): Promise<AgentCapacity> {
  const response = await apiClient.get<AgentCapacity>(
    `/admin/organizations/${orgId}/ai-agent/capacity`
  );
  return response.data;
}

/**
 * One capacity-blockage window, opened on the first refusal, extended while
 * refusals continue, closed when the org is served again. ongoing = now.
 *   at_capacity / no_workers — the WORKER refused browsers (or had no pods);
 *   runner_gated             — the RUNNER held queued runs back (its own
 *                              memory/CPU gate).
 */
export interface CapacityEvent {
  id: string;
  kind: 'at_capacity' | 'no_workers' | 'runner_gated';
  reason: string | null;
  refusal_count: number;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  ongoing: boolean;
}

export async function getCapacityEvents(
  orgId: string,
  range?: { from?: string; to?: string }
): Promise<CapacityEvent[]> {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  const qs = params.toString();
  const response = await apiClient.get<{ events: CapacityEvent[] }>(
    `/admin/organizations/${orgId}/ai-agent/capacity-events${qs ? `?${qs}` : ''}`
  );
  return response.data.events ?? [];
}

// ─── Capacity telemetry (pod history, queue waits) ────────────────────────────

export interface PodSeriesPoint {
  t: string;
  mem: number | null;      // mean over the bucket, 0..1 of the memory limit
  mem_max: number | null;
  cpu: number | null;      // mean over the bucket, 0..n of the CPU request
  cpu_max: number | null;
  gated: boolean;          // a gate was tripped at some point in the bucket
  load: number | null;     // runs on it (max over the bucket)
  draining: boolean;
}

export interface PodSeries {
  organization_id: string | null;
  organization_name: string | null;
  pod: string;
  role: 'worker' | 'runner';
  points: PodSeriesPoint[];
}

export interface PodMetrics {
  bucket_seconds: number;
  thresholds: { memory_trip: number; memory_resume: number; cpu_trip: number; cpu_resume: number };
  series: PodSeries[];
}

/** Worker and runner memory/CPU/gate history for the org's pods. */
export async function getPodMetrics(orgId: string, range: { from: string; to: string }): Promise<PodMetrics> {
  const qs = new URLSearchParams(range).toString();
  const response = await apiClient.get<PodMetrics>(`/admin/organizations/${orgId}/ai-agent/pod-metrics?${qs}`);
  return response.data;
}

export interface QueueWaits {
  runs: number;
  waited: number;          // runs that waited at least a second to start
  total_wait_s: number;
  p50_s: number;
  p95_s: number;
  max_s: number;
  reasons: Array<{ reason: string; runs: number; total_wait_s: number }>;
  series: Array<{ t: string; runs: number; waited: number; total_wait_s: number }>;
}

/** How long the org's runs waited to start, and why. */
export async function getQueueWaits(orgId: string, range: { from: string; to: string }): Promise<QueueWaits> {
  const qs = new URLSearchParams(range).toString();
  const response = await apiClient.get<QueueWaits>(`/admin/organizations/${orgId}/ai-agent/queue-waits?${qs}`);
  return response.data;
}
