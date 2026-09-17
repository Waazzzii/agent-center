'use client';

import * as React from 'react';
import { Search, Plus, ChevronLeft, Check, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface FilterOption { value: string; label: string; hint?: string }

export interface FilterKind {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Omit for a date filter — the second step renders a date input instead. */
  options?: FilterOption[];
  /** Currently applied value, for the tick and the "already set" hint. */
  current?: string | null;
  /** Shown in the type list when there is nothing to choose from. */
  emptyHint?: string;
}

/**
 * One button for every filter, chosen in two steps: which field, then which
 * value.
 *
 * The bar this replaced had six controls sitting side by side — status,
 * trigger, agent, tag, from, to — each its own dropdown, each with its own
 * empty state, and the row wrapped onto a second line as soon as the window
 * got narrow. The agent list in particular was a plain scrolling menu: fine at
 * five agents, unusable at sixty, with no way to type.
 *
 * So the cost moves from "read six controls every time" to "one extra click
 * when you actually want to filter", and every value list gets a search box for
 * free.
 *
 * SINGLE select, deliberately. Applying a value REPLACES whatever that field
 * held, which keeps the filter state a flat map and the query a plain equality.
 * The multi-select status menu it replaced could express "executing OR queued",
 * which read as flexible and mostly produced accidental combinations nobody
 * meant. The summary cards above still apply status GROUPS — that is a
 * deliberate named set, not a pile of ticks.
 */
export function FilterPicker({
  kinds, onApply, align = 'start',
}: {
  kinds: FilterKind[];
  /** value '' clears that field. */
  onApply: (key: string, value: string) => void;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = React.useState(false);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [dateValue, setDateValue] = React.useState('');

  const active = kinds.find((k) => k.key === activeKey) ?? null;

  // Always reopen on the type list. Resuming inside whichever field was chosen
  // last is disorienting when the button looks the same either way.
  React.useEffect(() => {
    if (!open) { setActiveKey(null); setQuery(''); setDateValue(''); }
  }, [open]);

  const choose = (k: FilterKind) => {
    setActiveKey(k.key);
    setQuery('');
    setDateValue(k.options ? '' : (k.current ?? ''));
  };

  const apply = (value: string) => {
    onApply(active!.key, value);
    setOpen(false);
  };

  const visible = React.useMemo(() => {
    if (!active?.options) return [];
    const q = query.trim().toLowerCase();
    const sorted = [...active.options].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true }));
    return q ? sorted.filter((o) => o.label.toLowerCase().includes(q)) : sorted;
  }, [active, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs border-dashed">
          <Plus className="h-3 w-3" /> Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        {!active ? (
          <div className="py-1">
            {kinds.map((k) => {
              const Icon = k.icon;
              const empty = k.options && k.options.length === 0;
              return (
                <button
                  key={k.key}
                  type="button"
                  disabled={empty}
                  onClick={() => choose(k)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                    empty ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/60',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{k.label}</span>
                  {empty ? (
                    <span className="text-[10px] text-muted-foreground">{k.emptyHint ?? 'none'}</span>
                  ) : k.current ? (
                    <span className="text-[10px] text-brand truncate max-w-[90px]">
                      {k.options?.find((o) => o.value === k.current)?.label ?? k.current}
                    </span>
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-1 border-b px-2 py-1.5">
              <Button
                variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                onClick={() => setActiveKey(null)}
                title="Back"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs font-medium">{active.label}</span>
              {active.current && (
                <button
                  type="button"
                  onClick={() => apply('')}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-destructive"
                >
                  Clear
                </button>
              )}
            </div>

            {active.options ? (
              <>
                <div className="p-2 pb-1">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`Search ${active.label.toLowerCase()}…`}
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {visible.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Nothing matches &ldquo;{query}&rdquo;.
                    </p>
                  ) : visible.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => apply(o.value)}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
                    >
                      <span className="h-3.5 w-3.5 shrink-0">
                        {o.value === active.current && <Check className="h-3.5 w-3.5 text-brand" />}
                      </span>
                      <span className="flex-1 min-w-0 truncate">{o.label}</span>
                      {o.hint && <span className="text-[10px] text-muted-foreground shrink-0">{o.hint}</span>}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="p-2 space-y-2">
                <Input
                  type="date"
                  autoFocus
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && dateValue) apply(dateValue); }}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="w-full text-xs" disabled={!dateValue} onClick={() => apply(dateValue)}>
                  Apply
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
