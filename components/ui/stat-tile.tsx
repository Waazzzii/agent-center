'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { TONE_TEXT, type StatusTone } from '@/components/execution/status';

/**
 * A summary number that doubles as a filter.
 *
 * The tone lives in the icon and, when selected, the ring — not in a
 * coloured count chip. A row of four saturated chips read as four alerts.
 */
export function StatTile({
  label, value, icon: Icon, tone, hint, live, selected, onClick,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: StatusTone;
  hint?: string;
  live?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group flex flex-col gap-1 rounded-lg border bg-card px-4 py-3 text-left transition-colors',
        'hover:border-border-strong hover:bg-muted/30',
        selected && 'border-brand/50 ring-1 ring-brand/30 bg-brand-soft/30',
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn('h-3.5 w-3.5', TONE_TEXT[tone], live && 'animate-pulse')} />
        {label}
      </span>
      <span className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value.toLocaleString()}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );
}
