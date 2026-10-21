'use client';

/**
 * The standard inline column filter: a funnel button in a table header that opens
 * a popover of options. The ONE filter idiom in the Agent Center — column-scoped,
 * enumerable filters (tags, status, trigger, agent) live here, on the column they
 * filter. Range/global filters (date ranges) stay in the toolbar instead.
 *
 * Muted by default, brand-tinted when a filter is active. Pass the option list as
 * children (usually <ColumnFilterOption>s).
 */

import * as React from 'react';
import { Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export function ColumnFilter({
  active = false, title = 'Filter', onClear, children, align = 'start',
}: {
  active?: boolean;
  title?: string;
  onClear?: () => void;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-grid h-5 w-5 place-items-center rounded transition-colors hover:bg-muted hover:text-foreground',
            active ? 'text-brand' : 'text-muted-foreground/60',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between px-1 text-xs">
          <span className="font-medium text-foreground">{title}</span>
          {onClear && active && (
            <button type="button" onClick={onClear} className="text-brand hover:underline">Clear</button>
          )}
        </div>
        <div className="max-h-56 space-y-0.5 overflow-y-auto">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** A checkbox row inside a ColumnFilter popover. */
export function ColumnFilterOption({
  checked, onChange, children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span>{children}</span>
    </label>
  );
}
