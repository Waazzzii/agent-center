'use client';

/**
 * Who may act on this agent.
 *
 * ONE place, at the agent. Access used to be attached per action, per login
 * and (briefly) per outcome — three places to set the same thing, each easy
 * to miss, and missing one is silent because an entity with no group falls
 * back to "anyone with Agent Center access" rather than saying so.
 *
 * A SEARCHABLE MULTI-SELECT, not a checkbox list. Checkboxes were fine at
 * three groups and stop being fine at thirty: every group costs a row whether
 * or not it is chosen, so the ones actually in effect get harder to see the
 * more an org grows. The chips invert that — what is selected is always the
 * short list at the top, and the rest is one search away.
 *
 * The org DEFAULT group is shown but not selectable: it applies to every agent
 * by definition, so offering a chip that cannot be removed would imply
 * otherwise. Groups chosen here ADD to it.
 */

import * as React from 'react';
import Link from 'next/link';
import {
  getAgentAccessGroups, getAgentGroups, setAgentGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export function AgentAccessGroups({ orgId, agentId }: { orgId: string; agentId: string }) {
  const [all, setAll]         = React.useState<AgentAccessGroup[]>([]);
  const [selected, setSel]    = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);

  React.useEffect(() => {
    if (!orgId || !agentId) return;
    Promise.all([getAgentAccessGroups(orgId), getAgentGroups(orgId, agentId)])
      .then(([groups, attached]) => {
        setAll(groups);
        setSel(attached.map((g) => g.id));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId, agentId]);

  const handleChange = async (next: string[]) => {
    // Optimistic: a picker that waits on a round trip feels broken. The catch
    // puts it back if the server disagrees.
    const previous = selected;
    setSel(next);
    try {
      setSaving(true);
      await setAgentGroups(orgId, agentId, next);
    } catch (err) {
      setSel(previous);
      toast.error((err as Error).message || 'Could not update access');
    } finally {
      setSaving(false);
    }
  };

  const defaultGroup = all.find((g) => g.is_default);
  const options = all
    .filter((g) => !g.is_default)
    .map((g) => ({
      value: g.id,
      label: `${g.name} · ${g.member_count} member${g.member_count === 1 ? '' : 's'}`,
    }));

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading access…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label>Who can act on this agent</Label>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {/* The picker can put an agent in a group but not create or staff one,
            so the link hands off rather than pretending to. */}
        <Link href="/access" className="text-xs text-brand hover:underline">Manage groups</Link>
      </div>

      {defaultGroup && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
          <ShieldCheck className="h-3.5 w-3.5 text-brand shrink-0" />
          <span className="text-sm flex-1 min-w-0 truncate">{defaultGroup.name}</span>
          <Badge variant="secondary" className="text-[10px]">Default — every agent</Badge>
        </div>
      )}

      {options.length === 0 && !defaultGroup ? (
        <p className="text-xs text-muted-foreground">
          No groups yet. Without one, anyone with Agent Center access can act on this agent.
        </p>
      ) : (
        <MultiSelectTags
          options={options}
          selected={selected}
          onChange={handleChange}
          disabled={saving}
          searchable
          placeholder={options.length === 0 ? 'No other groups' : 'Add a group…'}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {defaultGroup
          ? 'The default group always applies. Anything added here is granted on top of it.'
          : 'Add none and anyone with Agent Center access can act on this agent — the same as the app allows.'}
      </p>
    </div>
  );
}
