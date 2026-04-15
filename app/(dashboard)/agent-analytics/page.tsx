'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getExecutionAnalytics,
  type ExecutionAnalytics,
  type DailyCount,
  type AgentStats,
  type RecentFailure,
} from '@/lib/api/agents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Layers,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

// ─── Helpers ─────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const CHART_COLORS = {
  completed: '#22c55e',
  failed: '#ef4444',
  aborted: '#f59e0b',
  running: '#3b82f6',
};

const PIE_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

// ─── Page ────────────────────────────────────────────────────────

export default function AgentAnalyticsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');

  const [data, setData] = useState<ExecutionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - parseInt(range) * 24 * 60 * 60 * 1000);
      const result = await getExecutionAnalytics(selectedOrgId, {
        from: from.toISOString(),
        to: now.toISOString(),
      });
      setData(result);
    } catch {
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, range]);

  useEffect(() => { load(); }, [load]);

  if (!allowed) return <NoPermissionContent />;

  const s = data?.summary;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Execution Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organization-level agent execution metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['7', '30', '90'] as const).map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r}d
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          {/* ── KPI Cards ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Total Executions"
              value={String(s?.total ?? 0)}
              color="blue"
            />
            <KpiCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Success Rate"
              value={s?.success_rate != null ? `${s.success_rate}%` : '—'}
              color="green"
            />
            <KpiCard
              icon={<Clock className="h-4 w-4" />}
              label="Avg Duration"
              value={formatDuration(s?.avg_duration_s ?? null)}
              color="purple"
            />
            <KpiCard
              icon={<Layers className="h-4 w-4" />}
              label="Batch Items"
              value={String(data.batchItems?.total_items ?? 0)}
              sub={data.batchItems?.success_rate != null
                ? `${data.batchItems.success_rate}% success`
                : undefined}
              color="indigo"
            />
          </div>

          {/* ── Status Breakdown Row ──────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            <MiniStat label="Completed" value={s?.completed ?? 0} color="text-green-600" />
            <MiniStat label="Failed" value={s?.failed ?? 0} color="text-red-500" />
            <MiniStat label="Aborted" value={s?.aborted ?? 0} color="text-amber-500" />
            <MiniStat label="Running" value={s?.running ?? 0} color="text-blue-500" />
          </div>

          {/* ── Daily Execution Chart ─────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Daily Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.daily.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.daily.map((d) => ({ ...d, date: formatDate(d.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" fontSize={11} className="fill-muted-foreground" />
                    <YAxis fontSize={11} className="fill-muted-foreground" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        background: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="completed" stackId="a" fill={CHART_COLORS.completed} radius={[0, 0, 0, 0]} name="Completed" />
                    <Bar dataKey="failed" stackId="a" fill={CHART_COLORS.failed} name="Failed" />
                    <Bar dataKey="aborted" stackId="a" fill={CHART_COLORS.aborted} radius={[3, 3, 0, 0]} name="Aborted" />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-10">No executions in this period</p>
              )}
            </CardContent>
          </Card>

          {/* ── Two-column: Per-agent + Trigger distribution ──── */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Per-agent table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Per-Agent Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {data.perAgent.length > 0 ? (
                  <div className="space-y-2">
                    {data.perAgent.map((a) => (
                      <div key={a.agent_id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <span className="font-medium truncate mr-4">{a.agent_name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-green-600 font-mono text-xs">{a.completed}</span>
                          <span className="text-red-500 font-mono text-xs">{a.failed}</span>
                          <span className="text-muted-foreground text-xs">{formatDuration(a.avg_duration_s)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No data</p>
                )}
              </CardContent>
            </Card>

            {/* Trigger type pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Trigger Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {data.triggerTypes.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.triggerTypes.map((t) => ({
                          name: t.trigger_type ?? 'unknown',
                          value: Number(t.count),
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={11}
                      >
                        {data.triggerTypes.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No data</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Batch Item Stats ───────────────────────────────── */}
          {(data.batchItems?.total_items ?? 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Batch Item Processing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-8">
                  <div>
                    <p className="text-2xl font-bold">{data.batchItems.total_items}</p>
                    <p className="text-xs text-muted-foreground">Total Items Processed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{data.batchItems.completed}</p>
                    <p className="text-xs text-muted-foreground">Succeeded</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{data.batchItems.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  {/* Visual bar */}
                  <div className="flex-1 ml-4">
                    <div className="h-4 rounded-full bg-muted overflow-hidden flex">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${data.batchItems.success_rate ?? 0}%` }}
                      />
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{ width: `${100 - (data.batchItems.success_rate ?? 0)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {data.batchItems.success_rate ?? 0}% success rate
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Recent Failures ────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" /> Recent Failures
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentFailures.length > 0 ? (
                <div className="space-y-2">
                  {data.recentFailures.map((f) => (
                    <div key={f.id} className="flex items-start gap-3 border rounded-md px-3 py-2 text-sm">
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{f.agent_name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {f.trigger_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">
                            {formatDateTime(f.started_at)}
                          </span>
                        </div>
                        {f.error_message && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 truncate">
                            {f.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" /> No recent failures
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'green' | 'purple' | 'indigo';
}) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
    green:  'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400',
  };
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('p-1.5 rounded-md', colorMap[color])}>{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 border rounded-md px-3 py-2">
      <span className={cn('text-lg font-bold font-mono', color)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
