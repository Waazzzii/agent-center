'use client';

/**
 * Where a job stands, derived from its attempts — shared by the Jobs list, a
 * crew's Jobs tab and the job page so they always agree.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { FactoryAttempt, FactoryJob, FactoryTask, JobStatus } from '@/lib/api/factory';

export type TaskState = 'pending' | 'waiting' | 'running' | 'review' | 'rework' | 'failed' | 'done';

export const TASK_STATE: Record<TaskState, { label: string; className: string }> = {
  pending: { label: 'Not started',      className: 'bg-surface-2 text-muted-foreground border-border' },
  waiting: { label: 'Waiting',          className: 'bg-info-soft text-info border-info/20' },
  running: { label: 'Running',          className: 'bg-brand-soft text-brand-soft-fg border-brand/20' },
  review:  { label: 'Awaiting review',  className: 'bg-warning-soft text-warning border-warning/20' },
  rework:  { label: 'Re-running',       className: 'bg-warning-soft text-warning border-warning/20' },
  failed:  { label: 'Failed',           className: 'bg-danger-soft text-danger border-danger/20' },
  done:    { label: 'Done',             className: 'bg-success-soft text-success border-success/20' },
};

export const JOB_STATUS: Record<JobStatus, { label: string; variant: 'brand' | 'warning' | 'success' | 'neutral' }> = {
  active:   { label: 'Active',   variant: 'brand' },
  stopped:  { label: 'Stopped',  variant: 'warning' },
  done:     { label: 'Done',     variant: 'success' },
  canceled: { label: 'Canceled', variant: 'neutral' },
};

export function attemptsOf(job: Pick<FactoryJob, 'attempts'>, taskKey: string): FactoryAttempt[] {
  return job.attempts.filter((a) => a.task_key === taskKey).sort((a, b) => a.attempt - b.attempt);
}

export function latestAttempt(job: Pick<FactoryJob, 'attempts'>, taskKey: string): FactoryAttempt | undefined {
  const all = attemptsOf(job, taskKey);
  return all[all.length - 1];
}

export function taskState(a: FactoryAttempt | undefined): TaskState {
  if (!a) return 'pending';
  switch (a.status) {
    case 'running': return 'running';
    case 'queued': return a.attempt > 1 ? 'rework' : 'waiting';
    case 'not_ready': return 'waiting';
    case 'failed': return 'failed';
    case 'denied': return 'rework';
    case 'done': return a.desk_id && !a.decision ? 'review' : 'done';
  }
}

/** The task the job is on: the first one not done. */
export function currentTask(job: Pick<FactoryJob, 'attempts'>, tasks: FactoryTask[]): FactoryTask | null {
  return tasks.find((t) => taskState(latestAttempt(job, t.key)) !== 'done') ?? null;
}

/** One line for "where is it now". */
export function jobNow(job: FactoryJob): { text: string; tone: 'muted' | 'warning' | 'brand' } {
  if (job.status === 'stopped') return { text: `Stopped — ${job.stop_reason ?? ''}`, tone: 'warning' };
  if (job.status === 'done') return { text: 'Finished', tone: 'muted' };
  if (job.status === 'canceled') return { text: 'Canceled', tone: 'muted' };
  const t = currentTask(job, job.tasks);
  if (!t) return { text: 'Finishing', tone: 'muted' };
  const s = taskState(latestAttempt(job, t.key));
  return { text: `${t.name} · ${TASK_STATE[s].label.toLowerCase()}`, tone: s === 'review' ? 'warning' : 'brand' };
}

export function needsReview(job: FactoryJob): boolean {
  if (job.status !== 'active') return false;
  const t = currentTask(job, job.tasks);
  return !!t && taskState(latestAttempt(job, t.key)) === 'review';
}

/** The PR a job's Build produced, if any. */
export function jobPrUrl(job: Pick<FactoryJob, 'prior_results'>): string | null {
  for (const r of Object.values(job.prior_results ?? {})) {
    const url = (r as Record<string, unknown>)?.pr_url;
    if (typeof url === 'string' && url) return url;
  }
  return null;
}

export function TaskPills({ job, tasks }: { job: Pick<FactoryJob, 'attempts'>; tasks: FactoryTask[] }) {
  return (
    <div className="flex items-center gap-1">
      {tasks.map((t) => {
        const s = taskState(latestAttempt(job, t.key));
        return (
          <span
            key={t.key}
            title={`${t.name}: ${TASK_STATE[s].label}`}
            className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-medium', TASK_STATE[s].className)}
          >
            {t.position}
          </span>
        );
      })}
    </div>
  );
}

export function ago(iso: string | null | undefined) {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
