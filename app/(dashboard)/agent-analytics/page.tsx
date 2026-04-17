'use client';

/**
 * Analytics dashboard — card-based layout answering "how are my agents doing?"
 *
 * Every number is clickable to drill down into the Executions feed with the
 * matching filter applied.  Time range controls the entire page.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getExecutionAnalytics,
  type ExecutionAnalytics,
  type AgentStats,
  type ActionTypeStats,
  type FailureHotspot,
} from '@/lib/api/agents';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useEventStream } from '@/lib/hooks/use-event-stream';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, Minus,
  Activity, Clock, AlertTriangle, Zap, DollarSign,
  RefreshCw, Loader2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────

const NBSP = '\u00A0';

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function fmtDuration(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return '—';
  if (s < 60)    return `${Math.round(s)}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

function fmtTokens(n: number): string {
  if (n < 1_000)       return String(n);
  if (n < 1_000_000)   return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000_0) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtUSD(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '< $0.01';
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(0)}`;
}

function fmtDelta(current: number, previous: number): { label: string; cls: string; icon: React.ReactNode } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { label: 'flat', cls: 'text-muted-foreground', icon: <Minus className="h-3 w-3" /> };
  const up = pct > 0;
  return {
    label: `${up ? '+' : ''}${pct.toFixed(1)}%`,
    cls: up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
    icon: up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />,
  };
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

// ─── Time ranges ──────────────────────────────────────────────────

const RANGES = [
  { label: '24h', ms: 24 * 3_600_000 },
  { label: '7d',  ms: 7 * 24 * 3_600_000 },
  { label: '30d', ms: 30 * 24 * 3_600_000 },
  { label: '90d', ms: 90 * 24 * 3_600_000 },
] as const;
type RangeLabel = typeof RANGES[number]['label'];

// ─── Page ─────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [range, setRange] = useState<RangeLabel>('7d');
  const [data, setData] = useState<ExecutionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const ms = RANGES.find((r) => r.label === range)?.ms ?? 7 * 24 * 3_600_000;
      const to = new Date();
      const from = new Date(to.getTime() - ms);
      setData(await getExecutionAnalytics(selectedOrgId, {
        from: from.toISOString(),
        to:   to.toISOString(),
        compare: true,
      }));
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, range]);

  useEffect(() => { load(); }, [load]);

  // Realtime: refresh on any execution event in this org (debounced).
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => { void load(); },
  });

  if (!allowed) return <NoPermissionContent />;

  const isEmpty = !loading && (!data || toNum(data.summary?.total) === 0);

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent performance, cost, and reliability trends.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setRange(r.label)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  range === r.label
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isEmpty ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No agent executions in the last {range}.  Run an agent to see analytics here.
        </CardContent></Card>
      ) : data ? (
        <>
          <HeadlineCard data={data} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <RunsOverTimeCard data={data} onBarClick={(date) => {
                if (!selectedOrgId) return;
                const start = new Date(date + 'T00:00:00').toISOString().slice(0,10);
                router.push(`/agent-history?from=${start}&to=${start}`);
              }} />
            </div>
            <StatusMixCard data={data} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopAgentsCard data={data} onRowClick={(a) => router.push(`/agent-history?agent_id=${a.agent_id}`)} />
            <FailureHotspotsCard data={data} onRowClick={(h) => router.push(`/agent-history?agent_id=${h.agent_id}&status=failed`)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActionTypeBreakdownCard data={data} />
            <TriggerBreakdownCard data={data} />
          </div>

          <CostAndUsageCard data={data} />
        </>
      ) : null}
    </div>
  );
}

// ─── Headline card ────────────────────────────────────────────────

function HeadlineCard({ data }: { data: ExecutionAnalytics }) {
  const total     = toNum(data.summary?.total);
  const completed = toNum(data.summary?.completed);
  const avgDur    = toNum(data.summary?.avg_duration_s);
  const successPct = total > 0
    ? (completed / (completed + toNum(data.summary.failed) + toNum(data.summary.aborted))) * 100
    : 0;
  const active    = toNum(data.live?.active) + toNum(data.live?.awaiting);

  const prev = data.previous?.summary;
  const totalDelta    = prev ? fmtDelta(total, toNum(prev.total)) : null;
  const completedPrev = prev ? toNum(prev.completed) : 0;
  const successDelta = prev && prev.total
    ? fmtDelta(successPct, (completedPrev / toNum(prev.total)) * 100)
    : null;
  const durDelta = prev ? fmtDelta(avgDur, toNum(prev.avg_duration_s)) : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Stat label="Runs" value={total.toLocaleString()} delta={totalDelta} />
          <Stat label="Success" value={`${successPct.toFixed(1)}%`} delta={successDelta} />
          <Stat label="Avg duration" value={fmtDuration(avgDur)} delta={durDelta} deltaInverse />
          <Stat
            label="Active now"
            value={active.toLocaleString()}
            delta={null}
            suffix={active > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-emerald-500" /></span>
                live
              </span>
            ) : null}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label, value, delta, deltaInverse = false, suffix,
}: {
  label: string;
  value: string;
  delta: ReturnType<typeof fmtDelta>;
  deltaInverse?: boolean;  // for metrics where "down" is good (duration, failure %)
  suffix?: React.ReactNode;
}) {
  // Flip color for inverse metrics so a DECREASE in duration shows as green.
  const invertedDelta = delta && deltaInverse
    ? { ...delta, cls: delta.cls === 'text-emerald-600 dark:text-emerald-400' ? 'text-red-600 dark:text-red-400' : delta.cls === 'text-red-600 dark:text-red-400' ? 'text-emerald-600 dark:text-emerald-400' : delta.cls }
    : delta;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      <div className="flex items-center gap-2 mt-1 text-xs min-h-[16px]">
        {invertedDelta && (
          <span className={cn('inline-flex items-center gap-0.5', invertedDelta.cls)}>
            {invertedDelta.icon}{invertedDelta.label}
          </span>
        )}
        {invertedDelta && <span className="text-muted-foreground">vs prev</span>}
        {suffix}
      </div>
    </div>
  );
}

// ─── Runs over time ───────────────────────────────────────────────

function RunsOverTimeCard({ data, onBarClick }: {
  data: ExecutionAnalytics;
  onBarClick: (date: string) => void;
}) {
  const chartData = useMemo(() => (data.daily ?? []).map((d) => ({
    date: d.date,
    completed: toNum(d.completed),
    failed:    toNum(d.failed),
    aborted:   toNum(d.aborted),
  })), [data.daily]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Runs over time</h3>
            <p className="text-xs text-muted-foreground">Stacked by outcome</p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} onClick={(e: unknown) => {
              const p = (e as { activeLabel?: string })?.activeLabel;
              if (p) onBarClick(p);
            }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid hsl(var(--border))', background: 'hsl(var(--popover))' }}
                labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="completed" stackId="a" fill="hsl(142 71% 45%)" name="Completed" />
              <Bar dataKey="failed"    stackId="a" fill="hsl(0 72% 51%)"   name="Failed" />
              <Bar dataKey="aborted"   stackId="a" fill="hsl(30 80% 55%)"  name="Aborted" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Status mix donut ─────────────────────────────────────────────

function StatusMixCard({ data }: { data: ExecutionAnalytics }) {
  const completed = toNum(data.summary.completed);
  const failed    = toNum(data.summary.failed);
  const aborted   = toNum(data.summary.aborted);
  const running   = toNum(data.summary.running);
  const pie = [
    { name: 'Completed', value: completed, color: 'hsl(142 71% 45%)' },
    { name: 'Failed',    value: failed,    color: 'hsl(0 72% 51%)' },
    { name: 'Aborted',   value: aborted,   color: 'hsl(30 80% 55%)' },
    { name: 'Running',   value: running,   color: 'hsl(217 91% 60%)' },
  ].filter((p) => p.value > 0);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Status mix</h3>
          <p className="text-xs text-muted-foreground">All runs in period</p>
        </div>
        {pie.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {pie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top agents table ─────────────────────────────────────────────

function TopAgentsCard({ data, onRowClick }: {
  data: ExecutionAnalytics;
  onRowClick: (a: AgentStats) => void;
}) {
  const rows = (data.perAgent ?? []).slice(0, 8);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Top agents</h3>
            <p className="text-xs text-muted-foreground">By run volume in period</p>
          </div>
          <Link href="/agent-history" className="text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No agents ran in this period</div>
        ) : (
          <div className="overflow-hidden rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Agent</th>
                  <th className="text-right font-medium px-3 py-2">Runs</th>
                  <th className="text-right font-medium px-3 py-2">Success</th>
                  <th className="text-right font-medium px-3 py-2">Avg time</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const total = toNum(r.total);
                  const completed = toNum(r.completed);
                  const finished = completed + toNum(r.failed) + toNum(r.aborted);
                  const successPct = finished > 0 ? (completed / finished) * 100 : 100;
                  const warn = successPct < 90 && finished >= 5;
                  return (
                    <tr
                      key={r.agent_id}
                      onClick={() => onRowClick(r)}
                      className="border-t hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 font-medium">{r.agent_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{total.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className={warn ? 'text-amber-600 dark:text-amber-400' : undefined}>
                          {successPct.toFixed(0)}%
                        </span>
                        {warn && <span className="ml-1">⚠</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {fmtDuration(toNum(r.avg_duration_s))}
                      </td>
                      <td className="pr-3 text-muted-foreground"><ChevronRight className="h-3.5 w-3.5" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Failure hotspots ─────────────────────────────────────────────

function FailureHotspotsCard({ data, onRowClick }: {
  data: ExecutionAnalytics;
  onRowClick: (h: FailureHotspot) => void;
}) {
  const rows = (data.hotspots ?? []).slice(0, 8);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Failure hotspots
            </h3>
            <p className="text-xs text-muted-foreground">Step-level failures</p>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Zap className="h-4 w-4 text-emerald-500" />
            No failures in this period
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div
                key={i}
                onClick={() => onRowClick(r)}
                className="flex items-start gap-3 rounded-md border p-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <Badge variant="outline" className="mt-0.5 shrink-0 border-red-300 text-red-600 dark:text-red-400">
                  {toNum(r.failures)}×
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.agent_name} <span className="text-muted-foreground font-normal">·</span> {r.action_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.last_error ?? 'No error detail'} · last {fmtRelative(r.last_failed_at)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Action type breakdown ────────────────────────────────────────

const ACTION_TYPE_LABEL: Record<string, string> = {
  agent:          'AI step',
  login:          'Login',
  browser_script: 'Browser script',
  sub_agent:      'Sub-agent',
  approval:       'Approval',
};

function ActionTypeBreakdownCard({ data }: { data: ExecutionAnalytics }) {
  const rows = (data.actionTypes ?? []).sort((a, b) => toNum(b.total) - toNum(a.total));
  const totalAll = rows.reduce((s, r) => s + toNum(r.total), 0);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Action type breakdown</h3>
          <p className="text-xs text-muted-foreground">Where time + reliability are spent</p>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const total   = toNum(r.total);
              const failed  = toNum(r.failed);
              const pct     = totalAll > 0 ? (total / totalAll) * 100 : 0;
              const failPct = total > 0 ? (failed / total) * 100 : 0;
              return (
                <div key={r.action_type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{ACTION_TYPE_LABEL[r.action_type] ?? r.action_type}</span>
                    <span className="text-muted-foreground">
                      {total} · {pct.toFixed(0)}% · avg {fmtDuration(toNum(r.avg_duration_s))}
                      {failed > 0 && <span className="text-red-500 ml-1.5">· {failPct.toFixed(1)}% fail</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Trigger breakdown ────────────────────────────────────────────

function TriggerBreakdownCard({ data }: { data: ExecutionAnalytics }) {
  const rows = (data.triggerTypes ?? []);
  const total = rows.reduce((s, r) => s + toNum(r.count), 0);
  const colors = ['hsl(217 91% 60%)', 'hsl(262 83% 58%)', 'hsl(142 71% 45%)', 'hsl(30 80% 55%)', 'hsl(0 72% 51%)'];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Trigger breakdown</h3>
          <p className="text-xs text-muted-foreground">How runs are being kicked off</p>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r, i) => {
              const pct = total > 0 ? (toNum(r.count) / total) * 100 : 0;
              return (
                <div key={r.trigger_type}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium capitalize">{r.trigger_type.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{toNum(r.count)} · {pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Cost & usage ─────────────────────────────────────────────────

function CostAndUsageCard({ data }: { data: ExecutionAnalytics }) {
  const cost = data.cost;
  const tokensIn   = toNum(cost?.tokens_input);
  const tokensOut  = toNum(cost?.tokens_output);
  const cacheRead  = toNum(cost?.tokens_cache_read);
  const cacheWrite = toNum(cost?.tokens_cache_write);
  const totalCost  = toNum(cost?.cost_usd);
  const aiSteps    = toNum(cost?.ai_steps);

  const prevCost = data.previous?.cost ? toNum(data.previous.cost.cost_usd) : 0;
  const costDelta = data.previous ? fmtDelta(totalCost, prevCost) : null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              Cost &amp; usage
            </h3>
            <p className="text-xs text-muted-foreground">Your cost — {aiSteps.toLocaleString()} AI step{aiSteps === 1 ? '' : 's'} completed</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Total cost" value={fmtUSD(totalCost)} delta={costDelta} />
          <UsageStat label="Input" value={fmtTokens(tokensIn)} sub="tokens" />
          <UsageStat label="Output" value={fmtTokens(tokensOut)} sub="tokens" />
          <UsageStat label="Cache read" value={fmtTokens(cacheRead)} sub="tokens" />
          <UsageStat label="Cache write" value={fmtTokens(cacheWrite)} sub="tokens" />
        </div>

        {aiSteps > 0 && (
          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
            Avg cost per AI step: {fmtUSD(totalCost / aiSteps)}
            {NBSP}·{NBSP}
            Avg tokens per step: {fmtTokens(Math.round((tokensIn + tokensOut) / aiSteps))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UsageStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
