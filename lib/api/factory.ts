import apiClient from './client';

/**
 * Agent Factory — wazzi-backend /admin/organizations/:orgId/factory/*.
 *
 *   Template → Crew → Job → Task → Attempt → (agent) Execution
 *
 * A CREW is a template set up for an org (tracker, intake label, an agent per
 * task). Every parent ticket it picks up is a JOB; a job moves through the
 * template's TASKS; each task may take a few ATTEMPTS, each one agent
 * EXECUTION. The coordinator is wazzi-backend's factory tick.
 */

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
  intake?: { team?: string; label: string };
  state_map?: Partial<Record<NormalizedState, string>>;
  max_active_jobs?: number;
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
  tracker_item_id: string;
  tracker_identifier: string | null;
  tracker_url: string | null;
  title: string | null;
  status: JobStatus;
  stop_reason: string | null;
  repo: string | null;
  base_branch: string | null;
  branch: string | null;
  prior_results: Record<string, Record<string, unknown>>;
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

export async function runCrewNow(orgId: string, id: string) {
  const r = await apiClient.post<{ claimed: number; started: number; finished: number; errors: { crew: string; error: string }[]; skipped?: string }>(
    `${base(orgId)}/crews/${id}/tick`,
  );
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

// ── Starting jobs + schedules ────────────────────────────────────────────────

export interface MonitoringErrorsSource {
  type: 'monitoring_errors';
  since_hours?: number;
  min_count?: number;
  max_groups?: number;
  services?: string[];
}

export interface CrewTrigger {
  id: string;
  crew_id: string;
  type: 'cron';
  name: string;
  enabled: boolean;
  cron_expr: string;
  job_title: string;
  job_brief: string | null;
  source: MonitoringErrorsSource | null;
  skip_if_active: boolean;
  next_fire_at: string | null;
  last_fired_at: string | null;
  last_result: string | null;
  last_job_id: string | null;
}

export interface CrewTriggerInput {
  name?: string;
  enabled?: boolean;
  cron_expr?: string;
  job_title?: string;
  job_brief?: string | null;
  source?: MonitoringErrorsSource | null;
  skip_if_active?: boolean;
}

/** Start a job now: creates the parent ticket in the crew's tracker and claims it. */
export async function startCrewJob(orgId: string, crewId: string, input: { title: string; description: string }) {
  const r = await apiClient.post<{ ticket: { id: string; identifier: string; url: string }; job_id: string | null }>(
    `${base(orgId)}/crews/${crewId}/jobs`, input);
  return r.data;
}

export async function getCrewTriggers(orgId: string, crewId: string) {
  const r = await apiClient.get<{ triggers: CrewTrigger[] }>(`${base(orgId)}/crews/${crewId}/triggers`);
  return r.data.triggers;
}

export async function createCrewTrigger(orgId: string, crewId: string, input: CrewTriggerInput) {
  const r = await apiClient.post<{ trigger: CrewTrigger }>(`${base(orgId)}/crews/${crewId}/triggers`, input);
  return r.data.trigger;
}

export async function updateCrewTrigger(orgId: string, crewId: string, id: string, input: CrewTriggerInput) {
  const r = await apiClient.patch<{ trigger: CrewTrigger }>(`${base(orgId)}/crews/${crewId}/triggers/${id}`, input);
  return r.data.trigger;
}

export async function deleteCrewTrigger(orgId: string, crewId: string, id: string) {
  await apiClient.delete(`${base(orgId)}/crews/${crewId}/triggers/${id}`);
}

/** Run a schedule now (its source included); when it next fires is unchanged. */
export async function fireCrewTrigger(orgId: string, crewId: string, id: string) {
  const r = await apiClient.post<{ result: string }>(`${base(orgId)}/crews/${crewId}/triggers/${id}/fire`);
  return r.data.result;
}

/** Kill a job: aborts what's running, cancels its open sub-tasks and the parent ticket. */
export async function cancelJob(orgId: string, id: string, reason?: string) {
  await apiClient.post(`${base(orgId)}/jobs/${id}/cancel`, reason ? { reason } : {});
}

export async function getJob(orgId: string, id: string) {
  const r = await apiClient.get<{ job: FactoryJobDetail }>(`${base(orgId)}/jobs/${id}`);
  return r.data.job;
}
