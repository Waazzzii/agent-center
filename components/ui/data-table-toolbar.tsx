'use client';

/**
 * Standard toolbar that sits ABOVE every list/table in the Agent Center.
 * Left: the shared search box. Right: a slot for global controls (a time-range
 * picker, a "New …" button) — never per-column filters, which live inline on the
 * column headers (see ColumnFilter). Keeping this one component is what stops the
 * pages drifting: change the search placement or style here and every list updates.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

export function TableSearch({
  value, onChange, placeholder = 'Search…', className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full max-w-xs', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function DataTableToolbar({
  search, right, children, className,
}: {
  /** When set, renders the standard search box on the left. */
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  /** Global controls, pushed to the right (time range, New button, count). */
  right?: React.ReactNode;
  /** Extra controls placed just after search (rare). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {search && (
        <TableSearch value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
      )}
      {children}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
