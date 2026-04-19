'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }

export interface DateRange {
  from: string;
  to: string;
}

export interface RangePreset {
  label: string;
  getRange: () => DateRange | null; // null = custom sentinel
}

const DEFAULT_PRESETS: RangePreset[] = [
  { label: 'This month', getRange: () => { const n = new Date(); return { from: dateStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: dateStr(n) }; }},
  { label: 'Last month', getRange: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1); return { from: dateStr(s), to: dateStr(new Date(n.getFullYear(), n.getMonth(), 0)) }; }},
  { label: 'Last 7 days', getRange: () => { const n = new Date(); return { from: dateStr(new Date(n.getTime() - 7 * 86400000)), to: dateStr(n) }; }},
  { label: 'Last 30 days', getRange: () => { const n = new Date(); return { from: dateStr(new Date(n.getTime() - 30 * 86400000)), to: dateStr(n) }; }},
  { label: 'Last 90 days', getRange: () => { const n = new Date(); return { from: dateStr(new Date(n.getTime() - 90 * 86400000)), to: dateStr(n) }; }},
];

interface Props {
  presets?: RangePreset[];
  selectedIndex: number;
  customFrom: string;
  customTo: string;
  onPresetChange: (index: number) => void;
  onCustomChange: (from: string, to: string) => void;
  /** Min date for custom picker, default 18 months back */
  minDate?: string;
}

export function DateRangePicker({
  presets = DEFAULT_PRESETS,
  selectedIndex,
  customFrom,
  customTo,
  onPresetChange,
  onCustomChange,
  minDate,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingFrom, setPendingFrom] = useState(customFrom);
  const [pendingTo, setPendingTo] = useState(customTo);

  const min = minDate || dateStr(new Date(Date.now() - 548 * 86400000));
  const today = dateStr(new Date());

  // Check if this is the "Custom" sentinel (last preset returns null)
  const isCustom = presets[selectedIndex]?.getRange() === null;
  const hasCustomLabel = isCustom && customFrom && customTo;

  const openCustomDialog = (idx: number) => {
    onPresetChange(idx);
    setPendingFrom(customFrom || dateStr(new Date(Date.now() - 30 * 86400000)));
    setPendingTo(customTo || today);
    setDialogOpen(true);
  };

  const applyCustom = () => {
    if (pendingFrom && pendingTo) {
      onCustomChange(pendingFrom, pendingTo);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {presets.map((r, i) => {
          const isCustomPreset = r.getRange() === null;
          return (
            <button
              key={r.label}
              onClick={() => isCustomPreset ? openCustomDialog(i) : onPresetChange(i)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                selectedIndex === i
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {isCustomPreset && hasCustomLabel ? (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {shortDate(customFrom)} – {shortDate(customTo)}
                </span>
              ) : isCustomPreset ? (
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Custom
                </span>
              ) : (
                r.label
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Custom Date Range</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Input
                type="date"
                value={pendingFrom}
                min={min}
                max={pendingTo || today}
                onChange={(e) => setPendingFrom(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Input
                type="date"
                value={pendingTo}
                min={pendingFrom || min}
                max={today}
                onChange={(e) => setPendingTo(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={applyCustom} disabled={!pendingFrom || !pendingTo}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function shortDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
