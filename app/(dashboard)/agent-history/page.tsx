'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAgents,
  getExecutionHistory,
  abortBrowserRun,
  type Agent,
  type ExecutionRun,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Webhook,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Loader2,
  Filter,
  X,
  History,
  Eye,
  Monitor,
  Zap,
  ArrowUpRight,
  CalendarIcon,
  GitBranch,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { useEventStream } from '@/lib/hooks/use-event-stream';

// ─── Constants ────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  executing:         'Executing',
  awaiting_approval: 'Awaiting Approval',
  awaiting_login:    'Awaiting Login',
  provisioning:      'Starting',
  queued:            'Queued',
  completed:         'Completed',
  failed:            'Failed',
  aborted:           'Aborted',
};

const TRIGGER_LABELS: Record<string, string> = {
  webhook: 'Webhook',
  cron:    'Cron',
  manual:  'Manual',
};

const STATUS_GROUPS: Record<string, string[]> = {
  active:    ['executing', 'awaiting_approval', 'provisioning'],
  queued:    ['queued'],
  completed: ['completed', 'failed', 'aborted'],
};

const FILTERABLE_STATUSES = ['provisioning', 'executing', 'queued', 'awaiting_approval', 'completed', 'failed', 'aborted'] as const;
const FILTERABLE_TRIGGERS  = ['webhook', 'cron', 'manual'] as const;
const ABORTABLE_STATUSES   = ['executing', 'awaiting_approval', 'provisioning', 'queued'] as const;

// ─── Helpers ─────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ExecutingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return (
    <Badge variant="outline" className="gap-1.5 border-green-500 text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" />Completed
    </Badge>
  );
  if (status === 'failed') return (
    <Badge variant="outline" className="gap-1.5 border-red-400 text-red-600 dark:text-red-400">
      <XCircle className="h-3 w-3" />Failed
    </Badge>
  );
  if (status === 'aborted') return (
    <Badge variant="outline" className="gap-1.5 border-red-400 text-red-600 dark:text-red-400">
      <XCircle className="h-3 w-3" />Aborted
    </Badge>
  );
  if (status === 'executing') return (
    <Badge variant="outline" className="gap-2 border-blue-300 text-blue-600 dark:text-blue-400">
      <ExecutingDots />Executing
    </Badge>
  );
  if (status === 'awaiting_approval') return (
    <Badge variant="outline" className="gap-1.5 border-violet-400 text-violet-600 dark:text-violet-400">
      <PauseCircle className="h-3 w-3" />Awaiting Approval
    </Badge>
  );
  if (status === 'awaiting_login') return (
    <Badge variant="outline" className="gap-1.5 border-amber-400 text-amber-600 dark:text-amber-400">
      <Monitor className="h-3 w-3" />Awaiting Login
    </Badge>
  );
  if (status === 'provisioning') return (
    <Badge variant="outline" className="gap-1.5 border-orange-400 text-orange-600 dark:text-orange-400">
      <Loader2 className="h-3 w-3 animate-spin" />Starting
    </Badge>
  );
  if (status === 'queued') return (
    <Badge variant="outline" className="gap-1.5 border-amber-400 text-amber-600 dark:text-amber-400">
      <Clock className="h-3 w-3" />Queued
    </Badge>
  );
  return <Badge variant="secondary">{status}</Badge>;
}

function TriggerBadge({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    webhook: { icon: <Webhook className="h-3 w-3" />, label: 'Webhook', cls: 'border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400' },
    cron:    { icon: <Clock className="h-3 w-3" />,   label: 'Cron',    cls: 'border-cyan-300 text-cyan-700 bg-cyan-50 dark:bg-cyan-950/40 dark:text-cyan-400' },
    manual:  { icon: <Play className="h-3 w-3" />,    label: 'Manual',  cls: 'border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-900/40 dark:text-slate-400' },
  };
  const def = map[type] ?? { icon: null, label: type, cls: '' };
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', def.cls)}>
      {def.icon}{def.label}
    </Badge>
  );
}

// ─── Runs Table ───────────────────────────────────────────────

/**
 * Card-based run feed.  Each row shows the agent name, a visual progress
 * bar (one dot per action), duration, token/cost rollup, and relationship
 * cues (sub-agent indicator, child count for parents).  Clicking the row
 * goes to the detail view; inline icons handle secondary actions.
 */
function RunsTable({
  runs,
  onOpenBrowser,
  onAbort,
  abortingRunId,
}: {
  runs: ExecutionRun[];
  onOpenBrowser: (run: ExecutionRun) => void;
  onAbort?: (run: ExecutionRun) => void;
  abortingRunId?: string | null;
}) {
  const router = useRouter();
  return (
    <div>
      {/* Column headers */}
      <div className="hidden md:grid grid-cols-[1fr_140px_80px_80px_70px_100px_60px] gap-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 border-b">
        <span>Agent</span>
        <span>Status</span>
        <span>Trigger</span>
        <span className="text-right">Duration</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Cost</span>
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {runs.map((run) => {
          const actions = run.action_logs ?? [];
          const displayStatus = run.display_status ?? run.status;
          const isRunning     = run.status === 'executing' || run.status === 'provisioning';
          const isAwaiting    = run.status === 'awaiting_approval';
          const durationMs =
            run.completed_at
              ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
              : isRunning || isAwaiting ? Date.now() - new Date(run.started_at).getTime() : null;
          const costUsd = typeof run.cost_usd === 'string' ? parseFloat(run.cost_usd) : (run.cost_usd ?? 0);
          const tokensTotal = (run.tokens_input ?? 0) + (run.tokens_output ?? 0);
          const childCount = run.child_count ?? 0;
          const completedSteps = actions.filter((a) => a.status === 'completed' || a.status === 'approved').length;

          return (
            <div key={run.id} className="cursor-pointer hover:bg-muted/30 transition-colors"
                 onClick={() => router.push(`/agent-history/${run.id}`)}>

              {/* Desktop: column layout */}
              <div className="hidden md:grid grid-cols-[1fr_140px_80px_80px_70px_100px_60px] gap-2 items-center px-3 py-2">
                {/* Agent */}
                <div className="flex items-center gap-2 min-w-0">
                  <StatusGlyph status={displayStatus} />
                  {run.depth > 0 && <GitBranch className="h-3 w-3 text-indigo-500 shrink-0" />}
                  <span className={cn('text-sm font-medium truncate', run.depth > 0 && 'text-indigo-600 dark:text-indigo-400')}>{run.agent_name}</span>
                  {childCount > 0 && (
                    <span className="text-[9px] text-indigo-500 shrink-0">{childCount} sub</span>
                  )}
                  {run.has_active_browser && <Monitor className="h-3 w-3 text-blue-500 shrink-0" />}
                </div>
                {/* Status */}
                <StatusBadge status={displayStatus} />
                {/* Trigger */}
                <TriggerBadge type={run.trigger_type} />
                {/* Duration */}
                <span className="text-xs text-muted-foreground tabular-nums text-right">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                {/* Tokens */}
                <span className="text-xs text-muted-foreground tabular-nums text-right">
                  {tokensTotal > 0 ? (tokensTotal >= 1000 ? `${(tokensTotal / 1000).toFixed(1)}K` : tokensTotal) : '—'}
                </span>
                {/* Cost */}
                <span className="text-xs tabular-nums text-right text-emerald-700 dark:text-emerald-400">
                  {costUsd > 0 ? (costUsd < 0.01 ? '< $0.01' : `$${costUsd.toFixed(2)}`) : '—'}
                </span>
                {/* Actions */}
                <div className="flex items-center justify-end gap-0.5">
                  {onAbort && (ABORTABLE_STATUSES as readonly string[]).includes(run.status) && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/50 hover:text-destructive"
                      disabled={abortingRunId === run.id}
                      onClick={(e) => { e.stopPropagation(); onAbort(run); }}>
                      {abortingRunId === run.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress bar below the row */}
              {(run.total_actions ?? actions.length) > 0 && (
                <div className="flex items-center gap-0.5 px-3 pb-1.5 -mt-0.5">
                  {actions.map((a) => (
                    <span key={a.id} className={cn(
                      'h-1 rounded-full w-4',
                      a.status === 'completed' || a.status === 'approved' ? 'bg-emerald-500' :
                      a.status === 'failed' ? 'bg-red-500' :
                      a.status === 'executing' ? 'bg-blue-500 animate-pulse' :
                      a.status === 'awaiting_approval' ? 'bg-amber-500 animate-pulse' :
                      'bg-muted'
                    )} title={`${a.action_name ?? a.action_type} · ${a.status}`} />
                  ))}
                  {/* Remaining steps not yet started */}
                  {Array.from({ length: Math.max(0, (run.total_actions ?? actions.length) - actions.length) }).map((_, i) => (
                    <span key={`pending-${i}`} className="h-1 w-4 rounded-full bg-muted/50" />
                  ))}
                  <span className="text-[9px] text-muted-foreground/40 ml-1 tabular-nums">{completedSteps}/{run.total_actions ?? actions.length}</span>
                </div>
              )}

              {/* Mobile: stacked */}
              <div className="md:hidden px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <StatusGlyph status={displayStatus} />
                  <span className="font-medium text-sm truncate">{run.agent_name}</span>
                  <StatusBadge status={displayStatus} />
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(run.started_at)} · {durationMs != null ? formatDuration(durationMs) : '—'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Leading glyph — makes status scannable even before reading the badge.
 */
function StatusGlyph({ status }: { status: string }) {
  const map: Record<string, { color: string; pulse: boolean; char: string }> = {
    executing:         { color: 'bg-blue-500',    pulse: true,  char: '●' },
    provisioning:      { color: 'bg-slate-400',   pulse: true,  char: '●' },
    queued:            { color: 'bg-slate-300',   pulse: false, char: '●' },
    awaiting_approval: { color: 'bg-violet-500',  pulse: true,  char: '●' },
    awaiting_login:    { color: 'bg-amber-500',   pulse: true,  char: '●' },
    completed:         { color: 'bg-emerald-500', pulse: false, char: '●' },
    failed:            { color: 'bg-red-500',     pulse: false, char: '●' },
    aborted:           { color: 'bg-red-400',     pulse: false, char: '●' },
  };
  const s = map[status] ?? map.executing;
  return (
    <span className="relative flex h-2 w-2 mt-1">
      {s.pulse && <span className={cn('animate-ping absolute h-full w-full rounded-full opacity-75', s.color)} />}
      <span className={cn('relative rounded-full h-2 w-2', s.color)} />
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────

const PAGE_SIZE = 15;

function isGroupActive(group: 'active' | 'queued' | 'completed', statuses: string[]): boolean {
  const gs = STATUS_GROUPS[group];
  return statuses.length === gs.length && gs.every(s => statuses.includes(s));
}

export default function AgentExecutionsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const permitted = useRequirePermission('agent_center_user');
  const searchParams = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [browserHITL, setBrowserHITL] = useState<{ runId: string; agentId: string; agentName: string } | null>(null);
  const [abortingRunId, setAbortingRunId] = useState<string | null>(null);

  // Summary card counts (unaffected by table filters)
  const [summaryActive, setSummaryActive]       = useState(0);
  const [summaryQueued, setSummaryQueued]       = useState(0);
  const [summaryCompleted, setSummaryCompleted] = useState(0);

  // Multi-select filter state
  const [statusFilters, setStatusFilters]   = useState<string[]>([]);
  const [triggerFilter, setTriggerFilter]   = useState<string>('');
  const [agentFilter, setAgentFilter]       = useState<string>('');
  const [fromFilter, setFromFilter]         = useState<string>('');
  const [toFilter, setToFilter]             = useState<string>('');

  // Inline date input state
  const [pendingDate, setPendingDate]       = useState<'from' | 'to' | null>(null);
  const [dateInputValue, setDateInputValue] = useState('');

  const initialAgentId = useRef(searchParams.get('agent_id'));

  const hasFilters = statusFilters.length > 0 || !!triggerFilter || !!agentFilter || !!fromFilter || !!toFilter;

  // ─── Load functions ─────────────────────────────────────────

  const loadHistory = useCallback(async (
    pg: number,
    opts?: {
      statuses?: string[];
      trigger?: string;
      agentId?: string;
      from?: string;
      to?: string;
      silent?: boolean;
    }
  ) => {
    if (!selectedOrgId) return;
    const silent   = opts?.silent ?? false;
    const statuses = opts?.statuses  !== undefined ? opts.statuses  : statusFilters;
    const trigger  = opts?.trigger   !== undefined ? opts.trigger   : triggerFilter;
    const agentId  = opts?.agentId   !== undefined ? opts.agentId   : agentFilter;
    const from     = opts?.from      !== undefined ? opts.from      : fromFilter;
    const to       = opts?.to        !== undefined ? opts.to        : toFilter;

    try {
      if (!silent) setLoading(true);
      const params: Record<string, any> = { page: pg, limit: PAGE_SIZE };
      if (statuses.length > 0) params.status       = statuses;
      if (trigger)              params.trigger_type = trigger;
      if (agentId)              params.agent_id     = agentId;
      if (from)                 params.from         = new Date(from + 'T00:00:00').toISOString();
      if (to) { const d = new Date(to + 'T00:00:00'); d.setHours(23, 59, 59, 999); params.to = d.toISOString(); }
      const data = await getExecutionHistory(selectedOrgId, params);
      setRuns(data.items ?? []);
      setTotal(data.total);
      setTotalPages(data.pages);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Failed to load history');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId, statusFilters, triggerFilter, agentFilter, fromFilter, toFilter]);

  const loadSummary = useCallback(async () => {
    if (!selectedOrgId) return;
    const [execRes, approvalRes, provisionRes, queuedRes, completedRes] = await Promise.allSettled([
      getExecutionHistory(selectedOrgId, { status: 'executing',         limit: 1 }),
      getExecutionHistory(selectedOrgId, { status: 'awaiting_approval', limit: 1 }),
      getExecutionHistory(selectedOrgId, { status: 'provisioning',      limit: 1 }),
      getExecutionHistory(selectedOrgId, { status: 'queued',            limit: 1 }),
      getExecutionHistory(selectedOrgId, { status: 'completed',         limit: 1 }),
    ]);
    const active =
      (execRes.status      === 'fulfilled' ? execRes.value.total      : 0) +
      (approvalRes.status  === 'fulfilled' ? approvalRes.value.total  : 0) +
      (provisionRes.status === 'fulfilled' ? provisionRes.value.total : 0);
    setSummaryActive(active);
    if (queuedRes.status    === 'fulfilled') setSummaryQueued(queuedRes.value.total);
    if (completedRes.status === 'fulfilled') setSummaryCompleted(completedRes.value.total);
  }, [selectedOrgId]);

  // ─── Filter helpers ──────────────────────────────────────────

  const toggleStatus = (status: string, checked: boolean) => {
    const next = checked ? [...statusFilters, status] : statusFilters.filter(s => s !== status);
    setStatusFilters(next);
    setPage(1);
    loadHistory(1, { statuses: next, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: toFilter });
  };

  const applyGroupFilter = (group: 'active' | 'queued' | 'completed') => {
    const statuses = STATUS_GROUPS[group];
    setStatusFilters(statuses);
    setPage(1);
    loadHistory(1, { statuses, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: toFilter });
  };

  const applyDate = (type: 'from' | 'to', value: string) => {
    if (!value) return;
    if (type === 'from' && toFilter && value > toFilter) { toast.error('From date cannot be after To date'); return; }
    if (type === 'to' && fromFilter && value < fromFilter) { toast.error('To date cannot be before From date'); return; }
    if (type === 'from') {
      setFromFilter(value);
      loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter, from: value, to: toFilter });
    } else {
      setToFilter(value);
      loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: value });
    }
    setPage(1);
    setPendingDate(null);
    setDateInputValue('');
  };

  const clearFilters = () => {
    setStatusFilters([]);
    setTriggerFilter('');
    setAgentFilter('');
    setFromFilter('');
    setToFilter('');
    setPage(1);
    loadHistory(1, { statuses: [], trigger: '', agentId: '', from: '', to: '' });
  };

  const goToPage = (pg: number) => {
    setPage(pg);
    loadHistory(pg);
  };

  const handleRefresh = () => {
    loadHistory(page);
    loadSummary();
  };

  // ─── Effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedOrgId) return;
    getAgents(selectedOrgId).then((d) => setAgents(d.agents)).catch(() => {});
  }, [selectedOrgId]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setPage(1);
    loadHistory(1);
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  // ─── Realtime: refresh on any execution status change in this org ──
  // Debounce bursts of events (sibling auto-resume fires many at once)
  // so we issue a single refresh instead of one per event.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      loadHistory(page, { silent: true });
      loadSummary();
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`] : [],
    enabled: !!selectedOrgId,
    onEvent: scheduleRefresh,
  });

  // Seed agent filter from URL param once agents list is loaded
  useEffect(() => {
    if (!initialAgentId.current || agents.length === 0) return;
    const id = initialAgentId.current;
    initialAgentId.current = null;
    const found = agents.find(a => a.id === id);
    if (!found) return;
    setAgentFilter(id);
    setPage(1);
    loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: id, from: fromFilter, to: toFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // ─── Abort ───────────────────────────────────────────────────

  const handleAbort = async (run: ExecutionRun) => {
    const isQueued = run.status === 'queued';
    const confirmed = await confirm({
      title:       isQueued ? 'Remove from Queue' : 'Abort Run',
      description: isQueued
        ? `"${run.agent_name}" is waiting to run. Remove it from the queue?`
        : `This will stop "${run.agent_name}" and close the browser session. Any unsaved progress will be lost.`,
      confirmText: isQueued ? 'Remove from Queue' : 'Abort Run',
      cancelText:  isQueued ? 'Keep Queued'       : 'Keep Running',
      variant:     'destructive',
    });
    if (!confirmed) return;
    setAbortingRunId(run.id);
    try {
      await abortBrowserRun(run.id);
      toast.success(isQueued ? 'Removed from queue' : 'Agent run aborted');
      loadHistory(page);
      loadSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? (isQueued ? 'Failed to remove from queue' : 'Failed to abort run'));
    } finally {
      setAbortingRunId(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  // Card-based feed — no grid header needed (info is inline per card).

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header + pagination */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Executions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live and historical agent runs</p>
        </div>
        <div className="flex items-center gap-2">
          {totalPages > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || !selectedOrgId}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to view execution history.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40', isGroupActive('active', statusFilters) && 'ring-2 ring-blue-400/60 bg-blue-50/40 dark:bg-blue-950/20')}
              onClick={() => applyGroupFilter('active')}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium">Active Runs</span>
                  <Badge variant="outline" className="ml-auto gap-1.5 border-blue-300 text-blue-600 dark:text-blue-400 text-xs">
                    {summaryActive > 0 ? <><ExecutingDots />{summaryActive}</> : summaryActive}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40', isGroupActive('queued', statusFilters) && 'ring-2 ring-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20')}
              onClick={() => applyGroupFilter('queued')}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-sm font-medium">Queued</span>
                  <Badge variant="outline" className="ml-auto border-amber-300 text-amber-600 dark:text-amber-400 text-xs">
                    {summaryQueued}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40', isGroupActive('completed', statusFilters) && 'ring-2 ring-green-400/60 bg-green-50/40 dark:bg-green-950/20')}
              onClick={() => applyGroupFilter('completed')}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span className="text-sm font-medium">Completed</span>
                  <Badge variant="outline" className="ml-auto border-green-300 text-green-600 dark:text-green-400 text-xs">
                    {summaryCompleted.toLocaleString()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Runs Table Card */}
          <Card>
            <CardHeader className="pb-3 border-b">
              {/* Filter dropdowns row */}
              <div className="flex flex-wrap items-center gap-2">

                {/* Status multi-select */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-8 gap-1.5 text-xs border-dashed', statusFilters.length > 0 && 'border-solid border-primary/40 text-foreground')}
                    >
                      <Filter className="h-3 w-3" />
                      Status
                      {statusFilters.length > 0 && (
                        <Badge variant="secondary" className="ml-0.5 h-4 min-w-4 px-1 text-xs">{statusFilters.length}</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">Active</DropdownMenuLabel>
                    {(['provisioning', 'executing', 'queued', 'awaiting_approval'] as const).map(s => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={statusFilters.includes(s)}
                        onCheckedChange={(c) => toggleStatus(s, c)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {STATUS_LABELS[s]}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">History</DropdownMenuLabel>
                    {(['completed', 'failed', 'aborted'] as const).map(s => (
                      <DropdownMenuCheckboxItem
                        key={s}
                        checked={statusFilters.includes(s)}
                        onCheckedChange={(c) => toggleStatus(s, c)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {STATUS_LABELS[s]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Trigger dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-8 gap-1.5 text-xs border-dashed', triggerFilter && 'border-solid border-primary/40 text-foreground')}
                    >
                      <Webhook className="h-3 w-3" />
                      Trigger
                      {triggerFilter && (
                        <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-xs">1</Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {FILTERABLE_TRIGGERS.map(t => (
                      <DropdownMenuCheckboxItem
                        key={t}
                        checked={triggerFilter === t}
                        onCheckedChange={(c) => {
                          const next = c ? t : '';
                          setTriggerFilter(next);
                          setPage(1);
                          loadHistory(1, { statuses: statusFilters, trigger: next, agentId: agentFilter, from: fromFilter, to: toFilter });
                        }}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {TRIGGER_LABELS[t]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Agent dropdown */}
                {agents.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn('h-8 gap-1.5 text-xs border-dashed', agentFilter && 'border-solid border-primary/40 text-foreground')}
                      >
                        <Monitor className="h-3 w-3" />
                        Agent
                        {agentFilter && (
                          <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-xs">1</Badge>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 max-h-60 overflow-y-auto">
                      {agents.map(a => (
                        <DropdownMenuCheckboxItem
                          key={a.id}
                          checked={agentFilter === a.id}
                          onCheckedChange={(c) => {
                            const next = c ? a.id : '';
                            setAgentFilter(next);
                            setPage(1);
                            loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: next, from: fromFilter, to: toFilter });
                          }}
                          onSelect={(e) => e.preventDefault()}
                        >
                          {a.name}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* From date */}
                {pendingDate === 'from' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">From:</span>
                    <Input
                      type="date"
                      value={dateInputValue}
                      onChange={(e) => setDateInputValue(e.target.value)}
                      max={toFilter || undefined}
                      className="h-8 text-xs w-[136px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && dateInputValue) applyDate('from', dateInputValue);
                        if (e.key === 'Escape') { setPendingDate(null); setDateInputValue(''); }
                      }}
                    />
                    <Button size="sm" className="h-8 px-3 text-xs" onClick={() => applyDate('from', dateInputValue)} disabled={!dateInputValue}>Add</Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setPendingDate(null); setDateInputValue(''); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-8 gap-1.5 text-xs border-dashed', fromFilter && 'border-solid border-primary/40 text-foreground')}
                    onClick={() => { setPendingDate('from'); setDateInputValue(fromFilter); }}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    From{fromFilter && `: ${formatShortDate(fromFilter)}`}
                  </Button>
                )}

                {/* To date */}
                {pendingDate === 'to' ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">To:</span>
                    <Input
                      type="date"
                      value={dateInputValue}
                      onChange={(e) => setDateInputValue(e.target.value)}
                      min={fromFilter || undefined}
                      className="h-8 text-xs w-[136px]"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && dateInputValue) applyDate('to', dateInputValue);
                        if (e.key === 'Escape') { setPendingDate(null); setDateInputValue(''); }
                      }}
                    />
                    <Button size="sm" className="h-8 px-3 text-xs" onClick={() => applyDate('to', dateInputValue)} disabled={!dateInputValue}>Add</Button>
                    <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setPendingDate(null); setDateInputValue(''); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn('h-8 gap-1.5 text-xs border-dashed', toFilter && 'border-solid border-primary/40 text-foreground')}
                    onClick={() => { setPendingDate('to'); setDateInputValue(toFilter); }}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    To{toFilter && `: ${formatShortDate(toFilter)}`}
                  </Button>
                )}

                {/* Clear all */}
                {hasFilters && pendingDate === null && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}
              </div>

              {/* Active filter pills */}
              {hasFilters && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2">
                  {statusFilters.map(s => (
                    <span key={`s-${s}`} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                      {STATUS_LABELS[s] ?? s}
                      <button
                        onClick={() => toggleStatus(s, false)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  {triggerFilter && (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                      {TRIGGER_LABELS[triggerFilter] ?? triggerFilter}
                      <button
                        onClick={() => {
                          setTriggerFilter('');
                          setPage(1);
                          loadHistory(1, { statuses: statusFilters, trigger: '', agentId: agentFilter, from: fromFilter, to: toFilter });
                        }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {agentFilter && (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                      {agents.find(a => a.id === agentFilter)?.name ?? agentFilter}
                      <button
                        onClick={() => {
                          setAgentFilter('');
                          setPage(1);
                          loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: '', from: fromFilter, to: toFilter });
                        }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {fromFilter && (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                      From: {formatShortDate(fromFilter)}
                      <button
                        onClick={() => {
                          setFromFilter('');
                          setPage(1);
                          loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter, from: '', to: toFilter });
                        }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                  {toFilter && (
                    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                      To: {formatShortDate(toFilter)}
                      <button
                        onClick={() => {
                          setToFilter('');
                          setPage(1);
                          loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: '' });
                        }}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <History className="mx-auto h-10 w-10 mb-3 opacity-20" />
                  <p className="text-sm">No runs found{hasFilters ? ' matching the current filters' : ''}.</p>
                </div>
              ) : (
                <>
                  <RunsTable
                    runs={runs}
                    onOpenBrowser={(run) => setBrowserHITL({ runId: run.id, agentId: run.agent_id, agentName: run.agent_name })}
                    onAbort={handleAbort}
                    abortingRunId={abortingRunId}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Browser HITL dialog */}
      {browserHITL && (
        <BrowserHITLDialog
          open={!!browserHITL}
          onOpenChange={(o) => { if (!o) { setBrowserHITL(null); loadHistory(page); } }}
          runId={browserHITL.runId}
          agentId={browserHITL.agentId}
          agentName={browserHITL.agentName}
        />
      )}
    </div>
  );
}
