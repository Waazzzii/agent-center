'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAgents,
  getExecutionHistory,
  type Agent,
  type ExecutionRun,
  type ExecutionAction,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Webhook,
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Loader2,
  AlertCircle,
  Filter,
  X,
  History,
  Copy,
  Eye,
  Monitor,
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
  if (status === 'executing') return (
    <Badge variant="outline" className="gap-2 border-blue-300 text-blue-600 dark:text-blue-400">
      <ExecutingDots />Executing
    </Badge>
  );
  if (status === 'awaiting_approval') return (
    <Badge variant="outline" className="gap-1.5 border-slate-300 text-slate-600 dark:text-slate-400">
      <PauseCircle className="h-3 w-3" />Awaiting Approval
    </Badge>
  );
  return <Badge variant="secondary">{status}</Badge>;
}

function ActionStatusBadge({ status }: { status: string }) {
  if (status === 'completed') return (
    <Badge variant="outline" className="gap-1 text-xs border-green-500 text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" />Completed
    </Badge>
  );
  if (status === 'failed') return (
    <Badge variant="outline" className="gap-1 text-xs border-red-400 text-red-600 dark:text-red-400">
      <XCircle className="h-3 w-3" />Failed
    </Badge>
  );
  if (status === 'awaiting_approval') return (
    <Badge variant="outline" className="gap-1.5 text-xs border-slate-300 text-slate-600 dark:text-slate-400">
      <PauseCircle className="h-3 w-3" />Awaiting Approval
    </Badge>
  );
  if (status === 'approved') return (
    <Badge variant="outline" className="gap-1 text-xs border-green-500 text-green-600 dark:text-green-400">
      <CheckCircle2 className="h-3 w-3" />Approved
    </Badge>
  );
  if (status === 'denied') return (
    <Badge variant="outline" className="gap-1 text-xs border-red-400 text-red-600 dark:text-red-400">
      <XCircle className="h-3 w-3" />Denied
    </Badge>
  );
  if (status === 'executing') return (
    <Badge variant="outline" className="gap-1.5 text-xs border-blue-300 text-blue-600 dark:text-blue-400">
      <ExecutingDots />Executing
    </Badge>
  );
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
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

// ─── Expanded Actions Panel ───────────────────────────────────

const RUN_COLS = 'grid-cols-[1fr_140px_120px_90px_80px_160px_32px]';
const ACTION_COLS = 'grid-cols-[1fr_140px_160px]';

const ACTION_TYPE_LABEL: Record<string, string> = {
  agent: 'Agent Step',
  approval: 'Approval',
};

function ActionsPanel({ actions }: { actions: ExecutionAction[] }) {
  if (actions.length === 0) return <p className="text-xs text-muted-foreground py-2 px-4">No action steps recorded.</p>;

  return (
    <div className="border-t bg-muted/30">
      {/* Column headers — desktop only */}
      <div className={`hidden md:grid ${ACTION_COLS} gap-3 px-4 py-2 border-b bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
        <span>Step</span>
        <span>Status</span>
        <span>Started</span>
      </div>

      <div className="divide-y">
        {actions.map((a, i) => (
          <div key={a.id}>
            {/* Desktop row */}
            <div className={`hidden md:grid ${ACTION_COLS} gap-3 items-center px-4 py-2.5`}>
              <div className="min-w-0 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{i + 1}</span>
                <span className="font-medium text-sm truncate">{ACTION_TYPE_LABEL[a.action_type] ?? a.action_type}</span>
              </div>
              <ActionStatusBadge status={a.status} />
              <span className="text-xs text-muted-foreground">{a.started_at ? formatDate(a.started_at) : '—'}</span>
            </div>

            {/* Mobile row */}
            <div className="md:hidden px-4 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">{i + 1}</span>
                <span className="font-medium text-sm truncate flex-1">{ACTION_TYPE_LABEL[a.action_type] ?? a.action_type}</span>
                <ActionStatusBadge status={a.status} />
              </div>
              {a.started_at && (
                <div className="pl-7 text-xs text-muted-foreground">{formatDate(a.started_at)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

const PAGE_SIZE = 15;

export default function AgentHistoryPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const searchParams = useSearchParams();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<ExecutionRun[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [browserHITL, setBrowserHITL] = useState<{ runId: string; agentId: string; agentName: string } | null>(null);

  // Pill-based filters
  type FilterKey = 'agent' | 'status' | 'trigger' | 'from' | 'to';
  interface ActiveFilter { key: FilterKey; value: string; label: string }

  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [pendingType, setPendingType] = useState<FilterKey | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [valueSelectOpen, setValueSelectOpen] = useState(false);
  const initialAgentId = useRef(searchParams.get('agent_id'));

  const hasFilters = activeFilters.length > 0;

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

  // Seed agent filter from URL param once agents list is loaded
  useEffect(() => {
    if (!initialAgentId.current || agents.length === 0) return;
    const id = initialAgentId.current;
    const found = agents.find(a => a.id === id);
    if (found) setActiveFilters([{ key: 'agent', value: id, label: `Agent: ${found.name}` }]);
    initialAgentId.current = null;
  }, [agents]);

  const cancelPending = () => { setPendingType(null); setPendingValue(''); setValueSelectOpen(false); };

  const confirmFilter = (type: FilterKey, value: string) => {
    const statusLabels: Record<string, string> = { completed: 'Completed', failed: 'Failed', executing: 'Executing', awaiting_approval: 'Awaiting Approval' };
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
    setExpandedRows(new Set());
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Agent History</h1>
          <p className="text-muted-foreground">Execution logs for all agent runs</p>
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
                  <SelectTrigger className="h-8 text-xs w-[170px]">
                    <SelectValue placeholder="Select status…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="executing">Executing</SelectItem>
                    <SelectItem value="awaiting_approval">Awaiting Approval</SelectItem>
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

          {/* Results */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Execution Runs</CardTitle>
                  <CardDescription>
                    {loading ? 'Loading…' : `${total.toLocaleString()} run${total !== 1 ? 's' : ''} found`}
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
                <div>
                  {/* Table header */}
                  <div className={`hidden md:grid ${RUN_COLS} gap-3 px-4 py-2 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                    <span>Agent</span>
                    <span>Status</span>
                    <span>Trigger</span>
                    <span>Steps</span>
                    <span>Duration</span>
                    <span>Started</span>
                    <span />
                  </div>

                  {/* Rows */}
                  <div className="divide-y">
                    {runs.map((run) => {
                      const isExpanded = expandedRows.has(run.id);
                      const completedSteps = run.action_logs.filter((a) => a.status === 'completed' || a.status === 'approved').length;
                      const durationMs = run.started_at && run.completed_at
                        ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
                        : null;
                      return (
                        <div key={run.id}>
                          <button
                            className="w-full text-left hover:bg-muted/30 transition-colors"
                            onClick={() => toggleRow(run.id)}
                          >
                            {/* Mobile layout */}
                            <div className="md:hidden px-4 py-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm truncate">{run.agent_name}</span>
                                <StatusBadge status={run.status} />
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <TriggerBadge type={run.trigger_type} />
                                <span className="text-xs text-muted-foreground">{completedSteps}/{run.action_logs.length} steps</span>
                                <span className="text-xs text-muted-foreground">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                              </div>
                            </div>

                            {/* Desktop layout */}
                            <div className={`hidden md:grid ${RUN_COLS} gap-3 items-center px-4 py-3`}>
                              <div className="min-w-0">
                                <span className="font-medium text-sm truncate block">{run.agent_name}</span>
                              </div>
                              <StatusBadge status={run.status} />
                              <TriggerBadge type={run.trigger_type} />
                              <span className="text-sm text-muted-foreground">{completedSteps}/{run.action_logs.length}</span>
                              <span className="text-sm text-muted-foreground tabular-nums">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                              <span className="text-xs text-muted-foreground">{formatDate(run.started_at)}</span>
                              <div className="flex items-center gap-1">
                                {run.status === 'executing' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    title="Open live browser view"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBrowserHITL({ runId: run.id, agentId: run.agent_id, agentName: run.agent_name });
                                    }}
                                  >
                                    <Monitor className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                              </div>
                            </div>
                          </button>

                          {/* Expanded action steps */}
                          {isExpanded && <ActionsPanel actions={run.action_logs} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && !loading && (
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
                    {/* Page number pills */}
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      // Show pages around current page
                      let pg: number;
                      if (totalPages <= 7) {
                        pg = i + 1;
                      } else if (page <= 4) {
                        pg = i + 1;
                        if (i === 6) pg = totalPages;
                        if (i === 5) pg = -1; // ellipsis
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
        </>
      )}

      {/* Browser HITL dialog — opens when a user clicks the monitor icon on an executing run */}
      {browserHITL && (
        <BrowserHITLDialog
          open={!!browserHITL}
          onOpenChange={(o) => { if (!o) setBrowserHITL(null); }}
          runId={browserHITL.runId}
          agentId={browserHITL.agentId}
          agentName={browserHITL.agentName}
        />
      )}
    </div>
  );
}

