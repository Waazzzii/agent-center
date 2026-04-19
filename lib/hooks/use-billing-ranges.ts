/**
 * Shared timeframe presets for the Billing + Analytics pages.
 *
 * Both pages use the same picker so customers get a consistent mental model:
 *   [ This cycle ] [ Last cycle ] [ 7d ] [ 14d ] [ 30d ] [ 90d ] [ 📅 Custom ]
 *
 * "This cycle" / "Last cycle" come from the org's billing_cycles rows —
 * when we haven't loaded them yet the button falls back to the current
 * or previous month. Once the fetch lands, the buttons resolve to the
 * real cycle windows.
 */

import { useMemo } from 'react';
import type { RangePreset } from '@/components/ui/date-range-picker';
import type { BillingCycle } from '@/lib/api/billing-cycles';

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }

function daysAgoPreset(label: string, days: number): RangePreset {
  return {
    label,
    getRange: () => {
      const n = new Date();
      return {
        from: dateStr(new Date(n.getTime() - days * 86_400_000)),
        to: dateStr(n),
      };
    },
  };
}

function currentMonthRange() {
  const n = new Date();
  return { from: dateStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: dateStr(n) };
}
function previousMonthRange() {
  const n = new Date();
  const start = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const end   = new Date(n.getFullYear(), n.getMonth(), 0); // last day of prev month
  return { from: dateStr(start), to: dateStr(end) };
}

/**
 * Build the preset list, given the currently-active billing cycle and the
 * most recent closed cycle. When cycles aren't known yet we fall back to
 * current/previous calendar month so the picker still works on first render.
 */
export function useBillingRangePresets(
  activeCycle: BillingCycle | null,
  recentCycles: BillingCycle[],
): RangePreset[] {
  return useMemo(() => {
    const presets: RangePreset[] = [];

    // This cycle — active row, or current month as fallback
    presets.push({
      label: 'This cycle',
      getRange: () => {
        if (activeCycle) {
          // cycle_end is exclusive, but for display we include up to today
          const today = dateStr(new Date());
          const to = activeCycle.cycle_end <= today ? activeCycle.cycle_end : today;
          return { from: activeCycle.cycle_start, to };
        }
        return currentMonthRange();
      },
    });

    // Last cycle — most recent closed row, or previous month as fallback
    presets.push({
      label: 'Last cycle',
      getRange: () => {
        const last = recentCycles[0];
        if (last) return { from: last.cycle_start, to: last.cycle_end };
        return previousMonthRange();
      },
    });

    // Short-form rolling windows (match the analytics picker style)
    presets.push(daysAgoPreset('7d',  7));
    presets.push(daysAgoPreset('14d', 14));
    presets.push(daysAgoPreset('30d', 30));
    presets.push(daysAgoPreset('90d', 90));

    // Custom — sentinel (getRange returns null)
    presets.push({ label: 'Custom', getRange: () => null });

    return presets;
  }, [activeCycle, recentCycles]);
}
