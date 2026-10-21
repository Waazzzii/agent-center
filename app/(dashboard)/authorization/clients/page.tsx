'use client';

/**
 * Authorization → Clients — the org's enabled clients (agent-kit deployment
 * targets a host app embeds, often a product). Pick one to multi-assign which
 * agents it offers. Standard toolbar + ResponsiveTable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/data-table';
import { listClients, clientDisplayName, type Client } from '@/lib/api/clients';
import { getAgents } from '@/lib/api/agents';
import { Package, Loader2 } from 'lucide-react';

export default function ClientsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const isManager = useRequirePermission('agent_center_manager');
  const [clients, setClients] = useState<Client[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!selectedOrgId || !isManager) return;
    setLoading(true);
    Promise.all([listClients(selectedOrgId), getAgents(selectedOrgId)])
      .then(([cs, a]) => {
        setClients(cs.filter((c) => c.is_active));
        const m: Record<string, number> = {};
        a.agents.forEach((ag) => { if (ag.client_id) m[ag.client_id] = (m[ag.client_id] ?? 0) + 1; });
        setCounts(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrgId, isManager]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? clients.filter((c) => clientDisplayName(c).toLowerCase().includes(q)) : clients;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const cmp = sortKey === 'agents'
        ? (counts[a.id] ?? 0) - (counts[b.id] ?? 0)
        : clientDisplayName(a).localeCompare(clientDisplayName(b));
      return cmp * dir;
    });
  }, [clients, counts, search, sortKey, sortDir]);

  if (!isManager) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <PageHeader icon={Package} title="Clients" description="Pick a client to choose which agents its kit offers." />
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <DataTable
          search={{ value: search, onChange: setSearch, placeholder: 'Search clients…' }}
          data={rows}
          isFiltered={!!search}
          onRowClick={(c) => router.push(`/authorization/clients/${c.id}`)}
          emptyMessage={clients.length === 0 ? 'No clients with an agent kit are enabled for this organisation yet.' : 'No clients match.'}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          columns={[
            { key: 'name', label: 'Name', sortable: true, render: (c: Client) => <span className="font-medium text-foreground">{clientDisplayName(c)}</span> },
            { key: 'agents', label: 'Agents', sortable: true, thClassName: 'w-40', tdClassName: 'text-sm text-muted-foreground', render: (c: Client) => `${counts[c.id] ?? 0} agent${(counts[c.id] ?? 0) === 1 ? '' : 's'}` },
          ]}
        />
      )}
    </div>
  );
}
