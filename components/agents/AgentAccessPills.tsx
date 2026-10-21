'use client';

/**
 * Per-agent Access — one area, three pills: Executions · Decisions · Clients.
 *   • Executions — which access groups may RUN this agent (access_group_agents)
 *   • Decisions  — which may ACT ON its decisions (access_group_agent_decisions)
 *   • Clients    — which client's kit it is runnable from (agents.client_id)
 * Executions/Decisions are group multi-selects; Clients is the single client
 * picker, passed in as `productSlot` (its data lives in the editor). Logins are
 * NOT here — a login is a shared pool handled under Authorization → Access Groups.
 */

import * as React from 'react';
import {
  getRunAccessGroups, getAgentRunGroups, setAgentRunGroups, type RunAccessGroup,
} from '@/lib/api/agent-run-access';
import { getAgentDecisionGroups, setAgentDecisionGroups } from '@/lib/api/agent-grain-access';
import { Pills } from '@/components/ui/pills';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { InfoHint } from '@/components/ui/info-hint';
import { Loader2, Play, Gavel, Package } from 'lucide-react';
import { toast } from 'sonner';

const PILLS = [
  { value: 'executions', label: 'Executions', icon: Play },
  { value: 'decisions', label: 'Decisions', icon: Gavel },
  { value: 'clients', label: 'Clients', icon: Package },
];

export function AgentAccessPills({
  orgId, agentId, productSlot,
}: {
  orgId: string;
  agentId: string;
  productSlot: React.ReactNode;
}) {
  const [pill, setPill] = React.useState('executions');
  const [groups, setGroups] = React.useState<RunAccessGroup[]>([]);
  const [runSel, setRunSel] = React.useState<string[]>([]);
  const [decSel, setDecSel] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!orgId || !agentId) return;
    Promise.all([
      getRunAccessGroups(orgId),
      getAgentRunGroups(orgId, agentId),
      getAgentDecisionGroups(orgId, agentId),
    ])
      .then(([g, run, dec]) => { setGroups(g); setRunSel(run.map((x) => x.id)); setDecSel(dec.map((x) => x.id)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId, agentId]);

  const options = groups.map((g) => ({ value: g.id, label: `${g.name} · ${g.member_count} member${g.member_count === 1 ? '' : 's'}` }));

  const commit = async (
    next: string[],
    setLocal: (v: string[]) => void,
    prev: string[],
    save: (ids: string[]) => Promise<unknown>,
  ) => {
    setLocal(next);
    setSaving(true);
    try { await save(next); }
    catch (err) { setLocal(prev); toast.error((err as Error).message || 'Could not update access'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Pills options={PILLS} value={pill} onChange={setPill} />
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {loading ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
      ) : pill === 'executions' ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/90">
            Groups that may run this agent
            <InfoHint>Default-deny: with no group (and no org-wide “all” grant), only admins can run this agent. Membership is managed in Wazzi admin.</InfoHint>
          </div>
          <MultiSelectTags options={options} selected={runSel} onChange={(ids) => commit(ids, setRunSel, runSel, (x) => setAgentRunGroups(orgId, agentId, x))} placeholder="Add a group…" searchable disabled={saving} />
        </div>
      ) : pill === 'decisions' ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/90">
            Groups that may act on its decisions
            <InfoHint>Default-deny: with no group (and no org-wide “all” grant), only admins and managers can act on its decisions. Add a group to let a team. Separate from Executions on purpose.</InfoHint>
          </div>
          <MultiSelectTags options={options} selected={decSel} onChange={(ids) => commit(ids, setDecSel, decSel, (x) => setAgentDecisionGroups(orgId, agentId, x))} placeholder="Add a group…" searchable disabled={saving} />
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-foreground/90">
            Client
            <InfoHint>The client whose agent kit can run this agent (passes _client_prompt / _client_media / _client_video). One client per agent.</InfoHint>
          </div>
          {productSlot}
        </div>
      )}
    </div>
  );
}
