'use client';

/**
 * Authorization → Access Groups → one group. Set what this group covers, across
 * three pills: Executions / Decisions / Logins. Each lists only the targets
 * (agents, or pool-parent logins) assigned to THIS group for that grain; new ones
 * are added from a search-by-name-or-tag picker. Changes save immediately.
 * No "all" grant — admins already have blanket access; assignment is explicit.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { PageHeader } from '@/components/layout/PageHeader';
import { Pills } from '@/components/ui/pills';
import { AssignedTargets, type ChecklistTarget } from '@/components/access/AssignedTargets';
import { getAgents } from '@/lib/api/agents';
import { listLogins } from '@/lib/api/logins';
import {
  getRunAccessGroups, getGroupRunAgents, setGroupRunAgents,
} from '@/lib/api/agent-run-access';
import {
  getGroupDecisionAgents, setGroupDecisionAgents,
  getGroupLogins, setGroupLogins, type Grain,
} from '@/lib/api/agent-grain-access';
import { ArrowLeft, Play, Gavel, LogIn, Loader2 } from 'lucide-react';

const PILLS = [
  { value: 'execution', label: 'Executions', icon: Play },
  { value: 'decision', label: 'Decisions', icon: Gavel },
  { value: 'login', label: 'Logins', icon: LogIn },
];

const getGroupIds = (orgId: string, groupId: string, grain: Grain): Promise<string[]> =>
  grain === 'execution' ? getGroupRunAgents(orgId, groupId).then((d) => d.agent_ids)
  : grain === 'decision' ? getGroupDecisionAgents(orgId, groupId).then((d) => d.agent_ids)
  : getGroupLogins(orgId, groupId).then((d) => d.login_ids);

const saveGroupIds = (orgId: string, groupId: string, grain: Grain, ids: string[]): Promise<unknown> =>
  grain === 'execution' ? setGroupRunAgents(orgId, groupId, ids, false)
  : grain === 'decision' ? setGroupDecisionAgents(orgId, groupId, ids, false)
  : setGroupLogins(orgId, groupId, ids, false);

export default function GroupDetailPage() {
  const { selectedOrgId } = useAdminViewStore();
  const isManager = useRequirePermission('agent_center_manager');
  const groupId = String(useParams().id);

  const [grain, setGrain] = useState<Grain>('execution');
  const [groupName, setGroupName] = useState('');
  const [agents, setAgents] = useState<ChecklistTarget[]>([]);
  const [logins, setLogins] = useState<ChecklistTarget[]>([]);
  const [assigned, setAssigned] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingGrain, setLoadingGrain] = useState(false);

  useEffect(() => {
    if (!selectedOrgId || !isManager) return;
    setLoading(true);
    Promise.all([
      getRunAccessGroups(selectedOrgId),
      getAgents(selectedOrgId),
      listLogins(selectedOrgId),
    ])
      .then(([groups, a, ls]) => {
        setGroupName(groups.find((g) => g.id === groupId)?.name ?? 'Access group');
        setAgents(a.agents.map((x) => ({ id: x.id, name: x.name, tags: x.tags, createdAt: x.created_at, description: x.description })));
        setLogins(ls.filter((l) => !l.pool_parent_id).map((l) => ({ id: l.id, name: l.name, createdAt: l.created_at })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedOrgId, isManager, groupId]);

  // Load the group's assigned ids for a grain the first time it's shown.
  const ensureGrain = useCallback(async (g: Grain) => {
    if (!selectedOrgId || assigned[g]) return;
    setLoadingGrain(true);
    try {
      const ids = await getGroupIds(selectedOrgId, groupId, g);
      setAssigned((prev) => ({ ...prev, [g]: ids }));
    } catch { /* leave undefined; checklist shows empty */ }
    finally { setLoadingGrain(false); }
  }, [selectedOrgId, groupId, assigned]);

  useEffect(() => { if (!loading) void ensureGrain(grain); }, [grain, loading, ensureGrain]);

  if (!isManager) return <NoPermissionContent />;

  const targets = grain === 'login' ? logins : agents;
  const onSave = async (ids: string[]) => {
    if (!selectedOrgId) return;
    await saveGroupIds(selectedOrgId, groupId, grain, ids);
    setAssigned((prev) => ({ ...prev, [grain]: ids }));
  };

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <Link href="/authorization/groups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Access Groups
      </Link>
      <PageHeader
        icon={Play}
        title={groupName}
        description="What this group can run, decide on, and sign in to. Members are managed in Wazzi admin."
      />

      <Pills options={PILLS} value={grain} onChange={(v) => setGrain(v as Grain)} />

      {loading || loadingGrain || !assigned[grain] ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <AssignedTargets
          key={grain}
          targets={targets}
          assignedIds={assigned[grain] ?? []}
          onSave={onSave}
          showTags={grain !== 'login'}
          targetNoun={grain === 'login' ? 'login' : 'agent'}
          groupName={groupName}
        />
      )}
    </div>
  );
}
