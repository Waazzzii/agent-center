'use client';

/**
 * TagFilter — a dropdown multi-select used above list views to filter by tag.
 * Composes with the page's existing search box. Supports match-any (default)
 * and match-all. Purely presentational: the page owns the selected ids +
 * match mode and refetches when they change.
 *
 * Rendered via Popover (portaled) so it escapes any overflow-hidden ancestor
 * (e.g. the list Card) and collision-flips/right-aligns instead of running off
 * screen. Includes a search box for finding tags fast and caps its height so
 * long vocabularies don't scroll forever.
 */

import { useState } from 'react';
import { Check, ChevronDown, Search, Tag as TagIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Tag } from '@/lib/api/tags';
import { tagSwatchClass } from './tag-colors';

interface TagFilterProps {
  tags: Tag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  match: 'any' | 'all';
  onMatchChange: (match: 'any' | 'all') => void;
}

export function TagFilter({ tags, selected, onChange, match, onMatchChange }: TagFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
  };

  const count = selected.length;
  const q = query.trim().toLowerCase();
  const visible = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5', count > 0 && 'border-brand/40 text-brand')}
        >
          <TagIcon className="h-3.5 w-3.5" />
          Tags
          {count > 0 && (
            <span className="ml-0.5 rounded-full bg-brand px-1.5 text-[10px] font-semibold text-brand-fg">
              {count}
            </span>
          )}
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-0">
        {/* Match mode + clear */}
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="inline-flex rounded-md border p-0.5 text-[11px]">
            {(['any', 'all'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onMatchChange(m)}
                className={cn(
                  'rounded px-2 py-0.5 capitalize transition-colors',
                  match === m ? 'bg-brand text-brand-fg' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {m === 'any' ? 'Match any' : 'Match all'}
              </button>
            ))}
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        {/* Search */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
        </div>

        {/* Capped at ~10 rows or half the viewport, whichever is smaller. */}
        <div className="max-h-[min(20rem,50vh)] overflow-auto py-1">
          {tags.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-muted-foreground">No tags yet.</div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-muted-foreground">No tags match “{query}”.</div>
          ) : (
            visible.map((t) => {
              const isSelected = selected.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
                >
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    isSelected ? 'border-brand bg-brand' : 'border-border',
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-brand-fg" />}
                  </span>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', tagSwatchClass(t.color))} />
                  <span className={cn('flex-1 truncate', isSelected && 'font-medium')}>{t.name}</span>
                  {typeof t.usage_count === 'number' && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">{t.usage_count}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
