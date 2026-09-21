'use client';

import * as React from 'react';
import { Check, ChevronDown, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface TimePreset {
  label: string;
  /** Days back from today. 0 is allowed and means "today". */
  days: number;
}

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
 * representation of the window; a preset is just a button that computes a
 * date and hands it back. There is deliberately no "mode" — nothing here
 * remembers that you picked "Last 7 days" rather than typing that date, so
 * there is nothing that can fall out of step with the dates themselves.
 *
 * Both bounds are inclusive whole days. '' means unbounded on that side.
 */
export function TimeRangePicker({
  from, to, presets, label, onApply, disabled,
}: {
  from: string;
  to: string;
  presets: TimePreset[];
  /** Rendered on the button. The caller derives it from from/to. */
  label: string;
  onApply: (from: string, to: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [draftFrom, setDraftFrom] = React.useState(from);
  const [draftTo, setDraftTo] = React.useState(to);

  // Reopening always shows the window that is actually applied, not a draft
  // abandoned last time.
  React.useEffect(() => {
    if (open) { setDraftFrom(from); setDraftTo(to); }
  }, [open, from, to]);

  const daysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };

  const commit = (nextFrom: string, nextTo: string) => {
    onApply(nextFrom, nextTo);
    setOpen(false);
  };

  // A preset is "active" when the applied window is exactly what it would
  // produce — computed, not remembered.
  const activePreset = (p: TimePreset) => !to && from === daysAgo(p.days);
  const customInvalid = !!draftFrom && !!draftTo && draftFrom > draftTo;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium" disabled={disabled}>
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="py-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => commit(daysAgo(p.days), '')}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
            >
              <span className="h-3.5 w-3.5 shrink-0">
                {activePreset(p) && <Check className="h-3.5 w-3.5 text-brand" />}
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

        {/* Custom is not a mode you switch into — it is just the two dates,
            always visible, always showing what is applied. */}
        <div className="border-t p-2 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-0.5">
            Custom
          </p>
          <div className="flex items-center gap-1.5">
            <Input
              type="date" aria-label="Start date" value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="h-8 text-xs"
            />
            <span className="text-xs text-muted-foreground shrink-0">to</span>
            <Input
              type="date" aria-label="End date" value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          {customInvalid && (
            <p className="text-[10px] text-destructive px-0.5">Start date is after the end date.</p>
          )}
          <Button
            size="sm"
            className={cn('w-full text-xs')}
            disabled={customInvalid || (draftFrom === from && draftTo === to)}
            onClick={() => commit(draftFrom, draftTo)}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
