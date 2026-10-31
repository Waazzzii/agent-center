'use client';

/**
 * ProxyIpsCard — the org's dedicated proxy IPs on the Usage page: script runs
 * through each in the period, the share that failed, how many browsers used it
 * and are on it now, and how many rotated onto it (migration 449).
 *
 * Counted per IP the run actually used, so a browser that rotates is counted on
 * each IP it ran through. Runs from before per-IP tracking carry no IP and are
 * not counted. Renders nothing for an org without proxy IPs.
 */

import { Globe2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ProxyIpStats } from '@/lib/api/ai-agent';

/** At or above this share, an IP is shown as failing (the alert's default). */
const FAILING = 0.3;

function pct(rate: number | null) {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

export function ProxyIpsCard({ stats }: { stats: ProxyIpStats | null }) {
  if (!stats || stats.ips.length === 0) return null;
  const totalRuns = stats.ips.reduce((n, i) => n + i.runs, 0);

  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Globe2 className="h-4 w-4 text-brand" />
              Proxy IPs
            </h3>
            <p className="text-xs text-muted-foreground">
              Runs that went through each IP, and the share that failed there. An IP failing often may be
              throttled — rotation moves browsers off it.
            </p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {stats.rotations} rotation{stats.rotations === 1 ? '' : 's'} in this period
          </span>
        </div>

        {totalRuns === 0 && (
          <p className="mb-2 text-xs text-muted-foreground">No script runs went through a proxy IP in this period.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">IP</th>
                <th className="py-1.5 pr-3 font-medium">Location</th>
                <th className="py-1.5 pr-3 text-right font-medium">Runs</th>
                <th className="py-1.5 pr-3 text-right font-medium">Failed</th>
                <th className="py-1.5 pr-3 text-right font-medium">Browsers</th>
                <th className="py-1.5 pr-3 text-right font-medium">Rotated in</th>
                <th className="py-1.5 text-right font-medium">On it now</th>
              </tr>
            </thead>
            <tbody>
              {stats.ips.map((i) => {
                const failing = i.failure_rate !== null && i.failure_rate >= FAILING && i.runs >= 5;
                return (
                  <tr key={i.id} className="border-b last:border-0 align-top">
                    <td className="py-1.5 pr-3">
                      <span className="font-mono">{i.ip}</span>
                      <span className="font-mono text-xs text-muted-foreground">:{i.port}</span>
                      {!i.available && <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-500">unreachable</span>}
                      {failing && i.last_failure && (
                        <p className="max-w-[420px] truncate text-xs text-muted-foreground" title={i.last_failure}>
                          Latest: {i.last_failure}
                        </p>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                      {[i.city, i.region].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{i.runs}</td>
                    <td className={cn('py-1.5 pr-3 text-right tabular-nums', failing && 'font-medium text-red-600 dark:text-red-400')}>
                      {pct(i.failure_rate)}
                      {i.failures > 0 && <span className="ml-1 text-xs text-muted-foreground">({i.failures})</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{i.browsers_used}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{i.rotations_in}</td>
                    <td className="py-1.5 text-right tabular-nums">{i.browsers_now}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
