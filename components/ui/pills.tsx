'use client';

/**
 * Pills — a compact segmented control. Symmetric padding on every pill (no
 * leading-icon imbalance): the icon+label sit centered as one block.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PillOption {
  value: string;
  label: string;
  icon?: React.ElementType;
}

export function Pills({
  options, value, onChange, className,
}: {
  options: PillOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1', className)}>
      {options.map((o) => {
        const Icon = o.icon;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className={cn('h-3.5 w-3.5', active ? 'text-brand' : 'text-muted-foreground')} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
