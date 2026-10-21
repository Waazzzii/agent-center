'use client';

/**
 * Authorization → Clients → one client. Multi-assign which agents this client's kit
 * offers. agents.client_id is one client per agent, so selecting an agent here moves
 * it to this client (and off any other); deselecting unassigns it.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { TargetChecklist, type ChecklistTarget } from '@/components/access/TargetChecklist';
import { getAgents } from '@/lib/api/agents';
import { listClients, clientDisplayName, setClientAgents } from '@/lib/api/clients';
import { Package, ArrowLeft, Loader2 } from 'lucide-react';

export default function ClientDetailPage() {
  const { selectedOrgId } = useAdminViewStore();
  const isManager = useRequirePermission('agent_center_manager');
  const clientId = String(useParams().id);

  const [name, setName] = useState('Client');
  const [agents, setAgents] = useState<ChecklistTarget[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId || !isManager) return;
    setLoading(true);
    Promise.all([listClients(selectedOrgId), getAgents(selectedOrgId)])
      .then(([cs, a]) => {
        const c = cs.find((x) => x.id === clientId);
        if (c) setName(clientDisplayName(c));
        setAgents(a.agents.map((x) => ({ id: x.id, name: x.name, tags: x.tags, createdAt: x.created_at, description: x.description })));
        setAssigned(a.agents.filter((x) => x.client_id === clientId).map((x) => x.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrgId, isManager, clientId]);

  if (!isManager) return <NoPermissionContent />;

  const onSave = async (ids: string[]) => {
    if (!selectedOrgId) return;
    const result = await setClientAgents(selectedOrgId, clientId, ids);
    setAssigned(result);
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <Link href="/authorization/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>
      <PageHeader icon={Package} title={name} description="The agents this client's kit can run. One client per agent." />

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <TargetChecklist targets={agents} initialSelected={assigned} onSave={onSave} showTags targetNoun="agent" />
      )}
    </div>
  );
}
