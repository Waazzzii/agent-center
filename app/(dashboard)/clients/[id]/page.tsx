'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getClient, type Client } from '@/lib/api/clients';
import { getAgents, setAgentClient, type Agent } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { toast } from 'sonner';
import { Users, ArrowLeft, Bot, ExternalLink, X } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { CopyableId } from '@/components/clients/copyable-id';

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [client, setClient] = useState<Client | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);

  // Assign-agents dialog.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [assignQuery, setAssignQuery] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedOrgId && clientId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, clientId]);

  const load = async () => {
    if (!selectedOrgId) return;
    try {
      const [c, a] = await Promise.all([
        getClient(selectedOrgId, clientId),
        getAgents(selectedOrgId),
      ]);
      setClient(c);
      setAgents(a.agents);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to load client');
    } finally {
      setInitialLoad(false);
    }
  };

  const assigned = useMemo(() => agents.filter((a) => a.client_id === clientId), [agents, clientId]);

  const openAssign = () => {
    setAssignIds(assigned.map((a) => a.id));
    setAssignQuery('');
    setAssignOpen(true);
  };

  // Agents shown in the assign dialog — searchable, whole org, sorted by name.
  const filteredAssignAgents = useMemo(() => {
    const q = assignQuery.trim().toLowerCase();
    const list = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, assignQuery]);

  const handleSaveAssign = async () => {
    if (!selectedOrgId) return;
    const before = new Set(assigned.map((a) => a.id));
    const after = new Set(assignIds);
    const toAssign = [...after].filter((id) => !before.has(id));
    const toUnassign = [...before].filter((id) => !after.has(id));
    if (toAssign.length === 0 && toUnassign.length === 0) { setAssignOpen(false); return; }
    setSaving(true);
    try {
      // One client per agent: assigning an agent owned by another client
      // reassigns it here. Run sequentially so a failure stops cleanly.
      for (const id of toAssign) await setAgentClient(selectedOrgId, id, clientId);
      for (const id of toUnassign) await setAgentClient(selectedOrgId, id, null);
      toast.success('Agents updated');
      setAssignOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to update agents');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async (a: Agent) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Unassign agent',
      description: `Remove "${a.name}" from this client? Its reserved pre-process step will be removed and the agent will no longer be client-gated. The agent itself is kept.`,
      confirmText: 'Unassign',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await setAgentClient(selectedOrgId, a.id, null);
      toast.success('Agent unassigned');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to unassign agent');
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

  if (!client) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <Button variant="ghost" size="sm" onClick={() => router.push('/clients')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to clients
        </Button>
        <Card className="mt-4"><CardContent className="py-12 text-center text-muted-foreground">Client not found.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1000px] mx-auto">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => router.push('/clients')}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to clients
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {client.name}
              {client.is_active
                ? <Badge variant="success">Active</Badge>
                : <Badge variant="neutral">Inactive</Badge>}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <span>Client ID</span>
              <CopyableId value={client.public_id} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        Paste this client ID into the center where the agent kit is deployed. The kit shows only the
        agents assigned to this client and lets operators run them with a prompt. Each assigned agent
        is gated so it can only run with that prompt.
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand" /> Assigned agents
        </h2>
        <Button size="sm" onClick={openAssign}>
          <Users className="mr-2 h-4 w-4" /> Assign agents
        </Button>
      </div>

      {assigned.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No agents assigned yet. Assign agents to make them runnable from this client&apos;s kit.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {assigned.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <button
                  onClick={() => router.push(`/agents/${a.id}`)}
                  className="flex min-w-0 items-center gap-2 text-left hover:underline"
                >
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{a.name}</span>
                  {!a.is_active && <Badge variant="neutral">Inactive</Badge>}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                </button>
                <RowActionsMenu
                  actions={[
                    { label: 'Open in editor', icon: <ExternalLink className="h-4 w-4" />, onSelect: () => router.push(`/agents/${a.id}`) },
                    { label: 'Unassign', icon: <X className="h-4 w-4" />, destructive: true, onSelect: () => handleUnassign(a) },
                  ]}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assign-agents dialog — one tall, searchable checkbox list. */}
      <Dialog open={assignOpen} onOpenChange={(o) => { if (!o) setAssignOpen(false); }}>
        <DialogContent className="sm:max-w-lg md:left-[calc(50%+8rem)] flex max-h-[80vh] flex-col">
          <DialogHeader>
            <DialogTitle>Assign agents</DialogTitle>
            <DialogDescription>
              Choose which agents belong to &quot;{client.name}&quot;. An agent can belong to one client;
              selecting an agent owned by another client moves it here.
            </DialogDescription>
          </DialogHeader>
          {agents.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">This organization has no agents yet.</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Input
                autoFocus
                value={assignQuery}
                onChange={(e) => setAssignQuery(e.target.value)}
                placeholder="Search agents…"
              />
              <div className="px-0.5 text-xs text-muted-foreground">{assignIds.length} selected</div>
              <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
                {filteredAssignAgents.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No agents match.</div>
                ) : filteredAssignAgents.map((a) => {
                  const checked = assignIds.includes(a.id);
                  const otherClient = a.client_id && a.client_id !== clientId;
                  return (
                    <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setAssignIds((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))}
                        className="h-4 w-4 shrink-0 accent-brand"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                      {!a.is_active && <Badge variant="neutral">Inactive</Badge>}
                      {otherClient && <span className="shrink-0 text-[11px] text-amber-600">another client</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSaveAssign} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
