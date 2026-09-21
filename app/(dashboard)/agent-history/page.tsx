'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAgents,
  getExecutionHistory,
  abortBrowserRun,
  isInertLoginRow,
  type Agent,
  type ExecutionRun,
} from '@/lib/api/agents';
import { tagFilterParams } from '@/lib/api/tags';
import { FilterPicker } from '@/components/execution/FilterPicker';
import { ActionProgress } from '@/components/execution/ActionProgress';
import { TimeRangePicker } from '@/components/execution/TimeRangePicker';
import { TokenUsage } from '@/components/execution/TokenUsage';
import { useTags } from '@/lib/hooks/use-tags';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
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
  SquareArrowOutUpRight,
  CircleStop,
  GitBranch,
  Tag as TagIcon, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';

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
  // 'completed' used to mean "finished, however it went" and swept failures in
  // with successes — so the one number people check to see if anything broke
  // was the number that hid it. The two are now disjoint.
  completed: ['completed'],
  // Aborted sits here rather than with completed: an operator pulled the cord,
  // so the work did not happen. It is not a success and should not inflate one.
  failed:    ['failed', 'aborted'],
};

type StatusGroup = 'active' | 'queued' | 'completed' | 'failed';

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

/** Compact "started at" for the run feed table. Skips the year for this
 *  year's runs so the column stays narrow ("Nov 11, 2:34 PM"); year
 *  appears when crossing into a prior year so older rows aren't
 *  ambiguous. */
function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric', minute: '2-digit',
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
    <Badge variant="success" className="gap-1.5">
      <CheckCircle2 className="h-3 w-3" />Completed
    </Badge>
  );
  if (status === 'failed') return (
    <Badge variant="danger" className="gap-1.5">
      <XCircle className="h-3 w-3" />Failed
    </Badge>
  );
  if (status === 'aborted') return (
    <Badge variant="danger" className="gap-1.5">
      <XCircle className="h-3 w-3" />Aborted
    </Badge>
  );
  if (status === 'executing') return (
    <Badge variant="info" className="gap-2">
      <ExecutingDots />Executing
    </Badge>
  );
  if (status === 'awaiting_approval') return (
    <Badge variant="brand" className="gap-1.5">
      <PauseCircle className="h-3 w-3" />Awaiting Approval
    </Badge>
  );
  if (status === 'awaiting_login') return (
    <Badge variant="warning" className="gap-1.5">
      <Monitor className="h-3 w-3" />Awaiting Login
    </Badge>
  );
  if (status === 'provisioning') return (
    <Badge variant="warning" className="gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin" />Starting
    </Badge>
  );
  if (status === 'queued') return (
    <Badge variant="warning" className="gap-1.5">
      <Clock className="h-3 w-3" />Queued
    </Badge>
  );
  return <Badge variant="neutral">{status}</Badge>;
}

function TriggerBadge({ type }: { type: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; variant: 'brand' | 'info' | 'neutral' }> = {
    webhook: { icon: <Webhook className="h-3 w-3" />, label: 'Webhook', variant: 'brand' },
    cron:    { icon: <Clock className="h-3 w-3" />,   label: 'Cron',    variant: 'info' },
    manual:  { icon: <Play className="h-3 w-3" />,    label: 'Manual',  variant: 'neutral' },
  };
  const def = map[type] ?? { icon: null, label: type, variant: 'neutral' as const };
  return (
    <Badge variant={def.variant} className="gap-1 text-xs">
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
  sortBy,
  sortDir,
  onSort,
}: {
  runs: ExecutionRun[];
  onOpenBrowser: (run: ExecutionRun) => void;
  onAbort?: (run: ExecutionRun) => void;
  abortingRunId?: string | null;
  sortBy: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const router = useRouter();

  /**
   * One column header, styled to match ResponsiveTable's <th> — the same
   * h-10, text-sm, font-medium, foreground colour and arrow affordances the
   * Routines table uses. This feed is a CSS grid rather than a <table>
   * (rows carry progress bars and inline actions a <td> grid cannot lay
   * out), so the styling is matched by hand; the class list is copied
   * deliberately rather than approximated.
   */
  const Th = ({ col, label, align = 'left' }: { col?: SortKey; label: string; align?: 'left' | 'right' }) => {
    if (!col) return <span />;
    const active = sortBy === col;
    return (
      <button
        type="button"
        onClick={() => onSort(col)}
        title={`Sort by ${label.toLowerCase()}`}
        className={cn(
          'flex items-center gap-1 select-none hover:text-foreground/80 transition-colors',
          align === 'right' && 'justify-end',
        )}
      >
        <span className="truncate">{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />}
      </button>
    );
  };
  return (
    <div>
      {/* Column headers */}
      <div className="hidden md:grid grid-cols-[1fr_140px_80px_130px_80px_118px_72px] items-center gap-2 h-10 px-3 text-sm font-medium text-foreground border-b">
        <Th col="agent" label="Agent" />
        {/* One column, not two. A run is either in flight — where the bar is
            the useful thing — or finished, where the outcome is. Showing both
            at once meant a completed run carried a 100% bar saying nothing. */}
        <Th col="status" label="Status" />
        <Th col="trigger" label="Trigger" />
        <Th col="started" label="Started" />
        <Th col="duration" label="Duration" align="right" />
        {/* Sorts on the TOTAL of both directions plus both cache buckets,
            which is the figure the cell renders. */}
        <Th col="tokens" label="Tokens" align="right" />
        <span />
      </div>

      {/* Rows */}
      <div className="divide-y divide-border/40">
        {runs.map((run) => {
          // Inert login rows are hidden here too, or the dot strip and the
          // n/total counter would disagree with the detail view they open.
          // The denominator drops by the same count: total_actions counts the
          // agent's definition, which still contains the login action.
          const allActions = run.action_logs ?? [];
          const actions = allActions.filter((a) => !isInertLoginRow(a));
          const hiddenLogins = allActions.length - actions.length;
          const totalActions = Math.max(0, (run.total_actions ?? allActions.length) - hiddenLogins);
          const displayStatus = run.display_status ?? run.status;
          const isRunning     = run.status === 'executing' || run.status === 'provisioning';
          const isAwaiting    = run.status === 'awaiting_approval';
          const durationMs =
            run.completed_at
              ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
              : isRunning || isAwaiting ? Date.now() - new Date(run.started_at).getTime() : null;
          // Per-run cost no longer surfaced in the history table — billing
          // lives on the Billing & Usage page, aggregated from the Anthropic
          // Cost API. Tokens stay as an in-context usage estimate.
          // Cache buckets included: tokens_input alone is the UNCACHED
          // remainder, so a run that burned 90K of cached prompt used to show
          // up here as "2.0K". See ExecutionRun.tokens_cache_read.
          const tokens = {
            fresh:      run.tokens_input ?? 0,
            cacheRead:  run.tokens_cache_read ?? 0,
            cacheWrite: run.tokens_cache_write ?? 0,
            output:     run.tokens_output ?? 0,
          };
          const childCount = run.child_count ?? 0;

          return (
            <div key={run.id} className="group/row cursor-pointer hover:bg-muted/30 transition-colors"
                 onClick={() => router.push(`/agent-history/${run.id}`)}>

              {/* Desktop: column layout */}
              <div className="hidden md:grid grid-cols-[1fr_140px_80px_130px_80px_118px_72px] gap-2 items-center px-3 py-2">
                {/* Agent */}
                <div className="flex items-center gap-2 min-w-0">
                  <StatusGlyph status={displayStatus} />
                  {run.depth > 0 && <GitBranch className="h-3 w-3 text-brand shrink-0" />}
                  <span className={cn('text-sm font-medium truncate', run.depth > 0 && 'text-brand')}>{run.agent_name}</span>
                  {childCount > 0 && (
                    <span className="text-[9px] text-brand shrink-0">{childCount} sub</span>
                  )}
                  {run.has_active_browser && <Monitor className="h-3 w-3 text-info shrink-0" />}
                </div>
                {/* Status AND progress, one column. While a run is moving, how
                    far along it is IS its status; once it stops, the outcome is.
                    Two columns meant every finished row carried a full bar that
                    only repeated what the badge already said. */}
                {isRunning
                  ? <ActionProgress actions={actions} total={totalActions} />
                  : <StatusBadge status={displayStatus} />}
                {/* Trigger */}
                <TriggerBadge type={run.trigger_type} />
                {/* Started — full timestamp on hover, compact display in
                    the column (year omitted for this year's runs so the
                    column stays narrow). */}
                <span
                  className="text-xs text-muted-foreground tabular-nums truncate"
                  title={formatDate(run.started_at)}
                >
                  {formatStartedAt(run.started_at)}
                </span>
                {/* Duration */}
                <span className="text-xs text-muted-foreground tabular-nums text-right">{durationMs != null ? formatDuration(durationMs) : '—'}</span>
                {/* Tokens */}
                <span
                  className="flex justify-end text-xs text-muted-foreground"
                  // Stop the row's click-through to the run: the tooltip is
                  // the point of hovering here.
                  onClick={(e) => e.stopPropagation()}
                >
                  <TokenUsage variant="inline" tokens={tokens} />
                </span>
                {/* Row actions: open the routine, and stop it if it is running.
                    One column, both revealed on hover.

                    They were two columns with a 36px gap between them, which
                    left a visible dead strip to the right of Tokens on every
                    row. And the stop control was an icon-xs ghost with a 12px
                    glyph at half opacity — the most consequential thing on the
                    row, rendered as the least visible. Stopping a live run
                    should not need aiming. */}
                <div
                  className="flex items-center justify-end gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {run.agent_id && (
                    <Link
                      href={`/agents/${run.agent_id}`}
                      title="Open this routine"
                      className="rounded-md p-1.5 text-muted-foreground/70 opacity-0 transition-all hover:bg-muted hover:text-brand focus-visible:opacity-100 group-hover/row:opacity-100"
                    >
                      <SquareArrowOutUpRight className="h-4 w-4" />
                    </Link>
                  )}
                  {onAbort && (ABORTABLE_STATUSES as readonly string[]).includes(run.status) && (
                    <button
                      type="button"
                      title="Stop this run"
                      aria-label="Stop this run"
                      disabled={abortingRunId === run.id}
                      onClick={() => onAbort(run)}
                      // Always visible while a run is abortable, unlike the
                      // link: a stop control you have to discover by hovering
                      // is no use when something is running away from you.
                      className="rounded-md p-1.5 text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      {abortingRunId === run.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <CircleStop className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile: stacked */}
              <div className="md:hidden px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <StatusGlyph status={displayStatus} />
                  <span className="font-medium text-sm truncate">{run.agent_name}</span>
                  {/* Straight to the routine that produced this run. Clicking the row
                      opens the EXECUTION, so this needs to be a separate target with
                      stopPropagation — the two destinations are both wanted and easy
                      to confuse. Reading a failed run and wanting to see the steps
                      that produced it is the common next move. */}
                  {run.agent_id && (
                    <Link
                      href={`/agents/${run.agent_id}`}
                      onClick={(ev) => ev.stopPropagation()}
                      title="Open this routine"
                      className="shrink-0 text-muted-foreground/60 hover:text-brand transition-colors"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
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
    executing:         { color: 'bg-info',      pulse: true,  char: '●' },
    provisioning:      { color: 'bg-text-dim',  pulse: true,  char: '●' },
    queued:            { color: 'bg-text-dim',  pulse: false, char: '●' },
    awaiting_approval: { color: 'bg-brand',     pulse: true,  char: '●' },
    awaiting_login:    { color: 'bg-warning',   pulse: true,  char: '●' },
    completed:         { color: 'bg-success',   pulse: false, char: '●' },
    failed:            { color: 'bg-danger',    pulse: false, char: '●' },
    aborted:           { color: 'bg-danger',    pulse: false, char: '●' },
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

function isGroupActive(group: StatusGroup, statuses: string[]): boolean {
  const gs = STATUS_GROUPS[group];
  return statuses.length === gs.length && gs.every(s => statuses.includes(s));
}

/**
 * Sortable columns. Keys must match the backend whitelist in
 * execution-history.service.js — an unknown key there falls back to the
 * default rather than erroring, so a mismatch shows up as "sorting does
 * nothing", not as a crash.
 *
 * Sorting is SERVER-side. Reordering the fifteen rows already on screen
 * would say "oldest first" while showing the newest page, which is worse
 * than not offering it.
 */
type SortKey = 'agent' | 'status' | 'trigger' | 'started' | 'duration' | 'tokens';
type SortDir = 'asc' | 'desc';

const SORT_KEYS: SortKey[] = ['agent', 'status', 'trigger', 'started', 'duration', 'tokens'];
const isSortKey = (v: string): v is SortKey => (SORT_KEYS as string[]).includes(v);

const DEFAULT_SORT: SortKey = 'started';
const DEFAULT_SORT_DIR: SortDir = 'desc';

/**
 * Which way a column sorts when first clicked.
 *
 * Text reads naturally A→Z, but time and magnitude do not: the useful first
 * look at "Started" or "Tokens" is the largest/newest, not the smallest.
 * This is the same default every console makes and it is worth the table.
 */
const FIRST_CLICK_DIR: Record<SortKey, SortDir> = {
  agent: 'asc', status: 'asc', trigger: 'asc',
  started: 'desc', duration: 'desc', tokens: 'desc',
};

/** N days ago as a plain yyyy-mm-dd, which is what from/to hold. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Time range, Cloud-Console style: its own control, separate from the
 * filters, and the ONLY way to set the window.
 *
 * The state behind it is just `fromFilter` / `toFilter`. There is no stored
 * preset and no 'custom' mode — picking "Last 30 days" sets a from-date and
 * nothing else, exactly as if it had been typed. The first cut of this kept
 * a `rangePreset` alongside the dates, and every consequence of that second
 * source of truth had to be papered over: pills that hid themselves, a
 * "Clear all" that skipped the range, a From filter that read blank while a
 * from-date was in force. All of it invisible on screen, which is what made
 * it surprising.
 *
 * The button's label is DERIVED from the dates each render, so it cannot
 * disagree with them. When they happen to match a preset it says so;
 * otherwise it shows the window it actually has.
 *
 * The honest cost of dropping the stored preset: these are absolute dates,
 * so the window does not follow you forward. Come back next week and the
 * button reads a date rather than "Last 30 days". It is on screen either way.
 */
const TIME_PRESETS = [
  { label: 'Last hour',     days: 0 },
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 90 days',  days: 90 },
];

// A first visit starts 30 days back rather than on all of history, which
// grows without bound. Applied only when NOTHING is stored for the org —
// once a view exists, even an empty one, it is the user's.
const DEFAULT_FROM_DAYS = 30;

/** What the button says. A pure function of the dates — never a stored mode. */
function timeRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Any time';
  if (from && !to) {
    const preset = TIME_PRESETS.find((p) => p.days > 0 && daysAgo(p.days) === from);
    if (preset) return preset.label;
    return `Since ${formatShortDate(from)}`;
  }
  if (!from && to) return `Up to ${formatShortDate(to)}`;
  return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

/**
 * Filter persistence.
 *
 * Two stores, deliberately, because they answer different questions:
 *
 *   URL     — survives a reload and makes a filtered view linkable. This is
 *             the one that matters day to day: the page reloads while you are
 *             watching a filtered subset and the view has to come back the
 *             same, not silently widen to everything.
 *   storage — survives LEAVING the page. Clicking Executions in the nav goes
 *             to a bare /agent-history with no query, so the URL alone cannot
 *             carry a view across navigation.
 *
 * The URL wins when it has anything, so a shared link always shows what the
 * sender saw rather than the recipient's last view. Storage is per-org: agent
 * ids are org-scoped and restoring one across a switch filters to nothing.
 *
 * `page` is deliberately NOT persisted. Coming back to page 7 of a list that
 * now has two pages is worse than coming back to the top.
 */
interface PersistedFilters {
  statuses: string[];
  trigger: string;
  agentId: string;
  from: string;
  to: string;
  tags: string[];
  sortBy: SortKey;
  sortDir: SortDir;
}

const EMPTY_FILTERS: PersistedFilters = {
  statuses: [], trigger: '', agentId: '', from: '', to: '', tags: [],
  sortBy: DEFAULT_SORT, sortDir: DEFAULT_SORT_DIR,
};

const filterStorageKey = (orgId: string) => `agent-history:filters:${orgId}`;

function filtersFromParams(sp: URLSearchParams): PersistedFilters | null {
  const list = (k: string) => (sp.get(k) ?? '').split(',').filter(Boolean);
  const f: PersistedFilters = {
    statuses: list('status'),
    trigger:  sp.get('trigger') ?? '',
    // agent_id is the long-standing deep-link param; keep the name.
    agentId:  sp.get('agent_id') ?? '',
    from:     sp.get('from') ?? '',
    to:       sp.get('to') ?? '',
    tags:     list('tags'),
    sortBy:   isSortKey(sp.get('sort') ?? '') ? (sp.get('sort') as SortKey) : DEFAULT_SORT,
    sortDir:  sp.get('dir') === 'asc' ? 'asc' : DEFAULT_SORT_DIR,
  };
  const any = f.statuses.length || f.trigger || f.agentId || f.from || f.to
    || f.tags.length || sp.get('sort');
  return any ? f : null;
}

function filtersToQuery(f: PersistedFilters): string {
  const sp = new URLSearchParams();
  if (f.statuses.length) sp.set('status', f.statuses.join(','));
  if (f.trigger)         sp.set('trigger', f.trigger);
  if (f.agentId)         sp.set('agent_id', f.agentId);
  if (f.from)            sp.set('from', f.from);
  if (f.to)              sp.set('to', f.to);
  if (f.tags.length)     sp.set('tags', f.tags.join(','));
  // Only pinned when it differs from the default, so a plain link stays plain.
  if (f.sortBy !== DEFAULT_SORT || f.sortDir !== DEFAULT_SORT_DIR) {
    sp.set('sort', f.sortBy);
    sp.set('dir', f.sortDir);
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

function readStoredFilters(orgId: string): PersistedFilters | null {
  // Storage can throw (private mode, blocked site data) and can hold anything
  // a previous version wrote, so treat every field as untrusted.
  try {
    const raw = window.localStorage.getItem(filterStorageKey(orgId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedFilters>;
    return {
      statuses: Array.isArray(p.statuses) ? p.statuses.filter((x) => typeof x === 'string') : [],
      trigger:  typeof p.trigger === 'string' ? p.trigger : '',
      agentId:  typeof p.agentId === 'string' ? p.agentId : '',
      from:     typeof p.from === 'string' ? p.from : '',
      to:       typeof p.to === 'string' ? p.to : '',
      tags:     Array.isArray(p.tags) ? p.tags.filter((x) => typeof x === 'string') : [],
      sortBy:   typeof p.sortBy === 'string' && isSortKey(p.sortBy) ? p.sortBy : DEFAULT_SORT,
      sortDir:  p.sortDir === 'asc' ? 'asc' : DEFAULT_SORT_DIR,
    };
  } catch { return null; }
}

function writeStoredFilters(orgId: string, f: PersistedFilters): void {
  // Always writes, including an all-empty view. The KEY's absence is the
  // signal that this org has never been looked at, which is what gates the
  // 30-day default — widening to "Any time" has to stick, not get re-seeded
  // on the next load.
  try {
    window.localStorage.setItem(filterStorageKey(orgId), JSON.stringify(f));
  } catch { /* storage unavailable — the URL still carries the view */ }
}

export default function AgentExecutionsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const permitted = useRequirePermission('agent_center_user');
  const router = useRouter();

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
  const [summaryFailed, setSummaryFailed]       = useState(0);

  // Multi-select filter state
  const [statusFilters, setStatusFilters]   = useState<string[]>([]);
  const [triggerFilter, setTriggerFilter]   = useState<string>('');
  const [agentFilter, setAgentFilter]       = useState<string>('');
  const [fromFilter, setFromFilter]         = useState<string>('');
  const [toFilter, setToFilter]             = useState<string>('');
  const [tagFilters, setTagFilters]         = useState<string[]>([]);
  const [sortBy, setSortBy]                 = useState<SortKey>(DEFAULT_SORT);
  const [sortDir, setSortDir]               = useState<SortDir>(DEFAULT_SORT_DIR);

  const { tags } = useTags(selectedOrgId);

  // Inline date input state

  // Two guards, and they are not redundant.
  //
  //   restoreStartedFor — a REF, set synchronously, so the restore runs once
  //     per org even if the effect is invoked twice (StrictMode, remounts).
  //   restoredOrg — STATE, set at the end of the restore, so the mirror
  //     effect below can tell whether the restored values have actually
  //     landed in state.
  //
  // A ref cannot do the second job. Effects run in declaration order within
  // one commit, so the mirror ran immediately after the restore with the ref
  // already set but the state still holding defaults — and replaced the URL
  // with the defaults, wiping the params it had just read. A shared link
  // applied its filters and then dropped them from the address bar.
  const restoreStartedFor = useRef<string | null>(null);
  const [restoredOrg, setRestoredOrg] = useState<string | null>(null);

  // The time range is its own control, not a filter, so it is not counted
  // here and "Clear all" does not touch it — the same split the Cloud
  // Console makes between a query and the window it runs over.
  const hasFilters = statusFilters.length > 0 || !!triggerFilter || !!agentFilter || tagFilters.length > 0;

  // ─── Load functions ─────────────────────────────────────────

  const loadHistory = useCallback(async (
    pg: number,
    opts?: {
      statuses?: string[];
      trigger?: string;
      agentId?: string;
      from?: string;
      to?: string;
      tags?: string[];
      sortBy?: SortKey;
      sortDir?: SortDir;
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
    const tagIds   = opts?.tags      !== undefined ? opts.tags      : tagFilters;
    const sBy      = opts?.sortBy    !== undefined ? opts.sortBy    : sortBy;
    const sDir     = opts?.sortDir   !== undefined ? opts.sortDir   : sortDir;

    try {
      if (!silent) setLoading(true);
      const params: Record<string, any> = { page: pg, limit: PAGE_SIZE };
      if (statuses.length > 0) params.status       = statuses;
      if (trigger)              params.trigger_type = trigger;
      if (agentId)              params.agent_id     = agentId;
      if (from)                 params.from         = new Date(from + 'T00:00:00').toISOString();
      if (to) { const d = new Date(to + 'T00:00:00'); d.setHours(23, 59, 59, 999); params.to = d.toISOString(); }
      Object.assign(params, tagFilterParams(tagIds));
      params.sort_by  = sBy;
      params.sort_dir = sDir;
      const data = await getExecutionHistory(selectedOrgId, params);
      setRuns(data.items ?? []);
      setTotal(data.total);
      setTotalPages(data.pages);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Failed to load history');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId, statusFilters, triggerFilter, agentFilter, fromFilter, toFilter, tagFilters, sortBy, sortDir]);

  /**
   * Counts for the four cards.
   *
   * SCOPED TO THE SAME DATE WINDOW as the table, because each card is a
   * filter button: clicking "Completed" applies that status to the list, and
   * a card that counted all of history would hand you a list whose total
   * disagreed with the number you just clicked. The window is passed
   * explicitly rather than read off state so the restore effect can count the
   * range it is about to apply, before setState has landed.
   */
  const loadSummary = useCallback(async (range?: { from: string; to: string }) => {
    if (!selectedOrgId) return;
    const from = range?.from !== undefined ? range.from : fromFilter;
    const to   = range?.to   !== undefined ? range.to   : toFilter;
    const win: Record<string, string> = {};
    if (from) win.from = new Date(from + 'T00:00:00').toISOString();
    if (to)   { const d = new Date(to + 'T00:00:00'); d.setHours(23, 59, 59, 999); win.to = d.toISOString(); }
    const [execRes, approvalRes, provisionRes, queuedRes, completedRes, failedRes, abortedRes] =
      await Promise.allSettled([
        getExecutionHistory(selectedOrgId, { ...win, status: 'executing',         limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'awaiting_approval', limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'provisioning',      limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'queued',            limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'completed',         limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'failed',            limit: 1 }),
        getExecutionHistory(selectedOrgId, { ...win, status: 'aborted',           limit: 1 }),
      ]);
    const total = (r: PromiseSettledResult<{ total: number }>) =>
      r.status === 'fulfilled' ? r.value.total : 0;
    setSummaryActive(total(execRes) + total(approvalRes) + total(provisionRes));
    if (queuedRes.status    === 'fulfilled') setSummaryQueued(queuedRes.value.total);
    if (completedRes.status === 'fulfilled') setSummaryCompleted(completedRes.value.total);
    // Mirrors the 'failed' group: aborted counts as "did not succeed".
    setSummaryFailed(total(failedRes) + total(abortedRes));
  }, [selectedOrgId, fromFilter, toFilter]);

  // ─── Filter helpers ──────────────────────────────────────────

  const toggleStatus = (status: string, checked: boolean) => {
    const next = checked ? [...statusFilters, status] : statusFilters.filter(s => s !== status);
    setStatusFilters(next);
    setPage(1);
    loadHistory(1, { statuses: next, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: toFilter });
  };

  const applyGroupFilter = (group: StatusGroup) => {
    const statuses = STATUS_GROUPS[group];
    setStatusFilters(statuses);
    setPage(1);
    loadHistory(1, { statuses, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: toFilter });
  };


  const toggleTag = (tagId: string, checked: boolean) => {
    const next = checked ? [...tagFilters, tagId] : tagFilters.filter((t) => t !== tagId);
    setTagFilters(next);
    setPage(1);
    loadHistory(1, { statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter, from: fromFilter, to: toFilter, tags: next });
  };

  /**
   * Apply one filter field. '' clears it.
   *
   * Every field funnels through here so the reload is written once — the old
   * bar repeated the same six-argument loadHistory call in each dropdown's
   * handler, and they drifted (the tag menu forgot to pass tags on one path).
   *
   * status and tag are stored as arrays because the summary cards apply named
   * groups of statuses; this sets exactly one, or none.
   */
  const applyFilter = (key: string, value: string) => {
    const next = {
      statuses: statusFilters,
      trigger:  triggerFilter,
      agentId:  agentFilter,
      from:     fromFilter,
      to:       toFilter,
      tags:     tagFilters,
    };
    if (key === 'status')  { next.statuses = value ? [value] : []; setStatusFilters(next.statuses); }
    if (key === 'trigger') { next.trigger  = value; setTriggerFilter(value); }
    if (key === 'agent')   { next.agentId  = value; setAgentFilter(value); }
    if (key === 'tag')     { next.tags     = value ? [value] : []; setTagFilters(next.tags); }
    // Ordering guard, kept from the old date buttons: a From after the To
    // silently returns nothing, which reads as "no runs" rather than as a
    // bad range. Refuse instead of querying.
    setPage(1);
    loadHistory(1, next);
  };

  /**
   * Click a column header.
   *
   * First click on a new column uses that column's natural direction; a
   * second click on the SAME column flips it. Sorting does not touch the
   * cards — it reorders the window, it does not change what is in it.
   */
  const toggleSort = (key: SortKey) => {
    const dir: SortDir = key === sortBy
      ? (sortDir === 'asc' ? 'desc' : 'asc')
      : FIRST_CLICK_DIR[key];
    setSortBy(key);
    setSortDir(dir);
    setPage(1);
    loadHistory(1, { sortBy: key, sortDir: dir });
  };

  /**
   * Set the window. Both dates at once, because they are one control.
   *
   * '' on either side means unbounded, so { from: '', to: '' } is "any time".
   */
  const applyTimeRange = (from: string, to: string) => {
    if (from && to && from > to) { toast.error('Start date cannot be after end date'); return; }
    setFromFilter(from);
    setToFilter(to);
    setPage(1);
    loadHistory(1, {
      statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter,
      from, to, tags: tagFilters,
    });
    // The cards count inside the window, so moving it has to recount them.
    loadSummary({ from, to });
  };

  // Clears the FILTERS. The time range is a separate control and is left
  // exactly where it is.
  const clearFilters = () => {
    setStatusFilters([]);
    setTriggerFilter('');
    setAgentFilter('');
    setTagFilters([]);
    setPage(1);
    loadHistory(1, { statuses: [], trigger: '', agentId: '', from: fromFilter, to: toFilter, tags: [] });
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

  // Restore the view, THEN load with it — one load, not a default load
  // followed by a corrective one, which would flash the unfiltered list.
  useEffect(() => {
    if (!selectedOrgId) return;
    if (restoreStartedFor.current === selectedOrgId) return;
    restoreStartedFor.current = selectedOrgId;

    // No URL params and nothing stored = first look at this org, so start
    // 30 days back. A stored view, even an entirely empty one, is a choice
    // and is used as-is.
    const restored =
      filtersFromParams(new URLSearchParams(window.location.search)) ??
      readStoredFilters(selectedOrgId) ??
      { ...EMPTY_FILTERS, from: daysAgo(DEFAULT_FROM_DAYS) };

    setStatusFilters(restored.statuses);
    setTriggerFilter(restored.trigger);
    setAgentFilter(restored.agentId);
    setFromFilter(restored.from);
    setToFilter(restored.to);
    setTagFilters(restored.tags);
    setSortBy(restored.sortBy);
    setSortDir(restored.sortDir);
    setPage(1);
    loadHistory(1, {
      sortBy:   restored.sortBy,
      sortDir:  restored.sortDir,
      statuses: restored.statuses,
      trigger:  restored.trigger,
      agentId:  restored.agentId,
      from:     restored.from,
      to:       restored.to,
      tags:     restored.tags,
    });
    loadSummary({ from: restored.from, to: restored.to });
    // Batched with the setters above, so the commit that sees this flag also
    // sees every restored value.
    setRestoredOrg(selectedOrgId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  // Mirror the live filters into the URL and into storage. replace(), not
  // push(): every tweak of a filter is not a place you want the back button
  // to walk through.
  useEffect(() => {
    // Also bails mid org-switch, when restoredOrg still names the PREVIOUS
    // org — otherwise the outgoing org's filters get written under the
    // incoming org's storage key.
    if (!selectedOrgId || restoredOrg !== selectedOrgId) return;
    const current: PersistedFilters = {
      statuses: statusFilters, trigger: triggerFilter, agentId: agentFilter,
      from: fromFilter, to: toFilter, tags: tagFilters, sortBy, sortDir,
    };
    const query = filtersToQuery(current);
    if (query !== window.location.search) {
      router.replace(`${window.location.pathname}${query}`, { scroll: false });
    }
    writeStoredFilters(selectedOrgId, current);
  }, [selectedOrgId, restoredOrg, statusFilters, triggerFilter, agentFilter, fromFilter, toFilter, tagFilters, sortBy, sortDir, router]);

  // ─── Realtime: refresh on any execution status change in this org ──
  // Debounce bursts of events (sibling auto-resume fires many at once)
  // so we issue a single refresh instead of one per event.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Latest loaders, for the poll to call.
   *
   * scheduleRefresh has to keep a STABLE identity — it is the onChange of a
   * 10s poll, and rebuilding it on every filter change would restart the
   * subscription. But loadHistory/loadSummary are useCallbacks over the
   * filter state, so a scheduleRefresh frozen on [page] closed over the
   * loaders as they were when the page number last changed.
   *
   * The result was a poll that quietly UNDID filtering: pick a filter, and ten
   * seconds later the silent refresh reloaded the list with the values from
   * before. Rare enough to miss while the only date inputs were two optional
   * boxes nobody set; unmissable now that the range always has a value.
   *
   * A ref gives the stable identity and the current loaders at the same time.
   * Written in an effect, not during render, to keep render pure.
   */
  const latestLoaders = useRef({ loadHistory, loadSummary, page });
  useEffect(() => {
    latestLoaders.current = { loadHistory, loadSummary, page };
  }, [loadHistory, loadSummary, page]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      const l = latestLoaders.current;
      l.loadHistory(l.page, { silent: true });
      l.loadSummary();
    }, 200);
  }, []);

  // Nothing should outlive the page — a pending silent reload firing after
  // unmount sets state on a component that is gone.
  useEffect(() => () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
  }, []);
  // Versioned polling (10s — history list, near-realtime is fine).
  useTopicVersions({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`] : [],
    enabled: !!selectedOrgId,
    intervalMs: 10_000,
    onChange: scheduleRefresh,
  });

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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-5 w-5 text-brand" /> Executions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live and historical agent runs</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Top right, away from the filter bar: this sets the window the
              page is drawn from, which is a different question from which
              runs within it you want to see. */}
          {selectedOrgId && (
            <TimeRangePicker
              from={fromFilter}
              to={toFilter}
              presets={TIME_PRESETS}
              label={timeRangeLabel(fromFilter, toFilter)}
              onApply={applyTimeRange}
              disabled={loading}
            />
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
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40 py-0', isGroupActive('active', statusFilters) && 'ring-2 ring-info/40 bg-info-soft')}
              onClick={() => applyGroupFilter('active')}
            >
              <CardContent className="py-2.5 px-4">
                <div className="flex items-center gap-2.5">
                  <Zap className="h-4 w-4 text-info shrink-0" />
                  <span className="text-sm font-medium">Active Runs</span>
                  <Badge variant="info" className="ml-auto gap-1.5 text-xs">
                    {summaryActive > 0 ? <><ExecutingDots />{summaryActive}</> : summaryActive}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40 py-0', isGroupActive('queued', statusFilters) && 'ring-2 ring-warning/40 bg-warning-soft')}
              onClick={() => applyGroupFilter('queued')}
            >
              <CardContent className="py-2.5 px-4">
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-warning shrink-0" />
                  <span className="text-sm font-medium">Queued</span>
                  <Badge variant="warning" className="ml-auto text-xs">
                    {summaryQueued}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40 py-0', isGroupActive('completed', statusFilters) && 'ring-2 ring-success/40 bg-success-soft')}
              onClick={() => applyGroupFilter('completed')}
            >
              <CardContent className="py-2.5 px-4">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  <span className="text-sm font-medium">Completed</span>
                  <Badge variant="success" className="ml-auto text-xs">
                    {summaryCompleted.toLocaleString()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card
              className={cn('cursor-pointer transition-colors hover:bg-muted/40 py-0', isGroupActive('failed', statusFilters) && 'ring-2 ring-danger/40 bg-danger-soft')}
              onClick={() => applyGroupFilter('failed')}
            >
              <CardContent className="py-2.5 px-4">
                <div className="flex items-center gap-2.5">
                  <XCircle className="h-4 w-4 text-danger shrink-0" />
                  <span className="text-sm font-medium">Failed</span>
                  <Badge variant="danger" className="ml-auto text-xs">
                    {summaryFailed.toLocaleString()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Runs Table Card */}
          {/* py-0 gap-0: Card's own py-6 plus its gap-6 between header and
              content put 48px of nothing between the filter bar and the
              column headers. CardHeader is gone for the same reason — its
              [.border-b]:pb-6 forces 24px under a 28px row and cannot be
              overridden by a plain pb-* in the class list. A plain div with
              the padding written on it says what it does. */}
          <Card className="py-0 gap-0">
            {/* One control, two steps: which field, then which value.
                See FilterPicker — six side-by-side dropdowns wrapped onto a
                second line on a narrow window, and the agent menu had no
                search, which is the one list that actually gets long. */}
            <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">

                <FilterPicker
                  align="start"
                  onApply={applyFilter}
                  kinds={[
                    {
                      key: 'status', label: 'Status', icon: Filter,
                      // Single value from here. The summary cards above still
                      // apply named GROUPS, which is why statusFilters stays an
                      // array — see applyFilter.
                      current: statusFilters.length === 1 ? statusFilters[0] : null,
                      options: FILTERABLE_STATUSES.map((v) => ({
                        value: v, label: STATUS_LABELS[v] ?? v,
                      })),
                    },
                    {
                      key: 'trigger', label: 'Trigger', icon: Webhook,
                      current: triggerFilter || null,
                      options: FILTERABLE_TRIGGERS.map((t) => ({ value: t, label: TRIGGER_LABELS[t] ?? t })),
                    },
                    {
                      key: 'agent', label: 'Agent', icon: Bot,
                      current: agentFilter || null,
                      options: agents.map((a) => ({ value: a.id, label: a.name })),
                      emptyHint: 'no agents',
                    },
                    {
                      key: 'tag', label: 'Tag', icon: TagIcon,
                      current: tagFilters.length === 1 ? tagFilters[0] : null,
                      options: tags.map((t) => ({ value: t.id, label: t.name })),
                      emptyHint: 'no tags',
                    },
                  ]}
                />

                {/* Pills sit in the row, not under it. As their own line they
                      doubled the bar's height the moment anything was
                      filtered — and the bar is above the table on every
                      screen, so that cost is paid constantly. */}
                {hasFilters && (
                  <>
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
                    {tagFilters.map((id) => (
                      <span key={`t-${id}`} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                        {tags.find((t) => t.id === id)?.name ?? 'tag'}
                        <button
                          onClick={() => toggleTag(id, false)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </>
                  )}

                {/* Clear all */}
                {hasFilters && (
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
                    Clear all
                  </Button>
                )}

                {/* Pagination belongs to the table, not the page: it counts
                    the rows below it and moves with the filters beside it.
                    In the page header it read as a property of the screen,
                    and sat a long way from the thing it pages. */}
                {totalPages > 1 && (
                  <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                    </span>
                    <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
            </div>

            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <History className="mx-auto h-10 w-10 mb-3 opacity-20" />
                  {/* Naming the window matters more than naming the filters:
                      an empty list is far more often a range that excludes
                      everything than a filter that does. */}
                  <p className="text-sm">
                    No runs{hasFilters ? ' matching the current filters' : ''}
                    {fromFilter || toFilter ? ` in ${timeRangeLabel(fromFilter, toFilter).toLowerCase()}` : ''}.
                  </p>
                </div>
              ) : (
                <>
                  <RunsTable
                    runs={runs}
                    onOpenBrowser={(run) => setBrowserHITL({ runId: run.id, agentId: run.agent_id, agentName: run.agent_name })}
                    onAbort={handleAbort}
                    abortingRunId={abortingRunId}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
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
