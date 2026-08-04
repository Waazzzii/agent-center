'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, deleteAgent, duplicateAgent, runAgent, updateAgent, type Agent } from '@/lib/api/agents';
import { listClients } from '@/lib/api/clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Play, RefreshCw, Bot, Copy, Search, Tag as TagIcon, Sparkles } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import { useTags } from '@/lib/hooks/use-tags';
import { TagFilter } from '@/components/tags/tag-filter';
import { TagList } from '@/components/tags/tag-badge';
import { TagAssignDialog } from '@/components/tags/tag-assign-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';

type SortKey = 'name' | 'status' | 'created';

export default function AgentsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinct from `loading`: true only until the first fetch resolves. The
  // full-page spinner keys off this so filter/search reloads update the table
  // in place instead of blanking the whole screen.
  const [initialLoad, setInitialLoad] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [tagDialogAgent, setTagDialogAgent] = useState<Agent | null>(null);
  // client_id → name, for the Client column.
  const [clientsById, setClientsById] = useState<Record<string, string>>({});

  // Search + sort live entirely client-side. The list is small enough
  // (hundreds, not thousands) that filtering / sorting in memory is
  // cheaper than round-tripping to the backend for each keystroke.
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Tag filtering is server-side (refetch on change) so it stays consistent
  // with the executions feed + MCP. Search/sort remain client-side.
  const { tags } = useTags(selectedOrgId);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<'any' | 'all'>('any');

  useEffect(() => {
    if (selectedOrgId) loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, tagFilter, tagMatch]);

  // Client names for the Client column (id → name).
  useEffect(() => {
    if (!selectedOrgId) return;
    listClients(selectedOrgId)
      .then((cs) => setClientsById(Object.fromEntries(cs.map((c) => [c.id, c.name]))))
      .catch(() => { /* column falls back to a dash */ });
  }, [selectedOrgId]);

  const loadAgents = async (silent = false) => {
    if (!selectedOrgId) return;
    try {
      if (!silent) setLoading(true);
      const data = await getAgents(selectedOrgId, { tagIds: tagFilter, tagMatch });
      setAgents(data.agents);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Failed to load agents');
    } finally {
      if (!silent) setLoading(false);
      setInitialLoad(false);
    }
  };

  // Near-realtime: refresh agents list when executions change. Versioned
  // polling (15s — list page, low stakes) instead of a parked SSE stream.
  useTopicVersions({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`] : [],
    enabled: !!selectedOrgId,
    intervalMs: 15_000,
    onChange: () => { loadAgents(true); },
  });

  const handleRun = async (agentId: string, name: string) => {
    if (!selectedOrgId) return;
    try {
      setRunningId(agentId);
      await runAgent(selectedOrgId, agentId);
      toast.success(`"${name}" triggered successfully`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to run agent');
    } finally {
      setRunningId(null);
    }
  };

  /**
   * Duplicate an agent. Picks the next free "(copy N)" suffix so repeated
   * duplications don't end up with "Foo (copy) (copy) (copy)". Created
   * inactive — operator activates after reviewing.
   */
  const handleDuplicate = async (agent: Agent) => {
    if (!selectedOrgId || duplicatingId) return;
    setDuplicatingId(agent.id);
    try {
      const base = agent.name.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/, '');
      const existing = new Set(agents.map((a) => a.name));
      let candidate = `${base} (copy)`;
      let n = 2;
      while (existing.has(candidate)) {
        candidate = `${base} (copy ${n})`;
        n++;
      }
      const created = await duplicateAgent(selectedOrgId, agent.id, candidate);
      toast.success(`Duplicated → ${candidate}`);
      await loadAgents();
      // Jump straight into the new agent so the operator can review/edit
      // the cloned actions immediately.
      router.push(`/agents/${created.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to duplicate agent');
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async (agentId: string, name: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Delete Agent',
      description: `Are you sure you want to delete "${name}"? All actions, triggers, and history will be removed.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteAgent(selectedOrgId, agentId);
      toast.success('Agent deleted');
      await loadAgents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete agent');
    }
  };

  // Filter + sort. Search matches name OR description (case-insensitive,
  // substring) so operators can find "the agent that does X" by typing
  // a fragment of either. Sort by name (lexicographic), status (active
  // first), or created (newest first when desc).
  const visibleAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? agents.filter((a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false),
        )
      : agents;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === 'status') {
        // Active (true) sorts before Inactive (false) on asc.
        cmp = Number(b.is_active) - Number(a.is_active);
      } else if (sortKey === 'created') {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [agents, search, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key as SortKey);
      setSortDir('asc');
    }
  };

  if (initialLoad && selectedOrgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bot className="h-5 w-5 text-brand" /> Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Automated workflows powered by LLMs and your connected systems</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => router.push('/agents/create')}>
          <Plus className="mr-2 h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mt-0.5">Select an organization to manage agents.</p>
          </CardContent>
        </Card>
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
                <span className="text-xs text-muted-foreground">
                  {visibleAgents.length} of {agents.length}
                </span>
              )}
              <div className="ml-auto">
                <TagFilter
                  tags={tags}
                  selected={tagFilter}
                  onChange={setTagFilter}
                  match={tagMatch}
                  onMatchChange={setTagMatch}
                />
              </div>
            </div>
            <ResponsiveTable
              data={visibleAgents}
              getRowKey={(a) => a.id}
              onRowClick={(a) => router.push(`/agents/${a.id}`)}
              emptyMessage={
                search
                  ? `No agents match "${search}".`
                  : 'No agents yet. Create one to get started.'
              }
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  sortable: true,
                  // Description shows on hover via native title attribute — we
                  // dropped the standalone Description column to reclaim
                  // horizontal space for the more useful Status/Created/Actions.
                  render: (a) => (
                    <span
                      className="font-medium"
                      title={a.description || undefined}
                    >
                      {a.name}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  label: 'Status',
                  sortable: true,
                  render: (a) => a.is_active
                    ? <Badge variant="success">Active</Badge>
                    : <Badge variant="neutral">Inactive</Badge>,
                },
                {
                  key: 'created',
                  label: 'Created',
                  sortable: true,
                  render: (a) => new Date(a.created_at).toLocaleDateString(),
                },
                {
                  key: 'client',
                  label: 'Client',
                  render: (a) => a.client_id
                    ? (
                      <Badge variant="outline" className="gap-1 border-brand/40 text-brand">
                        <Sparkles className="h-3 w-3" />
                        <span className="max-w-[120px] truncate">{clientsById[a.client_id] ?? 'Client'}</span>
                      </Badge>
                    )
                    : <span className="text-muted-foreground">—</span>,
                },
                {
                  // Tags is the last data column everywhere; not sortable
                  // (rows can carry several tags, so a-z has no meaning).
                  key: 'tags',
                  label: 'Tags',
                  render: (a) => <TagList tags={a.tags} />,
                },
                {
                  key: 'actions',
                  // No label — actions are self-evident from the icons, and
                  // the th would just steal width on a column we want as
                  // narrow as possible.
                  label: '',
                  // w-px + whitespace-nowrap collapses the column to the
                  // intrinsic width of its content (the icon buttons) so
                  // the rest of the table gets the surplus.
                  thClassName: 'w-px whitespace-nowrap',
                  tdClassName: 'w-px whitespace-nowrap',
                  // Run stays as the primary inline action; edit / duplicate
                  // / delete / tag collapse into the ⋮ configure menu.
                  // Use desktopRender (not render) so the cell isn't wrapped in
                  // ResponsiveTable's truncate/overflow-hidden fallback, which
                  // would clip the ⋮ menu in this w-px column.
                  desktopRender: (a) => (
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={runningId === a.id} title="Run now" onClick={(e) => { e.stopPropagation(); handleRun(a.id, a.name); }}>
                        {runningId === a.id
                          ? <RefreshCw className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4 text-success" />}
                      </Button>
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/agents/${a.id}`) },
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogAgent(a) },
                          { label: duplicatingId === a.id ? 'Duplicating…' : 'Duplicate', icon: <Copy className="h-4 w-4" />, disabled: duplicatingId === a.id, onSelect: () => handleDuplicate(a) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(a.id, a.name) },
                        ]}
                      />
                    </div>
                  ),
                  // Mobile card view fallback — same Run + ⋮ menu.
                  render: (a) => (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" disabled={runningId === a.id} title="Run now" onClick={(e) => { e.stopPropagation(); handleRun(a.id, a.name); }}>
                        {runningId === a.id
                          ? <RefreshCw className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4 text-success" />}
                      </Button>
                      <RowActionsMenu
                        actions={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => router.push(`/agents/${a.id}`) },
                          { label: 'Tags', icon: <TagIcon className="h-4 w-4" />, onSelect: () => setTagDialogAgent(a) },
                          { label: duplicatingId === a.id ? 'Duplicating…' : 'Duplicate', icon: <Copy className="h-4 w-4" />, disabled: duplicatingId === a.id, onSelect: () => handleDuplicate(a) },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(a.id, a.name) },
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
        open={!!tagDialogAgent}
        onOpenChange={(o) => { if (!o) setTagDialogAgent(null); }}
        orgId={selectedOrgId}
        entityLabel={tagDialogAgent?.name}
        initialTagIds={tagDialogAgent?.tags?.map((t) => t.id) ?? []}
        onSave={async (ids) => {
          if (!selectedOrgId || !tagDialogAgent) return;
          await updateAgent(selectedOrgId, tagDialogAgent.id, { tag_ids: ids });
          await loadAgents(true);
        }}
      />
    </div>
  );
}
