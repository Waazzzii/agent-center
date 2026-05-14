'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, deleteAgent, duplicateAgent, runAgent, type Agent } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Play, RefreshCw, Bot, Copy } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useEventStream } from '@/lib/hooks/use-event-stream';

export default function AgentsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrgId) loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadAgents = async (silent = false) => {
    if (!selectedOrgId) return;
    try {
      if (!silent) setLoading(true);
      const data = await getAgents(selectedOrgId);
      setAgents(data.agents);
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Failed to load agents');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Realtime: refresh agents list when executions change (run started/completed)
  const agentRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:executions`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => {
      if (agentRefreshRef.current) clearTimeout(agentRefreshRef.current);
      agentRefreshRef.current = setTimeout(() => loadAgents(true), 200);
    },
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

  if (loading && selectedOrgId) {
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
            <ResponsiveTable
              data={agents}
              getRowKey={(a) => a.id}
              onRowClick={(a) => router.push(`/agents/${a.id}`)}
              emptyMessage="No agents yet. Create one to get started."
              columns={[
                {
                  key: 'name',
                  label: 'Name',
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
                  render: (a) => a.is_active
                    ? <Badge variant="success">Active</Badge>
                    : <Badge variant="neutral">Inactive</Badge>,
                },
                {
                  key: 'created',
                  label: 'Created',
                  render: (a) => new Date(a.created_at).toLocaleDateString(),
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
                  desktopRender: (a) => (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" disabled={runningId === a.id} title="Run now" onClick={(e) => { e.stopPropagation(); handleRun(a.id, a.name); }}>
                        {runningId === a.id
                          ? <RefreshCw className="h-4 w-4 animate-spin" />
                          : <Play className="h-4 w-4 text-success" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/agents/${a.id}`); }} title="Edit agent">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={duplicatingId === a.id} title="Duplicate agent" onClick={(e) => { e.stopPropagation(); handleDuplicate(a); }}>
                        {duplicatingId === a.id
                          ? <RefreshCw className="h-4 w-4 animate-spin" />
                          : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.name); }} title="Delete agent">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                  render: (a) => (
                    <>
                      <Button variant="outline" size="sm" disabled={runningId === a.id} title="Run now" onClick={(e) => { e.stopPropagation(); handleRun(a.id, a.name); }} className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l">
                        {runningId === a.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-success" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/agents/${a.id}`); }} className="flex-1 rounded-none border-r-0 border-t-0 border-l">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={duplicatingId === a.id} onClick={(e) => { e.stopPropagation(); handleDuplicate(a); }} className="flex-1 rounded-none border-r-0 border-t-0 border-l">
                        {duplicatingId === a.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.name); }} className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
