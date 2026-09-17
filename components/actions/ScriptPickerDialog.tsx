'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, Check, FileText, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { BrowserScript } from '@/lib/api/scripts';

/**
 * Choose a script for a login slot. Choosing is ALL it does.
 *
 * A native select was fine at three scripts and unusable at twenty: no search,
 * and no way to see what a script was without selecting it — which, on a login,
 * silently repointed the login. Managing them (record, edit, delete) lives on
 * the Login Scripts page instead, so nothing in this dialog can change anything
 * except which script this login uses, and that only by clicking a row.
 */
export function ScriptPickerDialog({
  open, onOpenChange, title, description, scripts, value,
  onSelect, manageHref, manageLabel = 'Manage login scripts',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  scripts: BrowserScript[];
  value: string | null;
  onSelect: (id: string | null) => void;
  /** Where recording, editing and deleting actually happen. */
  manageHref: string;
  manageLabel?: string;
}) {
  const [query, setQuery] = React.useState('');

  // Clear the search each time it opens. A query left over from last time hides
  // rows for a reason the operator cannot see.
  React.useEffect(() => { if (open) setQuery(''); }, [open]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    // Alphabetical, case-insensitive, numeric-aware so "Step 2" sorts before
    // "Step 10" — these get named in sequences often enough to matter.
    const sorted = [...scripts].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    if (!q) return sorted;
    return sorted.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  }, [scripts, query]);

  const choose = (id: string) => { onSelect(id); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription className="text-xs">{description}</DialogDescription>}
        </DialogHeader>

        <div className="px-6 pb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or description…"
              className="pl-8"
            />
          </div>
        </div>

        {/* Fixed height, always scrollable. A list that grows with the dialog
            puts the footer — where "Manage login scripts" lives — below the
            fold at twenty scripts, and moves it every time you type in the
            search box. */}
        <div className="h-[22rem] overflow-y-auto px-6 pb-2">
          {visible.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {scripts.length === 0 ? (
                <>
                  No login scripts yet.{' '}
                  <Link href={manageHref} className="text-brand hover:underline">Record one →</Link>
                </>
              ) : (
                <>Nothing matches “{query}”.</>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {visible.map((s) => {
                const isSelected = s.id === value;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => choose(s.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-md border px-3 h-[58px] text-left transition-colors',
                      isSelected ? 'border-brand bg-brand/5' : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="h-4 w-4 shrink-0">
                      {isSelected
                        ? <Check className="h-4 w-4 text-brand" />
                        : <FileText className="h-4 w-4 text-muted-foreground/40" />}
                    </div>
                    {/* Every row the same height: name on one line, everything
                        else on a second that truncates at the edge. A
                        two-line description made rows jump between one and
                        three lines, so the list could not be scanned and the
                        scroll position meant nothing. */}
                    <div className="min-w-0 flex-1">
                      {/* The name carries the full description on hover as
                          well as the truncated line below — the name is the
                          bigger target and the thing you point at first. */}
                      <div
                        className="text-sm font-medium truncate"
                        title={s.description ? `${s.name}

${s.description}` : s.name}
                      >
                        {s.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0">
                          {s.steps?.length ?? 0} step{(s.steps?.length ?? 0) === 1 ? '' : 's'}
                        </span>
                        {s.updated_at && (
                          <span className="shrink-0">· {new Date(s.updated_at).toLocaleDateString()}</span>
                        )}
                        {s.description && (
                          <span className="truncate text-muted-foreground/80" title={s.description}>
                            · {s.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-3 sm:justify-between">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={manageHref}>
              <Settings2 className="h-3.5 w-3.5 mr-1" /> {manageLabel}
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
