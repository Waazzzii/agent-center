'use client';

/**
 * Single-select inline column filter: a header funnel whose popover is a
 * searchable option list (one value at a time; picking one replaces the last,
 * Clear removes it). The counterpart to ColumnFilter (multi-select checkboxes) —
 * use this for status / agent / trigger columns on the feed grids, so their
 * filters live on the column they filter instead of a separate toolbar control.
 */

import * as React from 'react';
import { Filter, Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export interface ColumnSelectOption { value: string; label: string }

export function ColumnSelectFilter({
  title, value, onChange, options, searchable = true, icon: Icon = Filter,
}: {
  title: string;
  value: string | null;
  /** '' clears the filter. */
  onChange: (value: string) => void;
  options: ColumnSelectOption[];
  searchable?: boolean;
  /** Trigger icon — defaults to the funnel. Pass a distinct one (e.g. Tag) when
   *  two filters share a column, so they don't read as duplicate funnels. */
  icon?: React.ElementType;
}) {
  const [query, setQuery] = React.useState('');
  const active = !!value;
  const q = query.trim().toLowerCase();
  const visible = React.useMemo(() => {
    const sorted = [...options].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));
    return q ? sorted.filter((o) => o.label.toLowerCase().includes(q)) : sorted;
  }, [options, q]);
  const showSearch = searchable && options.length > 8;

  return (
    <Popover onOpenChange={(o) => { if (!o) setQuery(''); }}>
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
          <Icon className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <span className="font-medium text-foreground">{title}</span>
          {active && <button type="button" onClick={() => onChange('')} className="text-brand hover:underline">Clear</button>}
        </div>
        {showSearch && (
          <div className="p-2 pb-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="h-8 pl-7 text-xs" />
            </div>
          </div>
        )}
        <div className="max-h-64 overflow-y-auto py-1">
          {visible.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nothing matches.</p>
          ) : visible.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
            >
              <span className="h-3.5 w-3.5 shrink-0">{o.value === value && <Check className="h-3.5 w-3.5 text-brand" />}</span>
              <span className="flex-1 truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
