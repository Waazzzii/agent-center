'use client';

import { cn } from '@/lib/utils';

/**
 * A single proportional progress bar for an execution's actions.
 *
 * Replaces the per-action dot strip both views used to render. One dot per
 * action is legible with five of them and useless with forty: the strip grew
 * the row, wrapped, and made two runs of different lengths impossible to
 * compare at a glance. A fixed-width bar filled by percentage is the same
 * size for every run, so the column stays aligned and "how far along is it"
 * reads instantly.
 *
 * ONE colour per bar, matched to the status pill on the same row — blue while
 * running, red if anything failed, green when it all landed. A multi-coloured
 * bar was an extra legend to learn for information the pill already gives;
 * the bar's job is the fraction, the colour's job is to agree with the pill.
 */

// Precedence, most alarming first: a run with one failed action reads as
// failed even if nine others succeeded, which is how the pill treats it too.
function barLook(actions: ProgressAction[]): string {
  const has = (...s: string[]) => actions.some((a) => s.includes(a.status ?? ''));
  if (has('failed', 'rejected')) return 'bg-danger';
  if (has('awaiting_approval', 'paused')) return 'bg-warning animate-pulse';
  if (has('executing', 'running')) return 'bg-info animate-pulse';
  return 'bg-success';
}

export interface ProgressAction {
  status?: string | null;
}

export function ActionProgress({
  actions,
  total,
  className,
  showLabel = true,
}: {
  /** The actions actually loaded — hidden rows should already be filtered out. */
  actions: ProgressAction[];
  /**
   * Denominator when the agent declares more actions than have rows yet
   * (a run still in flight). Never smaller than `actions.length`.
   */
  total?: number;
  /** Track width — defaults to a compact `w-20` for table rows. */
  className?: string;
  showLabel?: boolean;
}) {
  const denom = Math.max(total ?? actions.length, actions.length, 0);

  const count = (pred: (s: string) => boolean) =>
    actions.filter((a) => pred(a.status ?? '')).length;

  const completed = count((s) => s === 'completed' || s === 'approved');
  const failed    = count((s) => s === 'failed' || s === 'rejected');

  // The fill is everything that has finished, whatever way it finished — a
  // run that died on step 3 of 7 is 43% of the way through, shown in red.
  const settled = completed + failed;
  const pct = denom > 0 ? Math.round((settled / denom) * 100) : 0;

  const title =
    denom === 0
      ? 'No actions'
      : `${completed} of ${denom} complete` + (failed ? ` · ${failed} failed` : '');

  return (
    <div className="flex items-center gap-1.5" title={title}>
      <div
        className={cn(
          'flex h-1.5 overflow-hidden rounded-full bg-muted',
          className ?? 'w-20',
        )}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Actions complete"
      >
        {pct > 0 && <span className={cn('h-full', barLook(actions))} style={{ width: `${pct}%` }} />}
      </div>
      {showLabel && (
        // Fixed width + tabular figures so the number can't shift the
        // columns to its right as a run progresses from 9% to 100%.
        <span className="w-7 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/60">
          {denom > 0 ? `${pct}%` : '—'}
        </span>
      )}
    </div>
  );
}
