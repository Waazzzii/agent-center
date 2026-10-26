'use client';

/**
 * The "add" half of assigning targets (agents or logins) to an access group:
 * a large, scrolling picker over the targets NOT yet assigned. One search box
 * matches a target's name, description OR any of its tag names; the tag chips
 * underneath narrow to targets carrying any picked tag. Select-all acts on what
 * is showing. Nothing is written until "Add", which hands back only the ids
 * picked — the caller merges them into the group.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Tag } from '@/lib/api/tags';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableSearch } from '@/components/ui/data-table-toolbar';
import { InfoHint } from '@/components/ui/info-hint';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { tagBadgeClass } from '@/components/tags/tag-colors';
import { cn } from '@/lib/utils';
import { Loader2, Plus } from 'lucide-react';
import type { ChecklistTarget } from './AssignedTargets';

export function AddTargetsModal({
  open, onOpenChange, targets, targetNoun, showTags, groupName, onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The targets that can still be added (already-assigned ones excluded by the caller). */
  targets: ChecklistTarget[];
  targetNoun: string;
  showTags: boolean;
  groupName: string;
  onAdd: (ids: string[]) => Promise<unknown>;
}) {
  const [search, setSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // A fresh picker every time it opens.
  useEffect(() => {
    if (open) { setSearch(''); setTagIds([]); setPicked(new Set()); }
  }, [open]);

  const allTags = useMemo(() => {
    if (!showTags) return [] as Tag[];
    const m = new Map<string, Tag>();
    targets.forEach((t) => (t.tags ?? []).forEach((tag) => m.set(tag.id, tag)));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, showTags]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return targets
      .filter((t) => {
        if (tagIds.length && !(t.tags ?? []).some((tag) => tagIds.includes(tag.id))) return false;
        if (!q) return true;
        return t.name.toLowerCase().includes(q)
          || (t.description ?? '').toLowerCase().includes(q)
          || (t.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, search, tagIds]);

  const rowIds = rows.map((t) => t.id);
  const allShownPicked = rowIds.length > 0 && rowIds.every((id) => picked.has(id));
  const someShownPicked = rowIds.some((id) => picked.has(id));

  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleShown = () => setPicked((prev) => {
    const n = new Set(prev);
    if (allShownPicked) rowIds.forEach((id) => n.delete(id)); else rowIds.forEach((id) => n.add(id));
    return n;
  });
  const toggleTag = (id: string) => setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const add = async () => {
    if (!picked.size) return;
    setAdding(true);
    try { await onAdd([...picked]); onOpenChange(false); }
    catch { /* the caller reported it; stay open with the selection intact */ }
    finally { setAdding(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!adding) onOpenChange(o); }}>
      <DialogContent className="flex h-[85vh] flex-col gap-4 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add {targetNoun}s to {groupName}</DialogTitle>
          <DialogDescription>
            Search by name{showTags ? ' or tag' : ''}, pick as many as you need, then add them in one go.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder={showTags ? `Search ${targetNoun}s or tags…` : `Search ${targetNoun}s…`}
            className="max-w-none"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Tags</span>
              {allTags.map((tag) => {
                const on = tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                      on ? 'border-brand bg-brand/10 text-brand' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {tagIds.length > 0 && (
                <button type="button" onClick={() => setTagIds([])} className="ml-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-muted/40 px-3 text-xs text-muted-foreground">
            <Checkbox
              checked={allShownPicked ? true : someShownPicked ? 'indeterminate' : false}
              onCheckedChange={toggleShown}
              disabled={rowIds.length === 0}
              aria-label="Select all shown"
            />
            <span className="font-medium">{rows.length} {targetNoun}{rows.length === 1 ? '' : 's'}{search || tagIds.length ? ' match' : ' available'}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.map((t) => (
              <label
                key={t.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0 hover:bg-muted/30"
              >
                <Checkbox checked={picked.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{t.name}</span>
                  {t.description && <InfoHint>{t.description}</InfoHint>}
                </span>
                {showTags && (
                  <span className="hidden max-w-[45%] flex-wrap justify-end gap-1 sm:flex">
                    {(t.tags ?? []).map((tag) => (
                      <span key={tag.id} className={cn('rounded border px-1.5 py-0.5 text-[11px]', tagBadgeClass(tag.color))}>{tag.name}</span>
                    ))}
                  </span>
                )}
              </label>
            ))}
            {rows.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {targets.length === 0 ? `Every ${targetNoun} is already in this group.` : `No ${targetNoun}s match.`}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">{picked.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>Cancel</Button>
            <Button onClick={add} disabled={!picked.size || adding} className="gap-1.5">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {picked.size ? `Add ${picked.size} ${targetNoun}${picked.size === 1 ? '' : 's'}` : 'Add'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
