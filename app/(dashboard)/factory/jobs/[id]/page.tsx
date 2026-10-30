'use client';

/**
 * One job: a timeline of its crew's tasks (latest attempt open, earlier ones
 * folded), with the job's facts — crew, ticket, repository, branch, PR — in a
 * side panel. Anything waiting on a person (a review, a stopped task) is called
 * out at the top with where to act.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Briefcase, ChevronDown, ExternalLink, GitPullRequest, Loader2, RefreshCw, TriangleAlert, Eye } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, type Agent } from '@/lib/api/agents';
import { cancelJob, getJob, type FactoryAttempt, type FactoryJobDetail, type FactoryTask } from '@/lib/api/factory';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Ban } from 'lucide-react';
import { JOB_STATUS, TASK_STATE, ago, attemptsOf, currentTask, jobPrUrl, latestAttempt, taskState } from '@/components/factory/job-state';
import { SimpleMarkdown } from '@/components/factory/SimpleMarkdown';

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const canEdit = useRequirePermission('agent_center_manager');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [job, setJob] = useState<FactoryJobDetail | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (!selectedOrgId) return;
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const [j, a] = await Promise.all([getJob(selectedOrgId, id), initial ? getAgents(selectedOrgId) : Promise.resolve(null)]);
      setJob(j);
      if (a) setAgents(a.agents);
    } catch { /* keep what we have */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedOrgId, id]);

  useEffect(() => {
    if (!canView) return;
    load(true);
  }, [canView, load]);

  useEffect(() => {
    if (job?.status !== 'active') return;
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [job?.status, load]);

  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  if (!canView) return <NoPermissionContent />;
  if (loading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!job) return <div className="p-6 text-sm text-muted-foreground">Job not found.</div>;

  const cancel = async () => {
    if (!selectedOrgId) return;
    setCanceling(true);
    try {
      await cancelJob(selectedOrgId, id);
      toast.success('Job canceled — its open sub-tasks and the ticket were canceled.');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to cancel the job');
    } finally { setCanceling(false); }
  };

  const current = job.status === 'active' ? currentTask(job, job.tasks) : null;
  const currentAttempt = current ? latestAttempt(job, current.key) : undefined;
  const awaitingReview = !!current && taskState(currentAttempt) === 'review';
  const prUrl = jobPrUrl(job);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Briefcase}
        title={job.title ?? job.tracker_identifier ?? 'Job'}
        breadcrumbs={[{ label: 'Jobs', href: '/factory/jobs' }, { label: job.tracker_identifier ?? 'Job' }]}
        badge={<Badge variant={JOB_STATUS[job.status].variant}>{JOB_STATUS[job.status].label}</Badge>}
        meta={(
          <span className="text-xs text-muted-foreground">
            {job.tracker_identifier} · <Link href={`/factory/crews/${job.crew_id}`} className="hover:text-foreground hover:underline">{job.crew_name}</Link> · started {ago(job.created_at)}
          </span>
        )}
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => load()} disabled={refreshing}>
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh
            </Button>
            {canEdit && (job.status === 'active' || job.status === 'stopped') && (
              <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmCancel(true)} disabled={canceling}>
                {canceling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}Cancel job
              </Button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        onConfirm={cancel}
        title="Cancel this job?"
        description="Whatever is running stops, its open sub-tasks and the parent ticket are canceled, and nothing more runs. The branch and any pull request are left as they are."
        confirmText="Cancel job"
        cancelText="Keep it"
      />

      {awaitingReview && current && (
        <Callout tone="warning" icon={Eye}>
          <span><strong>{current.name}</strong> is waiting for a review before the job continues.</span>
          {currentAttempt?.desk_id && (
            <Link href={`/interactions/decisions/${currentAttempt.desk_id}`} className="font-medium underline-offset-2 hover:underline">Open the decision →</Link>
          )}
        </Callout>
      )}
      {job.status === 'stopped' && (
        <Callout tone="danger" icon={TriangleAlert}>
          <span><strong>Stopped:</strong> {job.stop_reason} In the tracker, move the task&apos;s sub-task back to Todo to try again, mark it Done to skip it, or cancel it to cancel the job.</span>
        </Callout>
      )}
      {job.status === 'canceled' && (
        <Callout tone="danger" icon={Ban}>
          <span><strong>Canceled:</strong> {job.stop_reason ?? 'This job was canceled.'}</span>
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ol className="relative space-y-4">
          {job.tasks.map((t, i) => (
            <TaskCard
              key={t.key}
              task={t}
              attempts={attemptsOf(job, t.key)}
              agentName={job.roles[t.key] ? agentName.get(job.roles[t.key]!) : undefined}
              agentId={job.roles[t.key]}
              isCurrent={current?.key === t.key}
              last={i === job.tasks.length - 1}
            />
          ))}
        </ol>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5 text-sm">
              <Fact label="Crew"><Link href={`/factory/crews/${job.crew_id}`} className="text-brand hover:underline">{job.crew_name}</Link></Fact>
              <Fact label="Ticket">
                {job.tracker_url
                  ? <a href={job.tracker_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">{job.tracker_identifier} <ExternalLink className="h-3 w-3" /></a>
                  : job.tracker_identifier}
              </Fact>
              {job.repo && <Fact label="Repository">{job.repo}</Fact>}
              {(job.base_branch || job.branch) && (
                <Fact label="Branch">
                  <code className="break-all text-xs">{job.branch ?? '—'}</code>
                  {job.base_branch && <span className="text-muted-foreground"> → {job.base_branch}</span>}
                </Fact>
              )}
              {prUrl && (
                <Fact label="Pull request">
                  <a href={prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
                    <GitPullRequest className="h-3.5 w-3.5" /> {prUrl.replace(/^https:\/\/github\.com\//, '')}
                  </a>
                </Fact>
              )}
              <Fact label="Started">{new Date(job.created_at).toLocaleString()}</Fact>
              {job.finished_at && <Fact label="Finished">{new Date(job.finished_at).toLocaleString()}</Fact>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Callout({ tone, icon: Icon, children }: { tone: 'warning' | 'danger'; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm',
      tone === 'warning' ? 'border-warning/30 bg-warning-soft text-warning' : 'border-danger/30 bg-danger-soft text-danger',
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TaskCard({ task, attempts, agentName, agentId, isCurrent, last }: {
  task: FactoryTask;
  attempts: FactoryAttempt[];
  agentName?: string;
  agentId?: string;
  isCurrent: boolean;
  last: boolean;
}) {
  const latest = attempts[attempts.length - 1];
  const earlier = attempts.slice(0, -1).reverse();
  const state = taskState(latest);
  const [showEarlier, setShowEarlier] = useState(false);

  return (
    <li className="relative flex gap-4">
      {/* the timeline rail */}
      {!last && <span className="absolute left-[15px] top-9 bottom-[-16px] w-px bg-border" aria-hidden />}
      <span className={cn('relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-semibold', TASK_STATE[state].className)}>
        {task.position}
      </span>
      <Card className={cn('min-w-0 flex-1', isCurrent && 'border-brand/40')}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold">{task.name}</div>
              {agentId && (
                <Link href={`/agents/${agentId}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                  {agentName ?? 'Agent'}
                </Link>
              )}
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', TASK_STATE[state].className)}>
              {TASK_STATE[state].label}{attempts.length > 1 ? ` · attempt ${latest?.attempt}` : ''}
            </span>
          </div>

          {!latest ? (
            <p className="text-sm text-muted-foreground">Not started yet.</p>
          ) : (
            <AttemptBody attempt={latest} />
          )}

          {earlier.length > 0 && (
            <div className="border-t pt-2">
              <button
                type="button"
                onClick={() => setShowEarlier((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showEarlier && 'rotate-180')} />
                {showEarlier ? 'Hide' : 'Show'} {earlier.length} earlier attempt{earlier.length === 1 ? '' : 's'}
              </button>
              {showEarlier && (
                <div className="mt-3 space-y-4">
                  {earlier.map((a) => <AttemptBody key={a.id} attempt={a} compact />)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function AttemptBody({ attempt, compact }: { attempt: FactoryAttempt; compact?: boolean }) {
  const when = attempt.finished_at ?? attempt.started_at ?? attempt.created_at;
  const waitingUntil = attempt.status === 'queued' && attempt.not_before && Date.parse(attempt.not_before) > Date.now()
    ? new Date(attempt.not_before).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <div className={cn('space-y-2', compact && 'opacity-80')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Attempt {attempt.attempt}</span>
        <span>
          {attempt.status.replace('_', ' ')}
          {attempt.decision ? ` · ${attempt.decision === 'approve' ? 'approved' : 'denied'}${attempt.decision_expired ? ' (expired)' : ''}` : ''}
        </span>
        <span>{waitingUntil ? `starts ${waitingUntil}` : ago(when)}</span>
        {attempt.execution_log_id && <Link href={`/agent-history/${attempt.execution_log_id}`} className="text-brand hover:underline">View execution</Link>}
        {attempt.desk_id && <Link href={`/interactions/decisions/${attempt.desk_id}`} className="text-brand hover:underline">Decision</Link>}
      </div>
      {attempt.feedback && (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          <span className="font-medium">Reviewer:</span> {attempt.feedback}
        </div>
      )}
      {attempt.error && <p className="text-sm text-danger">{attempt.error}</p>}
      {attempt.summary && <SimpleMarkdown text={attempt.summary} className="space-y-2 text-sm text-foreground/90" />}
    </div>
  );
}
