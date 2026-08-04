'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  type Client,
} from '@/lib/api/clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Boxes, Power, PowerOff, Search } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { CopyableId } from '@/components/clients/copyable-id';

export default function ClientsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [clients, setClients] = useState<Client[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [search, setSearch] = useState('');

  // Create / rename dialog. `editing` null = create mode.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedOrgId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const load = async (silent = false) => {
    if (!selectedOrgId) return;
    try {
      const data = await listClients(selectedOrgId);
      setClients(data);
    } catch (err: any) {
      if (!silent) toast.error(err?.response?.data?.error || err.message || 'Failed to load clients');
    } finally {
      setInitialLoad(false);
    }
  };

  const openCreate = () => { setEditing(null); setNameDraft(''); setDialogOpen(true); };
  const openRename = (c: Client) => { setEditing(c); setNameDraft(c.name); setDialogOpen(true); };

  const handleSave = async () => {
    if (!selectedOrgId || !nameDraft.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateClient(selectedOrgId, editing.id, { name: nameDraft.trim() });
        toast.success('Client updated');
      } else {
        const created = await createClient(selectedOrgId, { name: nameDraft.trim() });
        toast.success(`Client "${created.name}" created`);
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Client) => {
    if (!selectedOrgId) return;
    try {
      await updateClient(selectedOrgId, c.id, { is_active: !c.is_active });
      toast.success(c.is_active ? 'Client deactivated' : 'Client activated');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to update client');
    }
  };

  const handleDelete = async (c: Client) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Delete Client',
      description: `Delete "${c.name}"? Its tasks and agent assignments will be removed, and any deployment still using its ID will stop resolving. This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteClient(selectedOrgId, c.id);
      toast.success('Client deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete client');
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.public_id.toLowerCase().includes(q))
      : clients;
  }, [clients, search]);

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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Boxes className="h-5 w-5 text-brand" /> Clients
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deployment targets for the embedded agent kit. Paste a client&apos;s ID into a center to scope which agents it can see.
          </p>
        </div>
        <Button disabled={!selectedOrgId} onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mt-0.5">Select an organization to manage clients.</p>
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
                  placeholder="Search by name or ID…"
                  className="h-9 pl-8"
                />
              </div>
              {search && (
                <span className="text-xs text-muted-foreground">
                  {visible.length} of {clients.length}
                </span>
              )}
            </div>
            <ResponsiveTable
              data={visible}
              getRowKey={(c) => c.id}
              onRowClick={(c) => router.push(`/clients/${c.id}`)}
              emptyMessage={
                search ? `No clients match "${search}".` : 'No clients yet. Create one to get started.'
              }
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  render: (c) => <span className="font-medium">{c.name}</span>,
                },
                {
                  key: 'public_id',
                  label: 'Client ID',
                  // desktopRender so the copy control isn't wrapped in the
                  // truncate fallback (which would clip the button).
                  desktopRender: (c) => <CopyableId value={c.public_id} />,
                  render: (c) => <CopyableId value={c.public_id} />,
                },
                {
                  key: 'agents',
                  label: 'Agents',
                  render: (c) => <span className="text-muted-foreground">{c.agent_count ?? 0}</span>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (c) => c.is_active
                    ? <Badge variant="success">Active</Badge>
                    : <Badge variant="neutral">Inactive</Badge>,
                },
                {
                  key: 'created',
                  label: 'Created',
                  render: (c) => new Date(c.created_at).toLocaleDateString(),
                },
                {
                  key: 'actions',
                  label: '',
                  thClassName: 'w-px whitespace-nowrap',
                  tdClassName: 'w-px whitespace-nowrap',
                  desktopRender: (c) => (
                    <div className="flex items-center justify-end gap-1">
                      <RowActionsMenu
                        actions={[
                          { label: 'Manage tasks', icon: <Boxes className="h-4 w-4" />, onSelect: () => router.push(`/clients/${c.id}`) },
                          { label: 'Rename', icon: <Pencil className="h-4 w-4" />, onSelect: () => openRename(c) },
                          {
                            label: c.is_active ? 'Deactivate' : 'Activate',
                            icon: c.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />,
                            onSelect: () => handleToggleActive(c),
                          },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(c) },
                        ]}
                      />
                    </div>
                  ),
                  render: (c) => (
                    <div className="flex items-center gap-1">
                      <RowActionsMenu
                        actions={[
                          { label: 'Manage tasks', icon: <Boxes className="h-4 w-4" />, onSelect: () => router.push(`/clients/${c.id}`) },
                          { label: 'Rename', icon: <Pencil className="h-4 w-4" />, onSelect: () => openRename(c) },
                          {
                            label: c.is_active ? 'Deactivate' : 'Activate',
                            icon: c.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />,
                            onSelect: () => handleToggleActive(c),
                          },
                          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, destructive: true, onSelect: () => handleDelete(c) },
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md md:left-[calc(50%+8rem)]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Rename client' : 'New client'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'The client ID is fixed and can’t be changed. Deactivate + recreate to rotate it.'
                : 'A unique client ID is generated automatically. Paste it into the center where the agent kit is deployed.'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nameDraft.trim() && !saving) handleSave(); }}
              placeholder="e.g. Commerce Center — Arizona"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !nameDraft.trim()}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
