'use client';

import * as React from 'react';
import { Check, ChevronDown, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  TIME_PRESETS, boundToInput, presetBound, timeRangeLabel, type TimePreset,
} from '@/lib/time-range';

export type { TimePreset };

/**
 * Time range control, Cloud-Console style.
 *
 * Sits apart from the filters — top right of the page, not in the filter bar
 * — because it is a different kind of thing. The filters narrow WHICH runs
 * you see; this sets the window they are drawn from. GCP, CloudWatch and
 * Datadog all make the same split, and it is the reason none of them show
 * the time range as a removable filter chip.
 *
 * It owns nothing. `from` and `to` are the caller's state and the only
 * representation of the window (bound formats in lib/time-range.ts). A preset
 * applies a RELATIVE bound ("now-60m"), so "Last hour" keeps meaning the last
 * hour; Custom applies exact local date-times, down to the minute, for finding
 * what happened in a specific window.
 */
export function TimeRangePicker({
  from, to, presets = TIME_PRESETS, label, onApply, disabled,
}: {
  from: string;
  to: string;
  presets?: TimePreset[];
  /** Rendered on the button. Defaults to timeRangeLabel(from, to). */
  label?: string;
  onApply: (from: string, to: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState('');
  const [draftTo, setDraftTo] = React.useState('');

  // Reopening always shows the window that is actually applied (a relative
  // bound resolved to the instant it means now), not a draft abandoned last time.
  React.useEffect(() => {
    if (open) { setDraftFrom(boundToInput(from, 'from')); setDraftTo(boundToInput(to, 'to')); }
  }, [open, from, to]);

  const commit = (nextFrom: string, nextTo: string) => {
    onApply(nextFrom, nextTo);
    setOpen(false);
  };

  // datetime-local values are fixed-width, so string order is time order.
  const customInvalid = !!draftFrom && !!draftTo && draftFrom > draftTo;
  const customEmpty = !draftFrom && !draftTo;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium" disabled={disabled}>
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          {label ?? timeRangeLabel(from, to)}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="py-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => commit(presetBound(p), '')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
            >
              <span className="h-3.5 w-3.5 shrink-0">
                {!to && from === presetBound(p) && <Check className="h-3.5 w-3.5 text-brand" />}
              </span>
              <span className="flex-1 min-w-0 truncate">{p.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => commit('', '')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
          >
            <span className="h-3.5 w-3.5 shrink-0">
              {!from && !to && <Check className="h-3.5 w-3.5 text-brand" />}
            </span>
            <span className="flex-1 min-w-0 truncate">Any time</span>
          </button>
        </div>

        {/* Custom is not a mode you switch into — it is just the two bounds,
            always visible, opening on what is applied. Either may be left
            empty for an open-ended window. */}
        <div className="border-t p-2 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-0.5">
            Custom
          </p>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground px-0.5">From</span>
            <Input
              type="datetime-local" aria-label="Start" value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-8 text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground px-0.5">To</span>
            <Input
              type="datetime-local" aria-label="End" value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-8 text-xs"
            />
          </label>
          {customInvalid && (
            <p className="text-[10px] text-destructive px-0.5">Start is after the end.</p>
          )}
          <Button
            size="sm"
            className={cn('w-full text-xs')}
            disabled={customInvalid || customEmpty}
            onClick={() => commit(draftFrom, draftTo)}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
