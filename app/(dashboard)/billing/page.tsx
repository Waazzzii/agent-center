'use client';

/**
 * Billing & Usage — what the customer pays (markup cost) plus token usage
 * estimates.
 *
 * Data sources:
 *   - Cost: billing_daily_ai.markup_cost_usd / billing_daily_browser.markup_cost_usd,
 *     written by wazzi-backend's nightly sync from the Anthropic Cost API
 *     (AI) and a global hourly rate (browser). These are REAL invoice numbers.
 *   - Tokens: billing_daily_ai.tokens_* columns, aggregated live from
 *     agent_action_log during sync. These are USAGE ESTIMATES derived from
 *     what each prompt returned — they may differ slightly from Anthropic's
 *     own token counts but are close.
 *
 * Per-agent token breakdown comes from a separate /billing/agents endpoint
 * which reads agent_action_log directly for the date range.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import apiClient from '@/lib/api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useBillingRangePresets } from '@/lib/hooks/use-billing-ranges';
import { getBillingCycle, type BillingCycle } from '@/lib/api/billing-cycles';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Receipt, Loader2, Zap, Monitor, Clock, Hash, DollarSign, Info } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function fmtUSD(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01 && n > 0) return '< $0.01';
  return `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtHours(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function shortDate(d: string | Date | unknown): string {
  if (!d) return '';
  const str = d instanceof Date ? d.toISOString().slice(0, 10)
    : typeof d === 'string' ? (d.length > 10 ? d.slice(0, 10) : d)
    : String(d);
  return new Date(str + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Preset ranges now come from useBillingRangePresets — shared with Analytics
// so customers see the same timeframe chips on both pages.

// ─── Types ────────────────────────────────────────────────────

interface AiUsageData {
  totals: {
    direct_cost: number;       // what we pay Anthropic (internal — hidden from customers)
    markup_cost: number;       // what the customer pays
    tokens_in: number;
    tokens_out: number;
    tokens_cache_read: number;
    tokens_cache_write: number;
  };
  daily: {
    date: string;
    direct_cost_usd: number | string;
    markup_cost_usd: number | string;
    markup_multiplier: number | string;
    tokens_in: number | string;
    tokens_out: number | string;
    tokens_cache_read?: number | string;
    tokens_cache_write?: number | string;
  }[];
}

interface BrowserUsageData {
  totals: {
    total_seconds: number;
    session_count: number;
    direct_cost: number;
    markup_cost: number;
  };
  daily: {
    date: string;
    total_seconds: number | string;
    session_count: number | string;
    direct_cost_usd: number | string;
    markup_cost_usd: number | string;
  }[];
}

interface AgentTokens {
  byAgent: {
    agent_id: string;
    agent_name: string;
    runs: number;
    tokens_in: number;
    tokens_out: number;
    tokens_cache_read: number;
    tokens_cache_write: number;
    total_tokens: number;
    pct: number;
  }[];
  grand_total_tokens: number;
}

// ─── Page ─────────────────────────────────────────────────────

export default function BillingPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');

  // Billing cycles — fetched once so "This cycle" / "Last cycle" presets
  // resolve to the real cycle windows, not just the calendar month.
  const [activeCycle, setActiveCycle] = useState<BillingCycle | null>(null);
  const [recentCycles, setRecentCycles] = useState<BillingCycle[]>([]);
  const RANGES = useBillingRangePresets(activeCycle, recentCycles);

  const [rangeIdx, setRangeIdx] = useState(0); // default "This cycle"
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [aiData, setAiData] = useState<AiUsageData | null>(null);
  const [browserData, setBrowserData] = useState<BrowserUsageData | null>(null);
  const [agentData, setAgentData] = useState<AgentTokens | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<'cost' | 'usage'>('cost');

  const isCustom = RANGES[rangeIdx]?.label === 'Custom';
  const range = isCustom
    ? (customFrom && customTo ? { from: customFrom, to: customTo } : null)
    : RANGES[rangeIdx]?.getRange() ?? null;

  // Load billing cycle info once so the presets resolve correctly.
  useEffect(() => {
    if (!selectedOrgId) return;
    getBillingCycle(selectedOrgId)
      .then((data) => {
        setActiveCycle(data.active);
        setRecentCycles(data.recent);
      })
      .catch(() => { /* fallback ranges kick in */ });
  }, [selectedOrgId]);

  const load = useCallback(async () => {
    if (!selectedOrgId || !range) return;
    setLoading(true);
    try {
      const [ai, browser, agents] = await Promise.all([
        apiClient.get(`/admin/organizations/${selectedOrgId}/billing/ai-usage`,      { params: range }),
        apiClient.get(`/admin/organizations/${selectedOrgId}/billing/browser-usage`, { params: range }),
        apiClient.get(`/admin/organizations/${selectedOrgId}/billing/agents`,        { params: range }),
      ]);
      setAiData(ai.data);
      setBrowserData(browser.data);
      setAgentData(agents.data);
    } catch {
      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, rangeIdx, customFrom, customTo, activeCycle, recentCycles]);

  useEffect(() => { load(); }, [load]);

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-5 w-5 text-brand" /> Billing & Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">AI costs, browser VM time, and token usage estimates</p>
        </div>
        <DateRangePicker
          presets={RANGES}
          selectedIndex={rangeIdx}
          customFrom={customFrom}
          customTo={customTo}
          onPresetChange={setRangeIdx}
          onCustomChange={(from, to) => { setCustomFrom(from); setCustomTo(to); }}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="ai">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="ai"><Zap className="h-4 w-4 mr-2" /> AI</TabsTrigger>
            <TabsTrigger value="browser"><Monitor className="h-4 w-4 mr-2" /> Browser</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-4 space-y-4">
            {aiData && agentData && (
              <AiUsageTab data={aiData} agents={agentData} chartMode={chartMode} setChartMode={setChartMode} />
            )}
          </TabsContent>

          <TabsContent value="browser" className="mt-4 space-y-4">
            {browserData && (
              <BrowserUsageTab data={browserData} chartMode={chartMode} setChartMode={setChartMode} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─── AI Usage Tab ─────────────────────────────────────────────

function AiUsageTab({
  data, agents, chartMode, setChartMode,
}: {
  data: AiUsageData;
  agents: AgentTokens;
  chartMode: string;
  setChartMode: (m: 'cost' | 'usage') => void;
}) {
  const t = data.totals;

  const chartData = data.daily.map((d) => ({
    date: shortDate(d.date),
    cost: toNum(d.markup_cost_usd),
    tokens: toNum(d.tokens_in) + toNum(d.tokens_out),
  }));

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={<DollarSign className="h-4 w-4 text-success" />} label="Total Cost"    value={fmtUSD(t.markup_cost)} />
        <SummaryCard icon={<Zap        className="h-4 w-4 text-info" />}    label="Tokens In"     value={fmtTokens(t.tokens_in)}  sub="estimate" />
        <SummaryCard icon={<Zap        className="h-4 w-4 text-brand" />}   label="Tokens Out"    value={fmtTokens(t.tokens_out)} sub="estimate" />
        <SummaryCard icon={<Hash       className="h-4 w-4 text-warning" />} label="Cache Tokens"  value={fmtTokens(t.tokens_cache_read + t.tokens_cache_write)} sub="read + write" />
      </div>

      <EstimateNotice />

      {/* Cost / usage over time */}
      <Card>
        <CardContent className="pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{chartMode === 'cost' ? 'Cost' : 'Token Usage'} Over Time</h3>
            <ChartToggle mode={chartMode} setMode={setChartMode} labels={['Cost', 'Tokens']} />
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => chartMode === 'cost' ? `$${v}` : fmtTokens(v)} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="rounded-md border bg-background px-3 py-1.5 text-xs shadow-md">
                      <div className="text-muted-foreground">{payload[0].payload?.date}</div>
                      <div className="font-semibold">{chartMode === 'cost' ? fmtUSD(v) : fmtTokens(v)}</div>
                    </div>
                  );
                }} />
                <Area
                  type="monotone"
                  dataKey={chartMode === 'cost' ? 'cost' : 'tokens'}
                  stroke={chartMode === 'cost' ? 'oklch(0.58 0.16 150)' : 'oklch(0.52 0.20 295)'}
                  fill={chartMode === 'cost' ? 'oklch(0.58 0.16 150 / 0.12)' : 'oklch(0.52 0.20 295 / 0.12)'}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No data for this period.</p>
          )}
        </CardContent>
      </Card>

      {/* Usage by agent — tokens only (analytics estimate) */}
      <Card>
        <CardContent className="pt-5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold">Usage by Agent</h3>
            <span className="text-[10px] text-muted-foreground">usage estimate</span>
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">
            Token totals per agent across the selected period. Derived from internally recorded usage; not a direct cost breakdown.
          </p>
          {agents.byAgent.length > 0 ? (
            <div className="space-y-2 max-h-[280px] overflow-auto">
              {agents.byAgent.map((a) => (
                <div key={a.agent_id} className="space-y-1 px-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate flex-1 min-w-0">{a.agent_name}</span>
                    <span className="text-muted-foreground tabular-nums ml-2">{a.runs} runs</span>
                    <span className="font-semibold tabular-nums ml-3 w-12 text-right">{a.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-brand/70" style={{ width: `${Math.min(100, a.pct)}%` }} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>In: {fmtTokens(a.tokens_in)}</span>
                    <span>Out: {fmtTokens(a.tokens_out)}</span>
                    {(a.tokens_cache_read + a.tokens_cache_write) > 0 && (
                      <span>Cache: {fmtTokens(a.tokens_cache_read + a.tokens_cache_write)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No agent data.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Browser Usage Tab ────────────────────────────────────────

function BrowserUsageTab({
  data, chartMode, setChartMode,
}: {
  data: BrowserUsageData;
  chartMode: string;
  setChartMode: (m: 'cost' | 'usage') => void;
}) {
  const t = data.totals;
  const totalHours = t.total_seconds / 3600;

  const chartData = data.daily.map((d) => ({
    date: shortDate(d.date),
    cost: toNum(d.markup_cost_usd),
    hours: toNum(d.total_seconds) / 3600,
    sessions: toNum(d.session_count),
  }));

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard icon={<DollarSign className="h-4 w-4 text-success" />} label="Total Cost" value={fmtUSD(t.markup_cost)} />
        <SummaryCard icon={<Clock      className="h-4 w-4 text-info" />}    label="Total Time" value={fmtHours(t.total_seconds)} sub={`${totalHours.toFixed(2)} hours`} />
        <SummaryCard icon={<Monitor    className="h-4 w-4 text-brand" />}   label="Sessions"   value={String(t.session_count)}
          sub={t.session_count > 0 ? `Avg: ${fmtHours(Math.round(t.total_seconds / t.session_count))}/session` : ''} />
      </div>

      <Card>
        <CardContent className="pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">{chartMode === 'cost' ? 'Cost' : 'Usage'} Over Time</h3>
            <ChartToggle mode={chartMode} setMode={setChartMode} labels={['Cost', 'Hours']} />
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => chartMode === 'cost' ? `$${v}` : `${v.toFixed(1)}h`} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="rounded-md border bg-background px-3 py-1.5 text-xs shadow-md">
                      <div className="text-muted-foreground">{payload[0].payload?.date}</div>
                      <div className="font-semibold">{chartMode === 'cost' ? fmtUSD(v) : `${v.toFixed(2)}h`}</div>
                    </div>
                  );
                }} />
                <Area
                  type="monotone"
                  dataKey={chartMode === 'cost' ? 'cost' : 'hours'}
                  stroke={chartMode === 'cost' ? 'oklch(0.58 0.16 150)' : 'oklch(0.52 0.20 295)'}
                  fill={chartMode === 'cost' ? 'oklch(0.58 0.16 150 / 0.12)' : 'oklch(0.52 0.20 295 / 0.12)'}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No browser usage for this period.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Shared components ────────────────────────────────────────

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EstimateNotice() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2 text-xs text-info">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>
        <strong>Token counts are usage estimates</strong> from agent execution logs. Cost
        figures are the actual billable amount — pulled nightly from Anthropic for
        the prior 7 days so lagging price corrections land automatically.
      </span>
    </div>
  );
}

function ChartToggle({ mode, setMode, labels }: { mode: string; setMode: (m: 'cost' | 'usage') => void; labels: [string, string] }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border p-0.5">
      <button
        onClick={() => setMode('cost')}
        className={cn('px-2.5 py-1 rounded text-[10px] font-medium transition-colors',
          mode === 'cost' ? 'bg-brand text-brand-fg' : 'text-muted-foreground hover:bg-muted')}
      >
        {labels[0]}
      </button>
      <button
        onClick={() => setMode('usage')}
        className={cn('px-2.5 py-1 rounded text-[10px] font-medium transition-colors',
          mode === 'usage' ? 'bg-brand text-brand-fg' : 'text-muted-foreground hover:bg-muted')}
      >
        {labels[1]}
      </button>
    </div>
  );
}
