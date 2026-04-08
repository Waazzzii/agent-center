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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';

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

const RUN_COLS = 'grid-cols-[1fr_140px_120px_90px_80px_160px_130px]';

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
    <div className="divide-y">
      {runs.map((run) => {
        const completedSteps = (run.action_logs ?? []).filter((a) => a.status === 'completed' || a.status === 'approved').length;
        const displayStatus = run.display_status ?? run.status;
        const durationMs = run.started_at && run.completed_at
          ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
          : null;
        return (
          <div key={run.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => router.push(`/agent-history/${run.id}`)}>
            <div className="w-full">
              {/* Mobile layout */}
              <div className="md:hidden px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{run.agent_name}</span>
                  <StatusBadge status={displayStatus} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <TriggerBadge type={run.trigger_type} />
                  <span className="text-xs text-muted-foreground">{completedSteps}/{(run.action_logs ?? []).length} steps</span>
                  <span className="text-xs text-muted-foreground">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
                  <div className="flex items-center gap-1">
                    {displayStatus === 'awaiting_approval' && (
                      <Link
                        href={`/approvals?execution_id=${run.id}`}
                        className="text-violet-500 hover:text-violet-600"
                        title="Go to approval request"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop layout */}
              <div className={`hidden md:grid ${RUN_COLS} gap-3 items-center px-4 py-3`}>
                <div className="min-w-0 truncate">
                  <span className="text-xs font-mono text-muted-foreground/50 mr-1.5">[{run.id.slice(-4).toUpperCase()}]</span>
                  <span className="font-medium text-sm">{run.agent_name}</span>
                </div>
                <StatusBadge status={displayStatus} />
                <TriggerBadge type={run.trigger_type} />
                <span className="text-sm text-muted-foreground">{completedSteps}/{(run.action_logs ?? []).length}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
                <div className="flex items-center justify-end gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    title="View execution steps"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/agent-history/${run.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  {displayStatus === 'awaiting_approval' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-violet-500 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                      title="Go to approval request"
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/approvals?execution_id=${run.id}`}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                  {run.agent_requires_browser && (run.status === 'executing' || run.status === 'awaiting_approval') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      title="Open live browser view"
                      onClick={(e) => { e.stopPropagation(); onOpenBrowser(run); }}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onAbort && (run.status === 'executing' || run.status === 'awaiting_approval') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      title="Abort run"
                      disabled={abortingRunId === run.id}
                      onClick={(e) => { e.stopPropagation(); onAbort(run); }}
                    >
                      {abortingRunId === run.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <XCircle className="h-3.5 w-3.5" />
                      }
                    </Button>
                  )}
                </div>
              </div>
            </div>

          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

const PAGE_SIZE = 15;

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

  // Pill-based filters
  type FilterKey = 'agent' | 'status' | 'trigger' | 'from' | 'to';
  interface ActiveFilter { key: FilterKey; value: string; label: string }

  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [pendingType, setPendingType] = useState<FilterKey | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [valueSelectOpen, setValueSelectOpen] = useState(false);
  const initialAgentId = useRef(searchParams.get('agent_id'));

  const hasFilters = activeFilters.length > 0;

  // Split runs into active (live) and history (terminal) for display
  const activeRuns = runs.filter(r => r.status === 'executing' || r.status === 'awaiting_approval' || r.status === 'provisioning');
  const historyRuns = runs.filter(r => r.status !== 'executing' && r.status !== 'awaiting_approval' && r.status !== 'provisioning');

  const loadHistory = useCallback(async (pg: number = page, filters: ActiveFilter[] = activeFilters) => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const params: Record<string, any> = { page: pg, limit: PAGE_SIZE };
      const agentF   = filters.find(f => f.key === 'agent');
      const statusF  = filters.find(f => f.key === 'status');
      const triggerF = filters.find(f => f.key === 'trigger');
      const fromF    = filters.find(f => f.key === 'from');
      const toF      = filters.find(f => f.key === 'to');
      if (agentF)   params.agent_id     = agentF.value;
      if (statusF)  params.status       = statusF.value;
      if (triggerF) params.trigger_type = triggerF.value;
      if (fromF)    params.from         = new Date(fromF.value).toISOString();
      if (toF)      { const d = new Date(toF.value); d.setHours(23, 59, 59, 999); params.to = d.toISOString(); }
      const data = await getExecutionHistory(selectedOrgId, params);
      setRuns(data.items ?? []);
      setTotal(data.total);
      setTotalPages(data.pages);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, page]); // filters passed explicitly to avoid stale closure

  // Load agents for filter dropdown
  useEffect(() => {
    if (!selectedOrgId) return;
    getAgents(selectedOrgId).then((d) => setAgents(d.agents)).catch(() => {});
  }, [selectedOrgId]);

  // Load history when org changes — reset to page 1
  useEffect(() => {
    if (!selectedOrgId) return;
    setPage(1);
    loadHistory(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  // Seed agent filter from URL param once agents list is loaded, then reload with filter applied
  useEffect(() => {
    if (!initialAgentId.current || agents.length === 0) return;
    const id = initialAgentId.current;
    initialAgentId.current = null;
    const found = agents.find(a => a.id === id);
    if (!found) return;
    const seeded: ActiveFilter[] = [{ key: 'agent', value: id, label: `Agent: ${found.name}` }];
    setActiveFilters(seeded);
    setPage(1);
    loadHistory(1, seeded);
  }, [agents, loadHistory]);

  const cancelPending = () => { setPendingType(null); setPendingValue(''); setValueSelectOpen(false); };

  const confirmFilter = (type: FilterKey, value: string) => {
    const statusLabels: Record<string, string> = {
      executing: 'Executing', awaiting_approval: 'Awaiting Approval',
      completed: 'Completed', failed: 'Failed',
    };
    const triggerLabels: Record<string, string> = { webhook: 'Webhook', cron: 'Cron', manual: 'Manual' };
    let label = '';
    if (type === 'status')  label = `Status: ${statusLabels[value] ?? value}`;
    if (type === 'trigger') label = `Trigger: ${triggerLabels[value] ?? value}`;
    if (type === 'agent')   label = `Agent: ${agents.find(a => a.id === value)?.name ?? value}`;
    if (type === 'from' || type === 'to') {
      const fromVal = type === 'from' ? value : activeFilters.find(f => f.key === 'from')?.value;
      const toVal   = type === 'to'   ? value : activeFilters.find(f => f.key === 'to')?.value;
      if (fromVal && toVal && fromVal > toVal) {
        toast.error('From date cannot be after To date');
        return;
      }
      const formatted = new Date(value + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      label = type === 'from' ? `From: ${formatted}` : `To: ${formatted}`;
    }
    const newFilters = [...activeFilters.filter(f => f.key !== type), { key: type, value, label }];
    setActiveFilters(newFilters);
    cancelPending();
    setPage(1);
    loadHistory(1, newFilters);
  };

  const removeFilter = (key: FilterKey) => {
    const newFilters = activeFilters.filter(f => f.key !== key);
    setActiveFilters(newFilters);
    setPage(1);
    loadHistory(1, newFilters);
  };

  const clearFilters = () => {
    setActiveFilters([]);
    setPage(1);
    loadHistory(1, []);
  };

  const goToPage = (pg: number) => {
    setPage(pg);
    loadHistory(pg);
  };

  const handleAbort = async (run: ExecutionRun) => {
    const confirmed = await confirm({
      title: 'Abort Run',
      description: `This will stop "${run.agent_name}" and close the browser session. Any unsaved progress will be lost. Are you sure?`,
      confirmText: 'Abort Run',
      cancelText: 'Keep Running',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setAbortingRunId(run.id);
    try {
      await abortBrowserRun(run.id);
      toast.success('Agent run aborted');
      loadHistory(page);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to abort run');
    } finally {
      setAbortingRunId(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  const tableHeader = (
    <div className={`hidden md:grid ${RUN_COLS} gap-3 px-4 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
      <span>Agent</span>
      <span>Status</span>
      <span>Trigger</span>
      <span>Steps</span>
      <span>Duration</span>
      <span>Started</span>
      <span />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent Executions</h1>
          <p className="text-muted-foreground">Live and historical runs for all agents</p>
        </div>
        <Button variant="outline" onClick={() => loadHistory(page)} disabled={loading || !selectedOrgId}>
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to view execution history.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Step 1: pick a category */}
            {!pendingType && (
              <Select value="" onValueChange={(v) => { setPendingType(v as FilterKey); setPendingValue(''); setValueSelectOpen(true); }}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-dashed text-xs text-muted-foreground px-3">
                  <Filter className="h-3 w-3" />
                  <SelectValue placeholder="Add filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="trigger">Trigger</SelectItem>
                  {agents.length > 0 && <SelectItem value="agent">Agent</SelectItem>}
                  <SelectItem value="from">From date</SelectItem>
                  <SelectItem value="to">To date</SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Step 2: pick a value — auto-opens the dropdown */}
            {pendingType === 'status' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <Select value="" open={valueSelectOpen} onOpenChange={(o) => { setValueSelectOpen(o); if (!o) cancelPending(); }} onValueChange={(v) => confirmFilter('status', v)}>
                  <SelectTrigger className="h-8 text-xs w-[190px]">
                    <SelectValue placeholder="Select status…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Active</SelectLabel>
                      <SelectItem value="provisioning">Starting</SelectItem>
                      <SelectItem value="executing">Executing</SelectItem>
                      <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>History</SelectLabel>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}

            {pendingType === 'trigger' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Trigger:</span>
                <Select value="" open={valueSelectOpen} onOpenChange={(o) => { setValueSelectOpen(o); if (!o) cancelPending(); }} onValueChange={(v) => confirmFilter('trigger', v)}>
                  <SelectTrigger className="h-8 text-xs w-[150px]">
                    <SelectValue placeholder="Select trigger…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="cron">Cron</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {pendingType === 'agent' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Agent:</span>
                <Select value="" open={valueSelectOpen} onOpenChange={(o) => { setValueSelectOpen(o); if (!o) cancelPending(); }} onValueChange={(v) => confirmFilter('agent', v)}>
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(pendingType === 'from' || pendingType === 'to') && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{pendingType === 'from' ? 'From:' : 'To:'}</span>
                <Input
                  type="date"
                  value={pendingValue}
                  onChange={(e) => setPendingValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pendingValue) confirmFilter(pendingType, pendingValue); if (e.key === 'Escape') cancelPending(); }}
                  min={pendingType === 'to' ? (activeFilters.find(f => f.key === 'from')?.value ?? undefined) : undefined}
                  max={pendingType === 'from' ? (activeFilters.find(f => f.key === 'to')?.value ?? undefined) : undefined}
                  className="h-8 text-xs w-[136px]"
                  autoFocus
                />
                <Button size="sm" className="h-8 px-3 text-xs" onClick={() => confirmFilter(pendingType, pendingValue)} disabled={!pendingValue}>Add</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={cancelPending}>Cancel</Button>
              </div>
            )}

            {/* Active filter pills */}
            {activeFilters.map(f => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                {f.label}
                <button onClick={() => removeFilter(f.key)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}

            {/* Clear all */}
            {hasFilters && !pendingType && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={clearFilters}>Clear all</Button>
            )}
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <History className="mx-auto h-10 w-10 mb-3 opacity-20" />
                <p className="text-sm">No runs found{hasFilters ? ' matching the current filters' : ''}.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* ── Active Runs ── */}
              {activeRuns.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-blue-500" />
                      <CardTitle className="text-base">Active Runs</CardTitle>
                      <Badge variant="outline" className="gap-1.5 border-blue-300 text-blue-600 dark:text-blue-400 text-xs">
                        <ExecutingDots />{activeRuns.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {tableHeader}
                    <RunsTable
                      runs={activeRuns}
                      onOpenBrowser={(run) => setBrowserHITL({ runId: run.id, agentId: run.agent_id, agentName: run.agent_name })}
                      onAbort={handleAbort}
                      abortingRunId={abortingRunId}
                    />
                  </CardContent>
                </Card>
              )}

              {/* ── Run History ── */}
              {historyRuns.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Run History</CardTitle>
                        <CardDescription>
                          {total.toLocaleString()} run{total !== 1 ? 's' : ''} found
                        </CardDescription>
                      </div>
                      {totalPages > 1 && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          Page {page} of {totalPages}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {tableHeader}
                    <RunsTable
                      runs={historyRuns}
                      onOpenBrowser={(run) => setBrowserHITL({ runId: run.id, agentId: run.agent_id, agentName: run.agent_name })}
                    />

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between border-t px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline" size="sm"
                            disabled={page <= 1}
                            onClick={() => goToPage(page - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let pg: number;
                            if (totalPages <= 7) {
                              pg = i + 1;
                            } else if (page <= 4) {
                              pg = i + 1;
                              if (i === 6) pg = totalPages;
                              if (i === 5) pg = -1;
                            } else if (page >= totalPages - 3) {
                              pg = i === 0 ? 1 : i === 1 ? -1 : totalPages - (6 - i);
                            } else {
                              const map = [1, -1, page - 1, page, page + 1, -2, totalPages];
                              pg = map[i]!;
                            }
                            if (pg < 0) return (
                              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-sm">…</span>
                            );
                            return (
                              <Button
                                key={pg}
                                variant={pg === page ? 'default' : 'outline'}
                                size="sm"
                                className="w-8 h-8 p-0 text-xs"
                                onClick={() => goToPage(pg)}
                              >
                                {pg}
                              </Button>
                            );
                          })}
                          <Button
                            variant="outline" size="sm"
                            disabled={page >= totalPages}
                            onClick={() => goToPage(page + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Edge case: all results are active, no history on this page */}
              {historyRuns.length === 0 && activeRuns.length > 0 && totalPages > 1 && (
                <p className="text-xs text-center text-muted-foreground pb-2">
                  All results on this page are active runs. Navigate pages to see history.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* Browser HITL dialog */}
      {browserHITL && (
        <BrowserHITLDialog
          open={!!browserHITL}
          onOpenChange={(o) => { if (!o) { setBrowserHITL(null); loadHistory(); } }}
          runId={browserHITL.runId}
          agentId={browserHITL.agentId}
          agentName={browserHITL.agentName}
        />
      )}

    </div>
  );
}
