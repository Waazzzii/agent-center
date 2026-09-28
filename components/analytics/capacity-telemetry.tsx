'use client';

/**
 * Capacity telemetry cards for the Usage (analytics) page.
 *
 *   PodResourcesCard — memory / CPU over time for the org's pods, the worker
 *     (browsers) and the runner (runs) viewed separately, against the current
 *     admission thresholds, with the share of the period each pod was gated.
 *   QueueWaitsCard  — how long runs waited to start, and why.
 *
 * Data: GET …/ai-agent/pod-metrics and …/ai-agent/queue-waits (wazzi-backend,
 * migration 368). History starts when the telemetry was deployed.
 */

import { useMemo, useState } from 'react';
import { Cpu, Hourglass } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { PodMetrics, QueueWaits } from '@/lib/api/ai-agent';

const POD_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#a855f7', '#14b8a6', '#f97316'];

function fmtTick(t: string, bucketSeconds: number) {
  const d = new Date(t);
  return bucketSeconds >= 1800
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function fmtSeconds(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0s';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

/** Short pod label: the tail of a k8s pod name is what tells two pods apart. */
function podLabel(pod: string) {
  const parts = pod.split('-');
  return parts.length > 2 ? parts.slice(-2).join('-') : pod;
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded px-2 py-0.5 transition-colors',
            value === o.value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Share of the period a pod was gated: gated samples over all its samples. */
function gatedShareOf(points: { gated_share?: number; samples?: number; gated: boolean }[]) {
  let gated = 0, total = 0;
  for (const p of points) {
    const n = p.samples ?? 1;
    gated += (p.gated_share ?? (p.gated ? 1 : 0)) * n;
    total += n;
  }
  return total ? gated / total : 0;
}

// ─── Pod resources ───────────────────────────────────────────────

export function PodResourcesCard({ metrics }: { metrics: PodMetrics | null }) {
  const [role, setRole] = useState<'worker' | 'runner'>('worker');
  const [metric, setMetric] = useState<'mem' | 'cpu'>('mem');

  const series = useMemo(() => (metrics?.series ?? []).filter((s) => s.role === role), [metrics, role]);
  const hasRunner = (metrics?.series ?? []).some((s) => s.role === 'runner');

  // One row per bucket, one column per pod (percent).
  const rows = useMemo(() => {
    const byT = new Map<string, Record<string, number | string | null>>();
    for (const s of series) {
      for (const p of s.points) {
        const row = byT.get(p.t) ?? { t: p.t };
        const v = metric === 'mem' ? p.mem : p.cpu;
        row[s.pod] = v == null ? null : Math.round(v * 1000) / 10;
        byT.set(p.t, row);
      }
    }
    return [...byT.values()].sort((a, b) => String(a.t).localeCompare(String(b.t)));
  }, [series, metric]);

  const stats = series.map((s) => {
    const vals = s.points.map((p) => (metric === 'mem' ? p.mem_max : p.cpu_max)).filter((v): v is number => v != null);
    const gatedShare = gatedShareOf(s.points);
    return { pod: s.pod, peak: vals.length ? Math.max(...vals) * 100 : null, gatedShare };
  });

  const trip = metrics ? (metric === 'mem' ? metrics.thresholds.memory_trip : metrics.thresholds.cpu_trip) * 100 : null;
  const resume = metrics ? (metric === 'mem' ? metrics.thresholds.memory_resume : metrics.thresholds.cpu_resume) * 100 : null;
  const bucket = metrics?.bucket_seconds ?? 300;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Cpu className="h-4 w-4 text-brand" />
              Pod resources
            </h3>
            <p className="text-xs text-muted-foreground">
              {role === 'worker' ? 'Worker (browsers)' : 'Runner (runs)'} — {metric === 'mem' ? 'memory, % of its limit' : 'CPU, % of its request'}.
              Above the red line it takes no new work.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented value={role} onChange={setRole} options={[{ value: 'worker', label: 'Worker' }, { value: 'runner', label: 'Runner' }]} />
            <Segmented value={metric} onChange={setMetric} options={[{ value: 'mem', label: 'Memory' }, { value: 'cpu', label: 'CPU' }]} />
          </div>
        </div>

        {series.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {role === 'runner' && !hasRunner
              ? 'No runner in this period — this organization’s runs execute in the API.'
              : 'No samples in this period yet. History starts from the telemetry release.'}
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} tickFormatter={(t) => fmtTick(t, bucket)} minTickGap={32} />
                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} />
                <Tooltip
                  labelFormatter={(t) => new Date(String(t)).toLocaleString()}
                  formatter={(v, name) => [`${v ?? '—'}%`, podLabel(String(name))]}
                  contentStyle={{ fontSize: 12 }}
                />
                {trip != null && <ReferenceLine y={trip} stroke="#ef4444" strokeDasharray="4 3" label={{ value: `stop ${Math.round(trip)}%`, fontSize: 10, fill: '#ef4444', position: 'insideTopRight' }} />}
                {resume != null && <ReferenceLine y={resume} stroke="#9ca3af" strokeDasharray="2 3" />}
                {series.map((s, i) => (
                  <Line key={s.pod} type="monotone" dataKey={s.pod} stroke={POD_COLORS[i % POD_COLORS.length]} dot={false} strokeWidth={1.75} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {stats.map((st, i) => (
                <span key={st.pod} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: POD_COLORS[i % POD_COLORS.length] }} />
                  <span className="font-medium text-foreground">{podLabel(st.pod)}</span>
                  peak {st.peak == null ? '—' : `${Math.round(st.peak)}%`}
                  {st.gatedShare > 0 && <span className="text-red-500">· gated {Math.round(st.gatedShare * 100)}% of the time</span>}
                </span>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Queue waits ─────────────────────────────────────────────────

export function QueueWaitsCard({ waits }: { waits: QueueWaits | null }) {
  if (!waits) return null;
  const maxReason = Math.max(1, ...waits.reasons.map((r) => r.total_wait_s));
  const bucketHours = waits.series.length > 1
    ? (new Date(waits.series[1]!.t).getTime() - new Date(waits.series[0]!.t).getTime()) / 3_600_000
    : 1;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Hourglass className="h-4 w-4 text-amber-500" />
            Queue waits
          </h3>
          <p className="text-xs text-muted-foreground">How long runs waited for capacity to start, and why.</p>
        </div>

        {(waits.waiting_now?.length ?? 0) > 0 && (
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="text-xs font-medium">
              {waits.waiting_now!.length} run{waits.waiting_now!.length === 1 ? '' : 's'} waiting now
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {waits.waiting_now!.slice(0, 5).map((w) => (
                <li key={w.id} className="flex justify-between gap-2">
                  <span className="truncate">{w.agent_name ?? w.id.slice(0, 8)}{w.reason ? ` — ${w.reason.replace(/^Waiting for /, 'waiting for ')}` : ''}</span>
                  <span className="shrink-0 tabular-nums">{fmtSeconds(w.waited_s)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(waits.handed_off_runs ?? 0) > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{waits.handed_off_runs} run{waits.handed_off_runs === 1 ? '' : 's'}</span>
            {' '}handed off between pods ({waits.handoffs} hand-off{waits.handoffs === 1 ? '' : 's'}
            {(waits.handoff_wait_s ?? 0) > 0 ? `, ${fmtSeconds(waits.handoff_wait_s ?? 0)} in transit` : ''}) — a draining pod
            passing its runs on between steps. Not a capacity wait.
          </p>
        )}

        {waits.waited === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">
            {(waits.waiting_now?.length ?? 0) > 0
              ? 'No run that started in this period had to wait — the waits above are still in progress.'
              : <>No run waited for capacity in this period{waits.runs ? ` — all ${waits.runs} started as soon as they were queued.` : '.'}</>}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="Runs that waited" value={`${waits.waited} of ${waits.runs}`} />
                <Stat label="Time waiting" value={fmtSeconds(waits.total_wait_s)} />
                <Stat label="Longest" value={fmtSeconds(waits.max_s)} />
                <Stat label="Median wait" value={fmtSeconds(waits.p50_s)} />
                <Stat label="95th percentile" value={fmtSeconds(waits.p95_s)} />
              </div>
              <div className="space-y-1.5">
                {waits.reasons.map((r) => (
                  <div key={r.reason} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate" title={r.reason}>{r.reason.replace(/^Waiting for /, '')}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{r.runs} · {fmtSeconds(r.total_wait_s)}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(r.total_wait_s / maxReason) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={waits.series.map((p) => ({ ...p, minutes: Math.round((p.total_wait_s / 60) * 10) / 10 }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} tickFormatter={(t) => fmtTick(t, bucketHours >= 0.5 ? 1800 : 60)} minTickGap={32} />
                <YAxis tick={{ fontSize: 11 }} unit="m" />
                <Tooltip
                  labelFormatter={(t) => new Date(String(t)).toLocaleString()}
                  formatter={(v, _n, item) => [`${v ?? 0} min across ${(item as any)?.payload?.waited ?? 0} run(s)`, 'Waiting']}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="minutes" fill="#f59e0b" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
