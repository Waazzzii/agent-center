'use client';

/**
 * What an access group covers for one grain (agents it can run / decide on, or
 * logins it can handle): ONLY the assigned targets, in the standard table —
 * search, sortable columns, the Tags funnel, a ⋮ Remove per row. "Add …" opens
 * a large picker over everything not yet assigned (AddTargetsModal).
 *
 * Every change saves immediately (the whole set, via `onSave`) — no separate
 * Save step; a removal offers Undo.
 */

import { useMemo, useState } from 'react';
import type { Tag } from '@/lib/api/tags';
import { Button } from '@/components/ui/button';
import { DataTableToolbar } from '@/components/ui/data-table-toolbar';
import { ColumnFilter, ColumnFilterOption } from '@/components/ui/column-filter';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { InfoHint } from '@/components/ui/info-hint';
import { tagBadgeClass } from '@/components/tags/tag-colors';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AddTargetsModal } from './AddTargetsModal';

export interface ChecklistTarget { id: string; name: string; tags?: Tag[]; createdAt?: string; description?: string | null }

type SortKey = 'name' | 'tags' | 'created';

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const errorText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error)?.message || 'Failed to save';

export function AssignedTargets({
  targets, assignedIds, onSave, showTags = false, targetNoun, groupName,
}: {
  /** Every target that could be assigned (the org's agents, or its logins). */
  targets: ChecklistTarget[];
  assignedIds: string[];
  /** Persist the group's WHOLE set for this grain. */
  onSave: (ids: string[]) => Promise<unknown>;
  showTags?: boolean;
  targetNoun: string;
  groupName: string;
}) {
  const [search, setSearch] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [adding, setAdding] = useState(false);

  const assignedSet = useMemo(() => new Set(assignedIds), [assignedIds]);
  const assigned = useMemo(() => targets.filter((t) => assignedSet.has(t.id)), [targets, assignedSet]);
  const available = useMemo(() => targets.filter((t) => !assignedSet.has(t.id)), [targets, assignedSet]);

  const allTags = useMemo(() => {
    if (!showTags) return [] as Tag[];
    const m = new Map<string, Tag>();
    assigned.forEach((t) => (t.tags ?? []).forEach((tag) => m.set(tag.id, tag)));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [assigned, showTags]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = assigned.filter((t) => {
      if (tagIds.length && !(t.tags ?? []).some((tag) => tagIds.includes(tag.id))) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || (t.tags ?? []).some((tag) => tag.name.toLowerCase().includes(q));
    });
    const val = (t: ChecklistTarget) =>
      sortKey === 'created' ? (t.createdAt ?? '')
      : sortKey === 'tags' ? (t.tags ?? []).map((x) => x.name).sort().join(',').toLowerCase()
      : t.name.toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -dir : x > y ? dir : 0; });
  }, [assigned, search, tagIds, sortKey, sortDir]);

  const onSort = (k: string) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k as SortKey); setSortDir('asc'); }
  };

  const add = async (ids: string[]) => {
    try {
      await onSave([...assignedIds, ...ids.filter((id) => !assignedSet.has(id))]);
      toast.success(`Added ${ids.length} ${targetNoun}${ids.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(errorText(err));
      throw err; // keep the picker open with the selection intact
    }
  };

  const remove = async (t: ChecklistTarget) => {
    const before = assignedIds;
    try {
      await onSave(before.filter((id) => id !== t.id));
      toast.success(`Removed ${t.name}`, {
        action: {
          label: 'Undo',
          onClick: () => { onSave(before).catch((err) => toast.error(errorText(err))); },
        },
      });
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const rowMenu = (t: ChecklistTarget) => (
    // Right-aligned like the Agents table: the w-px column is narrower than the
    // trigger, so it must overflow leftward (into view), not off the table edge.
    <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
      <RowActionsMenu
        title="Actions"
        actions={[{ label: 'Remove from group', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => { void remove(t); } }]}
      />
    </div>
  );

  const filtering = search.trim().length > 0 || tagIds.length > 0;

  return (
    <div className="space-y-3">
      <DataTableToolbar
        search={{ value: search, onChange: setSearch, placeholder: showTags ? `Search assigned ${targetNoun}s or tags…` : `Search assigned ${targetNoun}s…` }}
        right={<>
          <span className="text-xs text-muted-foreground">{assigned.length} assigned</span>
          <Button onClick={() => setAdding(true)} className="gap-1.5" disabled={available.length === 0}>
            <Plus className="h-4 w-4" /> Add {targetNoun}s
          </Button>
        </>}
      />

      <ResponsiveTable<ChecklistTarget>
        data={rows}
        getRowKey={(t) => t.id}
        isFiltered={filtering}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        emptyMessage={filtering
          ? `No assigned ${targetNoun}s match.`
          : `No ${targetNoun}s assigned to this group yet — use “Add ${targetNoun}s”.`}
        columns={[
          {
            key: 'name',
            label: 'Name',
            sortable: true,
            render: (t) => t.name,
            desktopRender: (t) => (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-foreground">{t.name}</span>
                {t.description && <InfoHint>{t.description}</InfoHint>}
              </span>
            ),
          },
          ...(showTags ? [{
            key: 'tags',
            label: 'Tags',
            sortable: true,
            thClassName: 'w-[34%]',
            filter: (
              <ColumnFilter active={tagIds.length > 0} title="Filter by tag" onClear={() => setTagIds([])}>
                {allTags.map((tag) => (
                  <ColumnFilterOption
                    key={tag.id}
                    checked={tagIds.includes(tag.id)}
                    onChange={() => setTagIds((prev) => (prev.includes(tag.id) ? prev.filter((x) => x !== tag.id) : [...prev, tag.id]))}
                  >
                    {tag.name}
                  </ColumnFilterOption>
                ))}
                {allTags.length === 0 && <p className="px-1.5 py-1 text-xs text-muted-foreground">No tags.</p>}
              </ColumnFilter>
            ),
            render: (t: ChecklistTarget) => (t.tags ?? []).map((x) => x.name).join(', ') || '—',
            desktopRender: (t: ChecklistTarget) => (
              <div className="flex flex-wrap gap-1">
                {(t.tags ?? []).map((tag) => (
                  <span key={tag.id} className={cn('rounded border px-1.5 py-0.5 text-[11px]', tagBadgeClass(tag.color))}>{tag.name}</span>
                ))}
              </div>
            ),
          }] : []),
          {
            key: 'created',
            label: 'Created',
            sortable: true,
            thClassName: 'w-36',
            tdClassName: 'whitespace-nowrap text-xs text-muted-foreground',
            render: (t) => fmtDate(t.createdAt),
          },
          {
            key: 'actions',
            label: '',
            thClassName: 'w-px whitespace-nowrap',
            tdClassName: 'w-px whitespace-nowrap',
            render: (t) => rowMenu(t),
            desktopRender: (t) => rowMenu(t),
          },
        ]}
      />

      <AddTargetsModal
        open={adding}
        onOpenChange={setAdding}
        targets={available}
        targetNoun={targetNoun}
        showTags={showTags}
        groupName={groupName}
        onAdd={add}
      />
    </div>
  );
}
