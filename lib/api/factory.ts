import apiClient from './client';

/**
 * Agent Factory — wazzi-backend /admin/organizations/:orgId/factory/*.
 *
 *   Template → Crew → Job → Task → Attempt → (agent) Execution
 *
 * A CREW is a template set up for an org (tracker, an agent per task). A RUN
 * of the crew — its schedule, the API, or Start now — starts JOBS, one ticket
 * each; a job moves through the template's TASKS; each task may take a few
 * ATTEMPTS, each one agent EXECUTION. What a run does is the crew's start_mode:
 *   tickets   pick up the next waiting tickets in its bucket (team + label)
 *   discover  start one job whose Discover task finds the work and creates
 *             the ticket (none when there is nothing to do)
 * The coordinator is wazzi-backend's factory tick.
 */

export type StartMode = 'tickets' | 'discover';

export type NormalizedState = 'not_started' | 'in_progress' | 'done' | 'canceled';

export interface FactoryTask {
  key: string;
  name: string;
  position: number;
  role_description?: string | null;
  start_after_minutes?: number;
  max_wait_minutes?: number;
  max_attempts?: number;
}

export interface FactoryTemplate {
  id: string;
  org_id: string | null;
  key: string;
  name: string;
  description: string | null;
  is_recommended: boolean;
  tasks: FactoryTask[];
}

export interface FactoryTracker {
  key: string;
  name: string;
  connected: boolean;
}

export interface CrewSummary {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  tracker_connector_key: string;
  intake: { team?: string; label?: string };
  max_active_jobs: number;
  start_mode: StartMode;
  schedule_cron: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_result: string | null;
  template_name: string;
  task_count: number;
  roles_assigned: number;
  active_jobs: number;
  stopped_jobs: number;
  done_jobs: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrewDetail {
  id: string;
  org_id: string;
  template_id: string;
  template_name: string;
  template_key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  tracker_connector_key: string;
  intake: { team?: string; label?: string };
  state_map: Partial<Record<NormalizedState, string>>;
  notify_channel_id: string | null;
  max_active_jobs: number;
  start_mode: StartMode;
  schedule_cron: string | null;   // 5-field cron, UTC; null = no schedule
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_result: string | null;
  active_jobs: number;
  stopped_jobs: number;
  done_jobs: number;
  tasks: FactoryTask[];
  roles: Record<string, string>;
}

export interface CrewInput {
  name?: string;
  description?: string | null;
  template_id?: string;
  tracker_connector_key?: string;
  intake?: { team?: string; label?: string };
  state_map?: Partial<Record<NormalizedState, string>>;
  max_active_jobs?: number;
  start_mode?: StartMode;
  schedule_cron?: string | null;
  enabled?: boolean;
  roles?: Record<string, string>;
}

export type AttemptStatus = 'queued' | 'running' | 'done' | 'not_ready' | 'failed' | 'denied';

export interface FactoryAttempt {
  id: string;
  job_id: string;
  task_key: string;
  attempt: number;
  agent_id: string | null;
  execution_log_id: string | null;
  status: AttemptStatus;
  error: string | null;
  decision: 'approve' | 'deny' | null;
  decision_expired: boolean;
  feedback: string | null;
  summary: string | null;
  desk_id: string | null;
  not_before: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export type JobStatus = 'active' | 'stopped' | 'done' | 'canceled';

export interface FactoryJob {
  id: string;
  crew_id: string;
  crew_name: string;
  tracker_item_id: string | null;    // null until a discover-mode job's Discover plans work
  tracker_identifier: string | null;
  tracker_url: string | null;
  title: string | null;
  status: JobStatus;
  stop_reason: string | null;
  repo: string | null;
  base_branch: string | null;
  branch: string | null;
  prior_results: Record<string, Record<string, unknown>>;
  started_by: string | null;         // 'schedule' | 'manual:<email>' | 'api:<client>'
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  tasks: FactoryTask[];
  attempts: FactoryAttempt[];
}

export interface FactoryJobDetail extends FactoryJob {
  roles: Record<string, string>;
}

const base = (orgId: string) => `/admin/organizations/${orgId}/factory`;

export async function getFactoryTemplates(orgId: string) {
  const r = await apiClient.get<{ templates: FactoryTemplate[] }>(`${base(orgId)}/templates`);
  return r.data.templates;
}

export async function getFactoryTrackers(orgId: string) {
  const r = await apiClient.get<{ trackers: FactoryTracker[] }>(`${base(orgId)}/trackers`);
  return r.data.trackers;
}

export async function getCrews(orgId: string) {
  const r = await apiClient.get<{ crews: CrewSummary[] }>(`${base(orgId)}/crews`);
  return r.data.crews;
}

export async function getCrew(orgId: string, id: string) {
  const r = await apiClient.get<{ crew: CrewDetail }>(`${base(orgId)}/crews/${id}`);
  return r.data.crew;
}

export async function createCrew(orgId: string, input: CrewInput) {
  const r = await apiClient.post<{ crew: CrewDetail }>(`${base(orgId)}/crews`, input);
  return r.data.crew;
}

export async function updateCrew(orgId: string, id: string, input: CrewInput) {
  const r = await apiClient.patch<{ crew: CrewDetail }>(`${base(orgId)}/crews/${id}`, input);
  return r.data.crew;
}

export async function deleteCrew(orgId: string, id: string) {
  await apiClient.delete(`${base(orgId)}/crews/${id}`);
}

/** Start now — what its schedule or the API would do. `result` says what happened. */
export async function startCrewJobs(orgId: string, id: string) {
  const r = await apiClient.post<{ started: number; result: string; job_ids: string[] }>(`${base(orgId)}/crews/${id}/start`);
  return r.data;
}

/**
 * Jobs for the lists, newest activity first. `from`/`to` (ISO) window on when
 * a job started. List rows carry only each task's pr_url in prior_results and
 * no attempt summaries — getJob has the full detail.
 */
export async function getJobs(orgId: string, opts?: { crewId?: string; status?: JobStatus; from?: string; to?: string }) {
  const r = await apiClient.get<{ jobs: FactoryJob[] }>(`${base(orgId)}/jobs`, {
    params: {
      ...(opts?.crewId ? { crew_id: opts.crewId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.from ? { from: opts.from } : {}),
      ...(opts?.to ? { to: opts.to } : {}),
    },
  });
  return r.data.jobs;
}

/** Kill a job: aborts what's running, cancels its open sub-tasks and the parent ticket. */
export async function cancelJob(orgId: string, id: string, reason?: string) {
  await apiClient.post(`${base(orgId)}/jobs/${id}/cancel`, reason ? { reason } : {});
}

export async function getJob(orgId: string, id: string) {
  const r = await apiClient.get<{ job: FactoryJobDetail }>(`${base(orgId)}/jobs/${id}`);
  return r.data.job;
}
