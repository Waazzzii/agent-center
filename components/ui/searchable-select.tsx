'use client';

/**
 * A single-select picker with a search box and a bounded, scrolling list.
 *
 * Exists because the routine editor's entity pickers (AI skills, browser
 * skills, logins, approvals, sub-agents) are plain Radix Selects: the list
 * renders every row with no height cap and no way to search. That is fine with
 * six of something and unusable with sixty — the operator scrolls a wall of
 * names looking for one, and on a long list the popover runs off the screen.
 *
 * Not built on Radix Select. Select owns keystrokes for its own typeahead, so
 * an input nested inside it never reliably receives what you type. Popover +
 * Input + a filtered list is the shape that actually works, and it's the same
 * pattern a Command palette would give us without adding cmdk as a dependency.
 *
 * Deliberately small: single selection, string values, optional per-option
 * hint line. Multi-select and grouping can be added when something needs them.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  /** Second line — a description, step count, or anything that disambiguates. */
  hint?: string;
}

interface Props {
  options: SearchableOption[];
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown when there are no options at all (as opposed to no search matches). */
  emptyLabel?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  /** Show the search box only once the list is long enough to need it. */
  searchThreshold?: number;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyLabel = 'Nothing to choose from yet',
  searchPlaceholder = 'Search by name…',
  disabled = false,
  className,
  searchThreshold = 7,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const showSearch = options.length >= searchThreshold;

  // Match on the hint too: people search for "work order" and the words they
  // remember are often in the description, not the name.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Focus the search box once the popover has mounted — a DOM side effect,
  // which is what an effect is for. The query itself is cleared in
  // onOpenChange below rather than here: resetting state inside an effect
  // costs an extra render pass for something an event already knows about.
  useEffect(() => {
    if (!open || !showSearch) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, showSearch]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Clear on close — a stale filter makes the list look empty for no
        // visible reason the next time it opens.
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Width matched to the trigger so the popover can't overflow its column. */}
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {showSearch && (
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
              // Enter on a single remaining match selects it — the fast path
              // for someone who typed enough to be unambiguous.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filtered.length === 1) {
                  e.preventDefault();
                  onChange(filtered[0].value);
                  setOpen(false);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>
        )}
        {/* Bounded height — the whole point. ~9 rows then scroll. */}
        <div className="max-h-[280px] overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{emptyLabel}</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No match for “{query}”</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'flex w-full items-start gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent',
                  o.value === value && 'bg-accent/50',
                )}
              >
                <Check className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block truncate text-[11px] text-muted-foreground">{o.hint}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
        {showSearch && filtered.length > 0 && (
          <div className="border-t px-3 py-1 text-[11px] text-muted-foreground">
            {filtered.length} of {options.length}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
