'use client';

/**
 * A sortable, filterable, multi-select table of targets (agents or logins) with an
 * explicit Save. Used group-first: pick which targets a group covers for a grain,
 * or which agents a client offers. Columns — Name, Tags (agents only), Created —
 * each sort from its header; the Tags header also carries a tag filter. Select-all
 * acts on the filtered rows; Save writes the whole selection at once.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Tag } from '@/lib/api/tags';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ColumnFilter, ColumnFilterOption } from '@/components/ui/column-filter';
import { cn } from '@/lib/utils';
import { InfoHint } from '@/components/ui/info-hint';
import { ArrowUp, ArrowDown, ArrowUpDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ChecklistTarget { id: string; name: string; tags?: Tag[]; createdAt?: string; description?: string | null }

type SortKey = 'name' | 'tags' | 'created';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function TargetChecklist({
  targets, initialSelected, onSave, showTags = false, targetNoun, loading = false,
}: {
  targets: ChecklistTarget[];
  initialSelected: string[];
  onSave: (ids: string[]) => Promise<unknown>;
  showTags?: boolean;
  targetNoun: string;
  loading?: boolean;
}) {
  const initialKey = useMemo(() => [...initialSelected].sort().join(','), [initialSelected]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [baseline, setBaseline] = useState<string>(initialKey);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    setSelected(new Set(initialKey ? initialKey.split(',') : []));
    setBaseline(initialKey);
  }, [initialKey]);

  const allTags = useMemo(() => {
    if (!showTags) return [] as Tag[];
    const m = new Map<string, Tag>();
    targets.forEach((t) => (t.tags ?? []).forEach((tag) => m.set(tag.id, tag)));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, showTags]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = targets.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (tagIds.length && !(t.tags ?? []).some((tag) => tagIds.includes(tag.id))) return false;
      return true;
    });
    const val = (t: ChecklistTarget) =>
      sortKey === 'created' ? (t.createdAt ?? '')
      : sortKey === 'tags' ? (t.tags ?? []).map((x) => x.name).sort().join(',').toLowerCase()
      : t.name.toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  }, [targets, search, tagIds, sortKey, sortDir]);

  const rowIds = rows.map((t) => t.id);
  const allVisibleSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((prev) => {
    if (allVisibleSelected) { const n = new Set(prev); rowIds.forEach((id) => n.delete(id)); return n; }
    return new Set([...prev, ...rowIds]);
  });

  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const currentKey = [...selected].sort().join(',');
  const dirty = currentKey !== baseline;

  const save = async () => {
    setSaving(true);
    try { await onSave([...selected]); setBaseline(currentKey); toast.success('Saved'); }
    catch (err) { toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error)?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <button type="button" onClick={() => sortBy(k)} className={cn('inline-flex items-center gap-1 font-medium hover:text-foreground', active && 'text-foreground', className)}>
        {children}
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-brand' : 'text-muted-foreground/60')} />
      </button>
    );
  };

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, placeholder: `Search ${targetNoun}s…` }}
        right={<>
          <span className="text-xs text-muted-foreground">{selected.size} selected{dirty ? ' · unsaved' : ''}</span>
          <Button onClick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </>}
      />

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2 align-middle"><div className="flex items-center"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} /></div></th>
              <th className="px-3 py-2"><SortHead k="name">Name</SortHead></th>
              {showTags && (
                <th className="w-[34%] px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <SortHead k="tags">Tags</SortHead>
                    <ColumnFilter active={tagIds.length > 0} title="Filter by tag" onClear={() => setTagIds([])}>
                      {allTags.map((tag) => (
                        <ColumnFilterOption
                          key={tag.id}
                          checked={tagIds.includes(tag.id)}
                          onChange={() => setTagIds((prev) => prev.includes(tag.id) ? prev.filter((x) => x !== tag.id) : [...prev, tag.id])}
                        >
                          {tag.name}
                        </ColumnFilterOption>
                      ))}
                      {allTags.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No tags.</p>}
                    </ColumnFilter>
                  </span>
                </th>
              )}
              <th className="w-36 px-3 py-2"><SortHead k="created">Created</SortHead></th>
            </tr>
          </thead>
          <tbody className="max-h-[55vh]">
            {rows.map((t) => (
              <tr key={t.id} className="h-11 cursor-pointer border-b border-border last:border-0 hover:bg-muted/20" onClick={() => toggle(t.id)}>
                <td className="px-3 align-middle" onClick={(e) => e.stopPropagation()}><div className="flex items-center"><Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} /></div></td>
                <td className="px-3 align-middle font-medium text-foreground">
                  <span className="flex min-w-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="truncate">{t.name}</span>
                    {t.description && <InfoHint>{t.description}</InfoHint>}
                  </span>
                </td>
                {showTags && (
                  <td className="px-3 align-middle">
                    <div className="flex flex-wrap gap-1">
                      {(t.tags ?? []).map((tag) => (
                        <span key={tag.id} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tag.name}</span>
                      ))}
                    </div>
                  </td>
                )}
                <td className="px-3 align-middle whitespace-nowrap text-muted-foreground">{fmtDate(t.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showTags ? 4 : 3} className="px-3 py-8 text-center text-sm text-muted-foreground">No {targetNoun}s match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
