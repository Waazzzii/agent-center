'use client';

/**
 * Authorization → Access Groups — searchable, sortable table of the org's Wazzi
 * access groups. Pick one to set what it covers (Execution / Decisions / Logins).
 * Membership is managed in Wazzi admin. Standard toolbar + ResponsiveTable.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/data-table';
import { getRunAccessGroups, type RunAccessGroup } from '@/lib/api/agent-run-access';
import { Users, Loader2 } from 'lucide-react';

export default function AccessGroupsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const isManager = useRequirePermission('agent_center_manager');
  const [groups, setGroups] = useState<RunAccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!selectedOrgId || !isManager) return;
    setLoading(true);
    getRunAccessGroups(selectedOrgId).then(setGroups).catch(() => {}).finally(() => setLoading(false));
  }, [selectedOrgId, isManager]);

  const toggleSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const cmp = sortKey === 'members' ? a.member_count - b.member_count : a.name.localeCompare(b.name);
      return cmp * dir;
    });
  }, [groups, search, sortKey, sortDir]);

  if (!isManager) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <PageHeader icon={Users} title="Access Groups" description="Pick a group to set what it can run, decide on, and sign in to." />
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <DataTable
          search={{ value: search, onChange: setSearch, placeholder: 'Search access groups…' }}
          data={rows}
          isFiltered={!!search}
          onRowClick={(g) => router.push(`/authorization/groups/${g.id}`)}
          emptyMessage={groups.length === 0 ? 'No access groups yet — create them in Wazzi admin.' : 'No groups match.'}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          columns={[
            { key: 'name', label: 'Name', sortable: true, render: (g: RunAccessGroup) => <span className="font-medium text-foreground">{g.name}</span> },
            { key: 'members', label: 'Members', sortable: true, thClassName: 'w-40', tdClassName: 'text-sm text-muted-foreground', render: (g: RunAccessGroup) => `${g.member_count} member${g.member_count === 1 ? '' : 's'}` },
          ]}
        />
      )}
    </div>
  );
}
