'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { listAiSteps, deleteAiStep, updateAiStep, type AiStep } from '@/lib/api/ai-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Sparkles, Loader2, Search, Tag as TagIcon } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useTags } from '@/lib/hooks/use-tags';
import { TagFilter } from '@/components/tags/tag-filter';
import { TagList } from '@/components/tags/tag-badge';
import { TagAssignDialog } from '@/components/tags/tag-assign-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';

type SortKey = 'name' | 'model';

export default function AiStepsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();
  const router = useRouter();

  const [items, setItems] = useState<AiStep[]>([]);
  // Only gates the first-load spinner — filter/search reloads update in place.
  const [initialLoad, setInitialLoad] = useState(true);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { tags } = useTags(selectedOrgId);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<'any' | 'all'>('any');
  const [tagDialogStep, setTagDialogStep] = useState<AiStep | null>(null);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setItems(await listAiSteps(selectedOrgId, { tagIds: tagFilter, tagMatch }));
    } catch {
      toast.error('Failed to load AI steps');
    } finally {
      setInitialLoad(false);
    }
  }, [selectedOrgId, tagFilter, tagMatch]);

  useEffect(() => { load(); }, [load]);

  // Search (name / description / prompt) + sort, client-side — same model as
  // the Agents list.
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description?.toLowerCase().includes(q) ?? false) ||
          (i.prompt?.toLowerCase().includes(q) ?? false))
      : items;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'model') cmp = (a.model ?? '').localeCompare(b.model ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, search, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key as SortKey); setSortDir('asc'); }
  };

  const handleDelete = async (item: AiStep) => {
    if (!selectedOrgId) return;
    const ok = await confirm({
      title: 'Delete AI step?',
      description: `"${item.name}" will be removed. Any agent actions referencing it will break.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteAiStep(selectedOrgId, item.id);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" /> AI Steps
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable AI prompts that agent workflows can reference.</p>
        </div>
        <Button onClick={() => router.push('/actions/ai-steps/create')}><Plus className="h-4 w-4 mr-1" /> New AI Step</Button>
      </div>

      {!selectedOrgId ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Select an organization to manage AI steps.
        </CardContent></Card>
      ) : initialLoad ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or description…"
                  className="h-9 pl-8"
                />
              </div>
              {search && (
                <span className="text-xs text-muted-foreground">{visibleItems.length} of {items.length}</span>
              )}
              <div className="ml-auto">
                <TagFilter tags={tags} selected={tagFilter} onChange={setTagFilter} match={tagMatch} onMatchChange={setTagMatch} />
              </div>
            </div>
            <ResponsiveTable
              data={visibleItems}
              getRowKey={(i) => i.id}
              onRowClick={(i) => router.push(`/actions/ai-steps/${i.id}`)}
              emptyMessage={search ? `No AI steps match "${search}".` : 'No AI steps yet. Create one to reuse prompts across agent workflows.'}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  sortable: true,
                  render: (i) => (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      {i.connector_ids.length > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4">{i.connector_ids.length} connector{i.connector_ids.length !== 1 ? 's' : ''}</Badge>
                      )}
                      {(i.outputs?.length ?? 0) > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4">{i.outputs.length} output{i.outputs.length !== 1 ? 's' : ''}</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'model',
                  label: 'Model',
                  sortable: true,
                  render: (i) => <span className="text-xs font-mono text-muted-foreground">{i.model?.replace('claude-', '')}</span>,
                },
                {
                  key: 'description',
                  label: 'Description',
                  render: (i) => <span className="text-xs text-muted-foreground">{i.description || i.prompt?.slice(0, 80)}</span>,
                },
                {
                  key: 'tags',
                  label: 'Tags',
                  render: (i) => <TagList tags={i.tags} />,
                },
                {
                  key: 'actions',
                  label: '',
                  thClassName: 'w-px whitespace-nowrap',
                  tdClassName: 'w-px whitespace-nowrap',
                  desktopRender: (i) => (
                    <div className="flex items-center justify-end">
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/actions/ai-steps/${i.id}`) },
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogStep(i) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(i) },
                        ]}
                      />
                    </div>
                  ),
                  render: (i) => (
                    <div className="flex items-center">
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/actions/ai-steps/${i.id}`) },
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogStep(i) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(i) },
                        ]}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <TagAssignDialog
        open={!!tagDialogStep}
        onOpenChange={(o) => { if (!o) setTagDialogStep(null); }}
        orgId={selectedOrgId}
        entityLabel={tagDialogStep?.name}
        initialTagIds={tagDialogStep?.tags?.map((t) => t.id) ?? []}
        onSave={async (ids) => {
          if (!selectedOrgId || !tagDialogStep) return;
          await updateAiStep(selectedOrgId, tagDialogStep.id, { tag_ids: ids });
          await load();
        }}
      />
    </div>
  );
}
