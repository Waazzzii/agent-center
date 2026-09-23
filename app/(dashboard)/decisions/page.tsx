'use client';

/**
 * Decisions — the log of every human decision an agent's outcome has raised.
 *
 * Rows are DECISIONS, not desks. That is what makes "sort by triggered agent"
 * meaningful: the launched run is per-decision, so a desk-level row would
 * have nothing to sort on.
 *
 * Two agent columns, and they are genuinely different joins — "Ended with" is
 * the agent whose run raised the decision, "Triggered" is the agent the
 * answer started. Filtering on either is the point of this page.
 *
 * Deliberately built on the same primitives as the executions list — time
 * range control top right, FilterPicker, server-side whitelisted sort with a
 * stable tiebreak — so the two read as one family.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAgents, getDecisions,
  type Agent, type Decision, type DecisionStatus,
} from '@/lib/api/agents';
import { FilterPicker } from '@/components/execution/FilterPicker';
import { TimeRangePicker } from '@/components/execution/TimeRangePicker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import {
  RefreshCw, ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown,
  Filter, X, Bot, Clock, Loader2, Gavel, CheckCircle2,
  ArrowUpRight, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { choiceLabel, choiceToneVariant, styleForOption } from '@/lib/decision-wording';

const PAGE_SIZE = 15;

const STATUS_LABELS: Record<string, string> = {
  pending:      'Pending',
  decided:      'Decided',
  expired:      'Expired',
  not_actioned: 'Not actioned',
};

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'secondary'> = {
  pending:      'warning',
  decided:      'success',
  expired:      'danger',
  not_actioned: 'secondary',
};

const FILTERABLE_STATUSES: DecisionStatus[] = ['pending', 'decided', 'expired', 'not_actioned'];

/** The shortcut cards, in the order they matter. */
const STATUS_CARDS: {
  value: DecisionStatus;
  icon: React.ElementType;
  tint: string;
  ring: string;
  soft: string;
  badge: 'warning' | 'success' | 'danger' | 'secondary';
}[] = [
  { value: 'pending',      icon: Clock,         tint: 'text-warning',          ring: 'ring-warning/40', soft: 'bg-warning-soft', badge: 'warning' },
  { value: 'decided',      icon: CheckCircle2,  tint: 'text-success',          ring: 'ring-success/40', soft: 'bg-success-soft', badge: 'success' },
  { value: 'expired',      icon: AlertTriangle, tint: 'text-danger',           ring: 'ring-danger/40',  soft: 'bg-danger-soft',  badge: 'danger'  },
  { value: 'not_actioned', icon: X,             tint: 'text-muted-foreground', ring: 'ring-border',     soft: 'bg-muted/40',     badge: 'secondary' },
];

/**
 * What the row actually says.
 *
 * This briefly flagged "Awaiting submit" for a decided decision whose desk
 * was still open, back when answering and launching were two steps. Now they
 * are one, so that combination just means the desk holds OTHER decisions
 * still to answer — a normal state while working down a list, not something
 * outstanding. A launch that failed is the thing worth flagging, and it has
 * its own column.
 */
/**
 * The runtime's per-item correlation key, dug out of the payload.
 *
 * `_input_id` is stamped onto every item by the executor and is what ties a
 * decision back to its row in the logs. It is a raw uuid, so it belongs in a
 * tooltip, never in the cell — see describeItem.
 */
function inputIdOf(d: Decision): string | null {
  const payload = (d.proposed_input ?? d.source_output) as Record<string, unknown> | null;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const id = payload._input_id;
  return typeof id === 'string' ? id : null;
}

/**
 * What to call one item of a batch.
 *
 * "item 1" is a position, and position is only meaningful while you are
 * looking at the desk it belongs to — in a feed of decisions from many runs
 * it says nothing at all. The obvious alternative, _input_id, is no better:
 * it is a randomUUID, so it would swap a label that means little for one that
 * means nothing, in more characters.
 *
 * The thing that actually identifies the item is already on the row. The
 * author wrote a message_template naming the fields that matter — "Confirmed
 * number 101" — and it was rendered at raise time. That is the item, in the
 * author's own words, and it is what the Slack message and the review screen
 * both lead with.
 *
 * So: the message when there is one, the position when there is not, and the
 * uuid in the title for whoever is cross-referencing a log.
 */
function describeItem(d: Decision): { text: string | null; title: string | undefined } {
  const position = d.item_index !== null ? `item ${d.item_index + 1}` : null;
  const inputId = inputIdOf(d);
  const title = [position, inputId].filter(Boolean).join(' · ') || undefined;
  const summary = d.message_text?.trim();
  return { text: summary || position, title };
}

function displayStatus(d: Decision): { label: string; variant: 'warning' | 'success' | 'danger' | 'secondary' } {
  return { label: STATUS_LABELS[d.status] ?? d.status, variant: STATUS_VARIANT[d.status] ?? 'secondary' };
}

// ─── Sort ────────────────────────────────────────────────────────────
// Keys must match the backend whitelist in decision-queue.service.js.
type SortKey = 'created' | 'decided' | 'status' | 'option' | 'source' | 'target';
type SortDir = 'asc' | 'desc';
const DEFAULT_SORT: SortKey = 'created';
const DEFAULT_SORT_DIR: SortDir = 'desc';

/** Text reads A→Z; time reads newest-first. */
const FIRST_CLICK_DIR: Record<SortKey, SortDir> = {
  created: 'desc', decided: 'desc', status: 'asc', option: 'asc', source: 'asc', target: 'asc',
};

// ─── Time range ──────────────────────────────────────────────────────
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const TIME_PRESETS = [
  { label: 'Last hour',     days: 0 },
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 90 days',  days: 90 },
];

const DEFAULT_FROM_DAYS = 30;

function formatShortDate(v: string) {
  return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(v: string) {
  return new Date(v).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Label derived from the dates, never from a stored mode. */
function timeRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Any time';
  if (from && !to) {
    const p = TIME_PRESETS.find((x) => x.days > 0 && daysAgo(x.days) === from);
    return p ? p.label : `Since ${formatShortDate(from)}`;
  }
  if (!from && to) return `Up to ${formatShortDate(to)}`;
  return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

export default function DecisionsPage() {
  const permitted = useRequirePermission('agent_center_user');
  const { selectedOrgId } = useAdminViewStore();
  const router = useRouter();

  const [items, setItems]     = useState<Decision[]>([]);
  const [agents, setAgents]   = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  // Per-status totals for the shortcut cards. Server-side and filter-aware
  // (see queryDecisions): "Pending 4" means four in the range and agents you
  // are looking at, not four in the org — a card that ignored the other
  // filters would send you to a list that did not contain them.
  const [counts, setCounts]   = useState<Record<string, number>>({});
  const [totalPages, setTotalPages] = useState(1);

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [sourceAgent, setSourceAgent]     = useState('');
  const [targetAgent, setTargetAgent]     = useState('');
  const [fromFilter, setFromFilter]       = useState(daysAgo(DEFAULT_FROM_DAYS));
  const [toFilter, setToFilter]           = useState('');
  const [sortBy, setSortBy]               = useState<SortKey>(DEFAULT_SORT);
  const [sortDir, setSortDir]             = useState<SortDir>(DEFAULT_SORT_DIR);

  const hasFilters = statusFilters.length > 0 || !!sourceAgent || !!targetAgent;

  const load = useCallback(async (pg: number, opts?: {
    statuses?: string[]; source?: string; target?: string;
    from?: string; to?: string; sortBy?: SortKey; sortDir?: SortDir;
  }) => {
    if (!selectedOrgId) return;
    const statuses = opts?.statuses ?? statusFilters;
    const src      = opts?.source   !== undefined ? opts.source  : sourceAgent;
    const tgt      = opts?.target   !== undefined ? opts.target  : targetAgent;
    const from     = opts?.from     !== undefined ? opts.from    : fromFilter;
    const to       = opts?.to       !== undefined ? opts.to      : toFilter;
    const sBy      = opts?.sortBy   ?? sortBy;
    const sDir     = opts?.sortDir  ?? sortDir;

    try {
      setLoading(true);
      const data = await getDecisions(selectedOrgId, {
        page: pg, limit: PAGE_SIZE,
        ...(statuses.length ? { status: statuses } : {}),
        ...(src ? { source_agent_id: src } : {}),
        ...(tgt ? { target_agent_id: tgt } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: (() => { const d = new Date(`${to}T00:00:00`); d.setHours(23, 59, 59, 999); return d.toISOString(); })() } : {}),
        sort_by: sBy, sort_dir: sDir,
      });
      setItems(data.items ?? []);
      setTotal(data.total);
      setCounts(data.counts ?? {});
      setTotalPages(data.pages);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load decisions');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, statusFilters, sourceAgent, targetAgent, fromFilter, toFilter, sortBy, sortDir]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setPage(1);
    load(1);
    getAgents(selectedOrgId).then((d) => setAgents(d.agents)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const applyFilter = (key: string, value: string) => {
    const next = { statuses: statusFilters, source: sourceAgent, target: targetAgent };
    if (key === 'status') { next.statuses = value ? [value] : []; setStatusFilters(next.statuses); }
    if (key === 'source') { next.source = value; setSourceAgent(value); }
    if (key === 'target') { next.target = value; setTargetAgent(value); }
    setPage(1);
    load(1, next);
  };

  const applyTimeRange = (from: string, to: string) => {
    if (from && to && from > to) { toast.error('Start date cannot be after end date'); return; }
    setFromFilter(from); setToFilter(to);
    setPage(1);
    load(1, { from, to });
  };

  const toggleSort = (key: SortKey) => {
    const dir: SortDir = key === sortBy ? (sortDir === 'asc' ? 'desc' : 'asc') : FIRST_CLICK_DIR[key];
    setSortBy(key); setSortDir(dir);
    setPage(1);
    load(1, { sortBy: key, sortDir: dir });
  };

  const clearFilters = () => {
    setStatusFilters([]); setSourceAgent(''); setTargetAgent('');
    setPage(1);
    load(1, { statuses: [], source: '', target: '' });
  };

  const goToPage = (pg: number) => { setPage(pg); load(pg); };

  /** Matches the executions table header exactly — same family, same affordances. */
  const Th = ({ col, label, align = 'left' }: { col?: SortKey; label: string; align?: 'left' | 'right' }) => {
    if (!col) return <span />;
    const active = sortBy === col;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        title={`Sort by ${label.toLowerCase()}`}
        className={cn('flex items-center gap-1 select-none hover:text-foreground/80 transition-colors',
          align === 'right' && 'justify-end')}
      >
        <span className="truncate">{label}</span>
        {active
          ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />)
          : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" />}
      </button>
    );
  };

  if (!permitted) return <NoPermissionContent />;

  // Status and Decision used to be two columns. They could never both say
  // anything: a row with a decision is always status 'decided', and a row
  // without one always shows "—". One column, one pill.
  const GRID = 'grid-cols-[1fr_170px_1fr_150px_150px]';

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gavel className="h-5 w-5 text-brand" /> Decisions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Human decisions raised when an agent finished
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedOrgId && (
            <TimeRangePicker
              from={fromFilter} to={toFilter} presets={TIME_PRESETS}
              label={timeRangeLabel(fromFilter, toFilter)}
              onApply={applyTimeRange} disabled={loading}
            />
          )}
          <Button variant="outline" size="sm" onClick={() => load(page)} disabled={loading || !selectedOrgId}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to view decisions.</p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Status shortcuts, same behaviour as the Executions feed: clicking
            one SETS the status filter rather than adding to it, and clicking
            the active one clears it. Toggling matters here more than there —
            Pending is the only status anyone is normally looking for, so the
            common path is one click in and one click back out.

            Pending leads because it is the only row that is anyone's work;
            the rest are history. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATUS_CARDS.map((c) => {
            const active = statusFilters.length === 1 && statusFilters[0] === c.value;
            return (
              <Card
                key={c.value}
                className={cn(
                  'cursor-pointer py-0 transition-colors hover:bg-muted/40',
                  active && `ring-2 ${c.ring} ${c.soft}`,
                )}
                onClick={() => applyFilter('status', active ? '' : c.value)}
              >
                <CardContent className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <c.icon className={cn('h-4 w-4 shrink-0', c.tint)} />
                    <span className="text-sm font-medium">{STATUS_LABELS[c.value]}</span>
                    <Badge variant={c.badge} className="ml-auto text-xs">
                      {(counts[c.value] ?? 0).toLocaleString()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="py-0 gap-0">
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <FilterPicker
              align="start"
              onApply={applyFilter}
              kinds={[
                {
                  key: 'status', label: 'Status', icon: Filter,
                  current: statusFilters.length === 1 ? statusFilters[0] : null,
                  options: FILTERABLE_STATUSES.map((v) => ({ value: v, label: STATUS_LABELS[v] })),
                },
                {
                  // Two agent filters, because a decision sits between two
                  // agents and you will want to ask about either one.
                  key: 'source', label: 'Ended with', icon: Bot,
                  current: sourceAgent || null,
                  options: agents.map((a) => ({ value: a.id, label: a.name })),
                  emptyHint: 'no agents',
                },
                {
                  key: 'target', label: 'Triggered', icon: ArrowUpRight,
                  current: targetAgent || null,
                  options: agents.map((a) => ({ value: a.id, label: a.name })),
                  emptyHint: 'no agents',
                },
              ]}
            />

            {statusFilters.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                {STATUS_LABELS[s]}
                <button onClick={() => applyFilter('status', '')} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {sourceAgent && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                Ended with: {agents.find((a) => a.id === sourceAgent)?.name ?? 'agent'}
                <button onClick={() => applyFilter('source', '')} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {targetAgent && (
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                Triggered: {agents.find((a) => a.id === targetAgent)?.name ?? 'agent'}
                <button onClick={() => applyFilter('target', '')} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearFilters}>
                Clear all
              </Button>
            )}

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
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Gavel className="mx-auto mb-2 h-6 w-6 opacity-40" />
                <p className="text-sm">
                  No decisions{hasFilters ? ' matching the current filters' : ''}
                  {fromFilter || toFilter ? ` in ${timeRangeLabel(fromFilter, toFilter).toLowerCase()}` : ''}.
                </p>
              </div>
            ) : (
              <div>
                <div className={cn('hidden md:grid items-center gap-2 h-10 px-3 border-b text-sm font-medium text-foreground', GRID)}>
                  <Th col="source" label="Ended with" />
                  {/* Sorts by status: it groups Pending away from everything
                      settled, which is the cut people actually want. Sorting
                      by which option was chosen went with the column — it is
                      still available as a filter. */}
                  <Th col="status" label="Decision" />
                  <Th col="target" label="Triggered" />
                  <Th col="decided" label="Decided" />
                  <Th col="created" label="Raised" />
                </div>

                <div className="divide-y divide-border/40">
                  {items.map((d) => {
                    const decider = [d.decided_by_first_name, d.decided_by_last_name].filter(Boolean).join(' ');
                    const isOpen = d.status === 'pending' && d.desk_status === 'open';
                    return (
                      <div
                        key={d.id}
                        // ?decision= so a batch row opens the item you
                        // clicked. Without it every row of a desk landed on
                        // the same first item, and on an answered desk that
                        // meant clicking "Denied — item 2" and being shown
                        // item 1's approval.
                        onClick={() => router.push(`/decisions/${d.desk_id}?decision=${d.id}`)}
                        className={cn('group/row cursor-pointer hover:bg-muted/30 transition-colors md:grid items-center gap-2 px-3 py-2.5 text-sm', GRID)}
                      >
                        <div className="min-w-0">
                          <span className="font-medium truncate block">
                            {d.source_agent_name}
                            {/* WHICH RULE raised it. An agent with several
                                on-completion rules raises a separate ask per
                                match, so without this the log shows rows
                                naming the same agent with nothing to say
                                which queue each belongs to. */}
                            {d.outcome_name && (
                              <span className="ml-1.5 font-normal text-[11px] text-muted-foreground">
                                {d.outcome_name}
                              </span>
                            )}
                          </span>
                          {(() => {
                            const item = describeItem(d);
                            if (!item.text) return null;
                            return (
                              <span className="block truncate text-[11px] text-muted-foreground" title={item.title}>
                                {item.text}
                              </span>
                            );
                          })()}
                        </div>

                        <div className="min-w-0 flex items-center gap-1.5">
                          {/* An answered row shows WHAT WAS CHOSEN, in the
                              past tense and in that option's authored colour.
                              An unanswered one shows why there is nothing to
                              show — pending, expired, dismissed. Never both,
                              because there was never anything to say twice. */}
                          {d.chosen_option ? (
                            <Badge
                              variant={choiceToneVariant(styleForOption(d.chosen_option))}
                              className="text-xs"
                            >
                              {choiceLabel(d.chosen_option_label ?? d.chosen_option)}
                            </Badge>
                          ) : (
                            (() => {
                              const ds = displayStatus(d);
                              return <Badge variant={ds.variant} className="text-xs">{ds.label}</Badge>;
                            })()
                          )}
                          {d.was_edited && (
                            <span className="text-[11px] text-muted-foreground">edited</span>
                          )}
                        </div>

                        <div className="min-w-0">
                          {/* A launch that failed must be visible here. Approving
                              and getting silence is the failure mode this whole
                              feature exists to avoid. */}
                          {d.launch_error ? (
                            <span className="inline-flex items-center gap-1 text-danger truncate" title={d.launch_error}>
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Launch failed
                            </span>
                          ) : d.resulting_execution_id ? (
                            <Link
                              href={`/agent-history/${d.resulting_execution_id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-brand hover:underline truncate"
                            >
                              {d.target_agent_name ?? 'run'} <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground opacity-50">—</span>
                          )}
                        </div>

                        <div className="text-muted-foreground text-xs">
                          {d.decided_at
                            ? <>{formatDateTime(d.decided_at)}{decider ? <span className="block opacity-70">{decider}</span> : null}</>
                            : isOpen && d.expires_at
                              ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />expires {formatDateTime(d.expires_at)}</span>
                              : <span className="opacity-50">—</span>}
                        </div>

                        <div className="text-muted-foreground text-xs">{formatDateTime(d.created_at)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
