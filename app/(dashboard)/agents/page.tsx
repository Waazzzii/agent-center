'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { usePermission } from '@/lib/hooks/use-permission';
import { getAgents, deleteAgent, type Agent } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

export default function AgentsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agents_read');
  const canCreate = usePermission('agents_create');
  const canUpdate = usePermission('agents_update');
  const canDelete = usePermission('agents_delete');
  const { confirm } = useConfirmDialog();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedOrgId) loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadAgents = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getAgents(selectedOrgId);
      setAgents(data.agents);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Agents</h1>
          <p className="text-sm text-muted-foreground">Automated workflows powered by LLMs and your connected systems</p>
        </div>
        <Button disabled={!selectedOrgId || !canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined} onClick={() => router.push('/agents/create')}>
          <Plus className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to manage agents.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <CardDescription>{agents.length} agent{agents.length !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={agents}
              getRowKey={(a) => a.id}
              onRowClick={(a) => router.push(`/agents/${a.id}`)}
              emptyMessage="No agents yet. Create one to get started."
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  render: (a) => <span className="font-medium">{a.name}</span>,
                },
                {
                  key: 'description',
                  label: 'Description',
                  render: (a) => (
                    <span className="text-muted-foreground text-sm">
                      {a.description ? (a.description.length > 60 ? a.description.slice(0, 60) + '…' : a.description) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (a) => a.is_active
                    ? <Badge variant="default">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>,
                },
                {
                  key: 'created',
                  label: 'Created',
                  render: (a) => new Date(a.created_at).toLocaleDateString(),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  desktopRender: (a) => (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" disabled={!canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); router.push(`/agents/${a.id}`); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.name); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                  render: (a) => (
                    <>
                      <Button variant="outline" size="sm" disabled={!canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); router.push(`/agents/${a.id}`); }} className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.name); }} className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10">
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
