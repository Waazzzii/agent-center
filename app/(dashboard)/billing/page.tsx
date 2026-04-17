'use client';

/**
 * Billing & Usage — dedicated page for cost tracking, token usage,
 * and per-run billing detail.  Separate from Analytics (which focuses
 * on performance/reliability).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import agentClient from '@/lib/api/agent-client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Receipt, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, ChevronRight, ChevronLeft,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function fmtUSD(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '< $0.01';
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtDelta(current: number, previous: number) {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { label: 'flat', cls: 'text-muted-foreground', icon: <Minus className="h-3 w-3" /> };
  const up = pct > 0;
  return {
    label: `${up ? '+' : ''}${pct.toFixed(1)}%`,
    cls: up ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400', // cost up = bad
    icon: up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />,
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Time ranges ──────────────────────────────────────────────

const RANGES = [
  { label: 'This month', getRange: () => { const n = new Date(); return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: n }; }},
  { label: 'Last month', getRange: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1); return { from: s, to: new Date(n.getFullYear(), n.getMonth(), 0, 23, 59, 59) }; }},
  { label: 'Last 7 days', getRange: () => { const n = new Date(); return { from: new Date(n.getTime() - 7 * 86400000), to: n }; }},
  { label: 'Last 30 days', getRange: () => { const n = new Date(); return { from: new Date(n.getTime() - 30 * 86400000), to: n }; }},
  { label: 'Last 90 days', getRange: () => { const n = new Date(); return { from: new Date(n.getTime() - 90 * 86400000), to: n }; }},
] as const;

// ─── Types ────────────────────────────────────────────────────

interface BillingData {
  range: { from: string; to: string };
  totals: { total_cost: string; tokens_input: string; tokens_output: string; tokens_cache_read: string; tokens_cache_write: string; runs_with_cost: string; billable_steps: string };
  daily: { date: string; model: string; cost: string; tokens: string }[];
  byAgent: { agent_id: string; agent_name: string; runs: string; tokens_input: string; tokens_output: string; cost: string }[];
  byModel: { model: string; cost: string; tokens_input: string; tokens_output: string; steps: string }[];
  previous: { totals: BillingData['totals'] };
}

interface BillingRun {
  id: string; status: string; started_at: string; completed_at: string | null;
  agent_name: string; agent_id: string; run_cost: string;
  tokens_input: string; tokens_output: string; tokens_cache_read: string; tokens_cache_write: string;
  model: string;
}

// ─── Page ─────────────────────────────────────────────────────

export default function BillingPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [rangeIdx, setRangeIdx] = useState(0);
  const [data, setData] = useState<BillingData | null>(null);
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const range = RANGES[rangeIdx].getRange();

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const { data: d } = await agentClient.get(`/api/admin/${selectedOrgId}/billing`, {
        params: { from: range.from.toISOString(), to: range.to.toISOString() },
      });
      setData(d);
    } catch { toast.error('Failed to load billing data'); }
    finally { setLoading(false); }
  }, [selectedOrgId, rangeIdx]);

  const loadRuns = useCallback(async (pg = 1) => {
    if (!selectedOrgId) return;
    setLoadingRuns(true);
    try {
      const { data: d } = await agentClient.get(`/api/admin/${selectedOrgId}/billing/runs`, {
        params: { from: range.from.toISOString(), to: range.to.toISOString(), page: pg, limit: 15 },
      });
      setRuns(d.runs);
      setRunsTotal(d.total);
      setRunsPage(pg);
    } catch { toast.error('Failed to load billing runs'); }
    finally { setLoadingRuns(false); }
  }, [selectedOrgId, rangeIdx]);

  useEffect(() => { load(); loadRuns(1); }, [load, loadRuns]);

  if (!allowed) return <NoPermissionContent />;

  const totalCost   = toNum(data?.totals?.total_cost);
  const tokensIn    = toNum(data?.totals?.tokens_input);
  const tokensOut   = toNum(data?.totals?.tokens_output);
  const runsCount   = toNum(data?.totals?.runs_with_cost);
  const prevCost    = toNum(data?.previous?.totals?.total_cost);
  const costDelta   = data?.previous ? fmtDelta(totalCost, prevCost) : null;

  // Aggregate daily data for the area chart (sum across models per day)
  const dailyChart = useMemo(() => {
    if (!data?.daily) return [];
    const byDate: Record<string, number> = {};
    for (const d of data.daily) {
      byDate[d.date] = (byDate[d.date] ?? 0) + toNum(d.cost);
    }
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost: Number(cost.toFixed(4)) }));
  }, [data?.daily]);

  // Model donut
  const modelData = useMemo(() =>
    (data?.byModel ?? []).map((m) => ({
      name: m.model?.replace('claude-', '') ?? 'unknown',
      value: toNum(m.cost),
    })).filter((m) => m.value > 0),
  [data?.byModel]);
  const MODEL_COLORS = ['hsl(217 91% 60%)', 'hsl(262 83% 58%)', 'hsl(142 71% 45%)', 'hsl(30 80% 55%)'];

  const runsPages = Math.max(1, Math.ceil(runsTotal / 15));

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Billing & Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Cost tracking, token usage, and per-run billing detail.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md overflow-hidden">
            {RANGES.map((r, i) => (
              <button key={r.label} onClick={() => setRangeIdx(i)} className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                rangeIdx === i ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}>
                {r.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => { load(); loadRuns(1); }} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Headline */}
          <Card>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Total cost</div>
                  <div className="text-3xl font-semibold mt-1 tabular-nums">{fmtUSD(totalCost)}</div>
                  {costDelta && (
                    <div className="flex items-center gap-1 mt-1 text-xs">
                      <span className={cn('inline-flex items-center gap-0.5', costDelta.cls)}>{costDelta.icon}{costDelta.label}</span>
                      <span className="text-muted-foreground">vs prev period</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Tokens in</div>
                  <div className="text-3xl font-semibold mt-1 tabular-nums">{fmtTokens(tokensIn)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Tokens out</div>
                  <div className="text-3xl font-semibold mt-1 tabular-nums">{fmtTokens(tokensOut)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Billable runs</div>
                  <div className="text-3xl font-semibold mt-1 tabular-nums">{runsCount.toLocaleString()}</div>
                  {runsCount > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">avg {fmtUSD(totalCost / runsCount)} / run</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily cost chart */}
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Daily cost</h3>
                {dailyChart.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No cost data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={dailyChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: unknown) => [`$${Number(v ?? 0).toFixed(4)}`, 'Cost']} />
                      <Area type="monotone" dataKey="cost" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60%)" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Model breakdown donut */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3">Cost by model</h3>
                {modelData.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={modelData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={75} paddingAngle={2}>
                        {modelData.map((_, i) => <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: unknown) => fmtUSD(Number(v ?? 0))} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Cost by agent table */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Cost by agent</h3>
              {(data?.byAgent ?? []).length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No agent costs in this period</div>
              ) : (
                <div className="overflow-hidden rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="text-left font-medium px-3 py-2">Agent</th>
                        <th className="text-right font-medium px-3 py-2">Runs</th>
                        <th className="text-right font-medium px-3 py-2">Tokens in</th>
                        <th className="text-right font-medium px-3 py-2">Tokens out</th>
                        <th className="text-right font-medium px-3 py-2">Cost</th>
                        <th className="text-right font-medium px-3 py-2">Avg / run</th>
                        <th className="w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.byAgent ?? []).map((a) => {
                        const cost = toNum(a.cost);
                        const runs = toNum(a.runs);
                        return (
                          <tr key={a.agent_id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => router.push(`/agent-history?agent_id=${a.agent_id}`)}>
                            <td className="px-3 py-2 font-medium">{a.agent_name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{runs}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(toNum(a.tokens_input))}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(toNum(a.tokens_output))}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{fmtUSD(cost)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{runs > 0 ? fmtUSD(cost / runs) : '—'}</td>
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

          {/* Run-level detail table */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Run-level detail</h3>
                <span className="text-xs text-muted-foreground">{runsTotal} runs with cost</span>
              </div>
              {loadingRuns && runs.length === 0 ? (
                <div className="py-6 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" /></div>
              ) : runs.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No billable runs in this period</div>
              ) : (
                <>
                  <div className="overflow-hidden rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="text-left font-medium px-3 py-2">Date</th>
                          <th className="text-left font-medium px-3 py-2">Agent</th>
                          <th className="text-left font-medium px-3 py-2">Status</th>
                          <th className="text-right font-medium px-3 py-2">Tokens</th>
                          <th className="text-right font-medium px-3 py-2">Model</th>
                          <th className="text-right font-medium px-3 py-2">Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r) => (
                          <tr key={r.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => router.push(`/agent-history/${r.id}`)}>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.started_at)}</td>
                            <td className="px-3 py-2 font-medium">{r.agent_name}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className={cn('text-[10px]',
                                r.status === 'completed' ? 'border-green-400 text-green-600' :
                                r.status === 'failed' ? 'border-red-400 text-red-600' :
                                'border-slate-300'
                              )}>{r.status}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtTokens(toNum(r.tokens_input) + toNum(r.tokens_output))}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{(r.model ?? '').replace('claude-', '')}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{fmtUSD(toNum(r.run_cost))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {runsPages > 1 && (
                    <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
                      <span>Page {runsPage} of {runsPages}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={runsPage <= 1} onClick={() => loadRuns(runsPage - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={runsPage >= runsPages} onClick={() => loadRuns(runsPage + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
