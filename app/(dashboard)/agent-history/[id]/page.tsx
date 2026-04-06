'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import agentClient from '@/lib/api/agent-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Monitor,
  Clock,
  Search,
  Wrench,
  FileText,
  AlertCircle,
  Terminal,
  Zap,
  Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = 'text' | 'tool_use' | 'tool_result' | 'result' | 'init' | 'error';

interface StepRow {
  id: string;
  sequence: number;
  step_type: StepType;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  action_log_id: string | null;
}

interface StepsResponse {
  steps: StepRow[];
  total: number;
  page: number;
  total_pages: number;
}

interface ExecutionSummary {
  id: string;
  agent_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface ActionRow {
  id: string;
  action_name: string | null;
  action_type: 'agent' | 'approval' | 'login';
  status: string;
  started_at: string;
  output: string | null;
  error_message: string | null;
  approval_instructions: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_TYPES: Array<{ value: StepType | 'all'; label: string }> = [
  { value: 'all',         label: 'All' },
  { value: 'text',        label: 'Text' },
  { value: 'tool_use',    label: 'Tool Use' },
  { value: 'tool_result', label: 'Tool Result' },
  { value: 'result',      label: 'Result' },
  { value: 'error',       label: 'Error' },
  { value: 'init',        label: 'Init' },
];

const ACTION_TYPE_LABEL: Record<string, string> = {
  agent:    'Agent',
  approval: 'Approval',
  login:    'Login',
};

const ACTION_TYPE_CLS: Record<string, string> = {
  agent:    'border-blue-200 text-blue-600 dark:text-blue-400',
  approval: 'border-amber-200 text-amber-600 dark:text-amber-400',
  login:    'border-sky-200 text-sky-600 dark:text-sky-400',
};

const STEPS_PER_PAGE = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── Status badges ────────────────────────────────────────────────────────────

function StepTypeBadge({ type }: { type: StepType }) {
  const configs: Record<StepType, { label: string; className: string; icon: React.ReactNode }> = {
    tool_use:    { label: 'Tool Use',    className: 'border-blue-400 text-blue-600 dark:text-blue-400',     icon: <Wrench className="h-3 w-3" /> },
    tool_result: { label: 'Tool Result', className: 'border-slate-400 text-slate-600 dark:text-slate-400', icon: <Terminal className="h-3 w-3" /> },
    text:        { label: 'Text',        className: 'border-green-400 text-green-600 dark:text-green-400',  icon: <FileText className="h-3 w-3" /> },
    result:      { label: 'Result',      className: 'border-violet-400 text-violet-600 dark:text-violet-400', icon: <Zap className="h-3 w-3" /> },
    error:       { label: 'Error',       className: 'border-red-400 text-red-600 dark:text-red-400',        icon: <AlertCircle className="h-3 w-3" /> },
    init:        { label: 'Init',        className: 'border-gray-400 text-gray-500 dark:text-gray-400',    icon: <Clock className="h-3 w-3" /> },
  };
  const config = configs[type] ?? { label: type, className: 'border-gray-400 text-gray-500', icon: null };
  return (
    <Badge variant="outline" className={cn('gap-1 text-xs shrink-0', config.className)}>
      {config.icon}{config.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge variant="outline" className="gap-1.5 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
  if (status === 'failed')    return <Badge variant="outline" className="gap-1.5 border-red-400 text-red-600 dark:text-red-400"><XCircle className="h-3 w-3" />Failed</Badge>;
  if (status === 'aborted')   return <Badge variant="outline" className="gap-1.5 border-red-400 text-red-600 dark:text-red-400"><XCircle className="h-3 w-3" />Aborted</Badge>;
  if (status === 'denied')    return <Badge variant="outline" className="gap-1.5 border-red-400 text-red-600 dark:text-red-400"><XCircle className="h-3 w-3" />Denied</Badge>;
  if (status === 'approved')  return <Badge variant="outline" className="gap-1.5 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
  if (status === 'executing') return <Badge variant="outline" className="gap-1.5 border-blue-300 text-blue-600 dark:text-blue-400"><Loader2 className="h-3 w-3 animate-spin" />Executing</Badge>;
  if (status === 'awaiting_approval') return <Badge variant="outline" className="gap-1.5 border-violet-400 text-violet-600 dark:text-violet-400"><PauseCircle className="h-3 w-3" />Awaiting Approval</Badge>;
  if (status === 'awaiting_login')    return <Badge variant="outline" className="gap-1.5 border-amber-400 text-amber-600 dark:text-amber-400"><Monitor className="h-3 w-3" />Awaiting Login</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepItem({ step }: { step: StepRow }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 py-3 border-b last:border-b-0">
      <div className="flex items-start gap-2.5 flex-wrap">
        <span className="inline-flex items-center justify-center min-w-[2rem] h-5 rounded bg-muted text-muted-foreground text-xs font-mono font-medium shrink-0">
          #{step.sequence}
        </span>
        <StepTypeBadge type={step.step_type} />
        {step.step_type === 'tool_use' && step.tool_name && (
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300 font-mono">{step.tool_name}</span>
        )}
        {step.step_type === 'tool_result' && step.tool_name && (
          <span className="text-xs text-muted-foreground font-mono">{step.tool_name}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground shrink-0 font-mono">{formatDateShort(step.created_at)}</span>
      </div>

      {step.step_type === 'tool_use' && step.tool_input != null && (
        <div className="ml-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? 'Hide' : 'Show'} input
          </button>
          {expanded && (
            <pre className="mt-1.5 text-xs bg-muted rounded p-3 overflow-auto max-h-64 font-mono leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(step.tool_input, null, 2)}
            </pre>
          )}
        </div>
      )}

      {step.step_type !== 'tool_use' && step.content && (
        <pre className={cn(
          'text-xs rounded p-3 overflow-auto max-h-48 font-mono leading-relaxed whitespace-pre-wrap break-all',
          step.step_type === 'error' ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300' : 'bg-muted'
        )}>
          {step.content}
        </pre>
      )}
    </div>
  );
}

// ─── Action panel (nav bar + details, one connected card) ─────────────────────

function getStatusDot(status: string, actionType: string): string {
  const s = (actionType === 'login' && status === 'awaiting_approval') ? 'awaiting_login' : status;
  if (s === 'completed' || s === 'approved') return 'bg-green-500';
  if (s === 'failed' || s === 'denied' || s === 'aborted') return 'bg-red-500';
  if (s === 'executing') return 'bg-blue-400 animate-pulse';
  if (s === 'awaiting_approval') return 'bg-violet-500';
  if (s === 'awaiting_login') return 'bg-amber-500';
  return 'bg-muted-foreground/30';
}

function ActionPanel({
  actions,
  selectedActionId,
  onSelect,
}: {
  actions: ActionRow[];
  selectedActionId: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedIndex = actions.findIndex((a) => a.id === selectedActionId);
  const selectedAction = actions[selectedIndex] ?? null;

  // Scroll selected tab into view horizontally (avoid scrollIntoView which moves the page)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || selectedIndex < 0) return;
    const tab = container.children[selectedIndex] as HTMLElement | undefined;
    if (!tab) return;
    const { offsetLeft, offsetWidth } = tab;
    const { scrollLeft, clientWidth } = container;
    if (offsetLeft < scrollLeft) {
      container.scrollTo({ left: offsetLeft, behavior: 'smooth' });
    } else if (offsetLeft + offsetWidth > scrollLeft + clientWidth) {
      container.scrollTo({ left: offsetLeft + offsetWidth - clientWidth, behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const displayStatus = selectedAction
    ? (selectedAction.action_type === 'login' && selectedAction.status === 'awaiting_approval'
        ? 'awaiting_login'
        : selectedAction.status)
    : null;

  return (
    <Card className="overflow-hidden">
      {/* ── Header bar: "Actions (N)" + prev/next nav ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Actions</span>
          <Badge variant="secondary" className="text-xs px-1.5 h-5 rounded-full">{actions.length}</Badge>
        </div>
        {actions.length > 1 && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => selectedIndex > 0 && onSelect(actions[selectedIndex - 1].id)}
              disabled={selectedIndex <= 0}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Previous action"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-1 min-w-[2.5rem] text-center">
              {selectedIndex + 1} / {actions.length}
            </span>
            <button
              onClick={() => selectedIndex < actions.length - 1 && onSelect(actions[selectedIndex + 1].id)}
              disabled={selectedIndex >= actions.length - 1}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              aria-label="Next action"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable tab strip ── */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto border-b"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {actions.map((a, i) => {
          const isSelected = a.id === selectedActionId;
          const label = a.action_name ?? ACTION_TYPE_LABEL[a.action_type] ?? a.action_type;
          const typeIcon = a.action_type === 'approval'
            ? <PauseCircle className="h-3 w-3 shrink-0" />
            : a.action_type === 'login'
            ? <Monitor className="h-3 w-3 shrink-0" />
            : <Zap className="h-3 w-3 shrink-0" />;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={cn(
                'relative flex flex-col gap-1 px-4 py-3 text-left whitespace-nowrap shrink-0 border-r last:border-r-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary min-w-[120px]',
                isSelected
                  ? 'bg-background'
                  : 'bg-muted/10 hover:bg-muted/40'
              )}
            >
              {/* Top row: step number + name */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">{i + 1}</span>
                <span className={cn('text-sm leading-none', isSelected ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                  {label}
                </span>
              </div>
              {/* Bottom row: type icon + label + status dot */}
              <div className="flex items-center gap-1.5 pl-3.5">
                <span className={cn('flex items-center gap-1 text-[11px]', isSelected ? 'text-muted-foreground' : 'text-muted-foreground/60')}>
                  {typeIcon}
                  {ACTION_TYPE_LABEL[a.action_type] ?? a.action_type}
                </span>
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', getStatusDot(a.status, a.action_type))} />
              </div>
              {isSelected && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* ── Action details ── */}
      {selectedAction ? (
        <CardContent className="py-4 space-y-3 min-h-[160px]">
          {/* Meta row */}
          <div className="flex flex-wrap gap-4 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Type</p>
              <Badge variant="outline" className={cn('text-xs', ACTION_TYPE_CLS[selectedAction.action_type] ?? '')}>
                {ACTION_TYPE_LABEL[selectedAction.action_type] ?? selectedAction.action_type}
              </Badge>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Status</p>
              {displayStatus && <StatusBadge status={displayStatus} />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Started</p>
              <span className="text-sm">{formatDate(selectedAction.started_at)}</span>
            </div>
          </div>

          {selectedAction.approval_instructions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Instructions</p>
              <p className="text-sm leading-relaxed">{selectedAction.approval_instructions}</p>
            </div>
          )}

          {selectedAction.error_message && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1.5">Error</p>
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{selectedAction.error_message}</p>
              </div>
            </div>
          )}

          {selectedAction.output && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => { navigator.clipboard.writeText(selectedAction.output!); toast.success('Copied'); }}
                >
                  <Copy className="mr-1 h-3 w-3" />Copy
                </Button>
              </div>
              <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words leading-relaxed overflow-auto max-h-48">
                {selectedAction.output}
              </pre>
            </div>
          )}
        </CardContent>
      ) : (
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Select an action above.
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExecutionStepsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { selectedOrgId } = useAdminViewStore();

  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingActions, setLoadingActions] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(true);

  const initialActionId = useRef(searchParams.get('action'));
  const [selectedActionId, setSelectedActionId] = useState<string | null>(initialActionId.current);

  const [selectedType, setSelectedType] = useState<StepType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoadingSummary(true);
    try {
      const { data } = await agentClient.get<ExecutionSummary>(`/api/admin/${selectedOrgId}/executions/${id}`);
      setSummary(data);
    } catch { toast.error('Failed to load execution summary'); }
    finally { setLoadingSummary(false); }
  }, [selectedOrgId, id]);

  const fetchActions = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoadingActions(true);
    try {
      const { data } = await agentClient.get<{ actions: ActionRow[] }>(`/api/admin/${selectedOrgId}/executions/${id}/actions`);
      setActions(data.actions);
      if (!initialActionId.current && data.actions.length > 0) {
        setSelectedActionId(data.actions[0].id);
      }
    } catch { toast.error('Failed to load actions'); }
    finally { setLoadingActions(false); }
  }, [selectedOrgId, id]);

  const fetchSteps = useCallback(async () => {
    if (!selectedOrgId || !id || !selectedActionId) return;
    setLoadingSteps(true);
    try {
      const qp = new URLSearchParams({ page: String(page), limit: String(STEPS_PER_PAGE) });
      if (selectedType !== 'all') qp.set('step_type', selectedType);
      qp.set('action_log_id', selectedActionId);
      const { data } = await agentClient.get<StepsResponse>(`/api/admin/${selectedOrgId}/executions/${id}/steps?${qp}`);
      setSteps(data.steps);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch { toast.error('Failed to load execution steps'); }
    finally { setLoadingSteps(false); }
  }, [selectedOrgId, id, selectedActionId, page, selectedType]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchActions(); }, [fetchActions]);
  useEffect(() => { fetchSteps(); }, [fetchSteps]);
  useEffect(() => { setPage(1); setSearch(''); }, [selectedActionId, selectedType]);

  const selectAction = useCallback((actionId: string) => {
    setSelectedActionId(actionId);
    const url = new URL(window.location.href);
    url.searchParams.set('action', actionId);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const filteredSteps = steps.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.content?.toLowerCase().includes(q) ?? false) || (s.tool_name?.toLowerCase().includes(q) ?? false);
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 p-6 max-w-5xl mx-auto">

      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="gap-1.5 -ml-2 w-fit text-muted-foreground">
        <Link href="/agent-history"><ArrowLeft className="h-4 w-4" />Back to history</Link>
      </Button>

      {/* Execution header */}
      {loadingSummary ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading&hellip;</div>
      ) : summary ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold tracking-tight">{summary.agent_name}</h1>
            <StatusBadge status={summary.status} />
            <span className="text-xs font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
              Run #{id.slice(-4).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Started {formatDate(summary.started_at)}</span>
            {summary.completed_at && <><span className="opacity-40">&bull;</span><span>Completed {formatDate(summary.completed_at)}</span></>}
          </div>
          {summary.error_message && (
            <p className="text-sm text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-950/30 rounded px-3 py-2 mt-1">
              {summary.error_message}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Execution not found.</p>
      )}

      {/* Action panel */}
      {loadingActions ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading actions&hellip;</div>
      ) : actions.length > 0 ? (
        <ActionPanel actions={actions} selectedActionId={selectedActionId} onSelect={selectAction} />
      ) : (
        !loadingActions && <p className="text-sm text-muted-foreground italic">No actions recorded for this execution.</p>
      )}

      {/* Steps */}
      {selectedActionId && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <CardTitle className="text-sm font-medium">
                  AI Agent Steps
                  {!loadingSteps && total > 0 && (
                    <span className="ml-2 text-muted-foreground font-normal">({total.toLocaleString()})</span>
                  )}
                </CardTitle>
                {/* Type filter */}
                <div className="flex items-center gap-1 flex-wrap">
                  {STEP_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setSelectedType(value as StepType | 'all')}
                      className={cn(
                        'px-2 py-0.5 rounded text-xs border transition-colors',
                        selectedType === value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search content or tool name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <CardContent className="px-4 pt-0">
              {loadingSteps ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm">Loading steps&hellip;</span>
                </div>
              ) : filteredSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                  <Terminal className="h-7 w-7 opacity-30" />
                  <p className="text-sm">No steps found.</p>
                  {(selectedType !== 'all' || search) && <p className="text-xs">Try removing filters.</p>}
                </div>
              ) : (
                filteredSteps.map((step) => <StepItem key={step.id} step={step} />)
              )}
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && !loadingSteps && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {totalPages} &middot; {total} step{total !== 1 ? 's' : ''}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="gap-1.5">
                  <ChevronLeft className="h-4 w-4" />Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="gap-1.5">
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
