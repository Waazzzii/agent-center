'use client';

/**
 * Who may act on this agent.
 *
 * ONE place, at the agent. Access used to be attached per action, per login
 * and (briefly) per outcome — three places to set the same thing, each easy
 * to miss, and missing one is silent because an entity with no group falls
 * back to "anyone with Agent Center access" rather than saying so.
 *
 * ONE LIST. The org's default group applies to every agent and cannot be
 * removed, and it used to sit in its own bar above the picker — which read
 * as a different kind of thing, when it is simply the first group in the
 * list. It is now the first chip, locked, beside the ones you add; the
 * "Add a group…" control is the last item in the same box. What has access
 * is one row you can read left to right.
 */

import * as React from 'react';
import Link from 'next/link';
import {
  getAgentAccessGroups, getAgentGroups, setAgentGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Loader2, ShieldCheck, Users, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function GroupChip({ group, locked, onRemove, disabled }: {
  group: AgentAccessGroup; locked?: boolean; onRemove?: () => void; disabled?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border pl-2 text-xs',
        locked ? 'border-brand/30 bg-brand-soft/60 pr-2 text-brand-soft-fg' : 'bg-card pr-1',
      )}
      title={locked ? 'The default group. Applies to every agent in the organisation.' : undefined}
    >
      {locked ? <ShieldCheck className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5 text-muted-foreground" />}
      <span className="font-medium">{group.name}</span>
      <span className={cn('tabular-nums', locked ? 'opacity-70' : 'text-muted-foreground')}>
        {group.member_count}
      </span>
      {locked ? (
        <Lock className="h-3 w-3 opacity-60" />
      ) : (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${group.name}`}
          className="grid h-5 w-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

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

  const commit = async (next: string[]) => {
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
  const chosen = selected.map((id) => all.find((g) => g.id === id)).filter((g): g is AgentAccessGroup => !!g && !g.is_default);
  const addable = all.filter((g) => !g.is_default && !selected.includes(g.id));

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading access…
      </p>
    );
  }

  const nobody = !defaultGroup && chosen.length === 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground/90">
          Who can act on this agent
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </span>
        {/* The picker can put an agent in a group but not create or staff one,
            so the link hands off rather than pretending to. */}
        <Link href="/access" className="text-xs text-brand hover:underline">Manage groups</Link>
      </div>

      <div className="rounded-[var(--r-md)] border bg-card/50 p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {defaultGroup && <GroupChip group={defaultGroup} locked />}
          {chosen.map((g) => (
            <GroupChip
              key={g.id}
              group={g}
              disabled={saving}
              onRemove={() => commit(selected.filter((id) => id !== g.id))}
            />
          ))}
          {addable.length > 0 && (
            <div className="min-w-[180px] flex-1">
              <SearchableSelect
                value=""
                onChange={(v) => { if (v) void commit([...selected, v]); }}
                options={addable.map((g) => ({ value: g.id, label: `${g.name} · ${g.member_count} member${g.member_count === 1 ? '' : 's'}` }))}
                placeholder="Add a group…"
                disabled={saving}
                className="h-7 border-dashed text-xs shadow-none"
              />
            </div>
          )}
          {nobody && addable.length === 0 && (
            <span className="px-1 text-xs text-muted-foreground">No groups exist yet.</span>
          )}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {nobody
          ? 'With no group, anyone with Agent Center access can act on this agent — the same as the app allows.'
          : defaultGroup
            ? 'The default group always applies; groups added here are granted on top of it.'
            : 'Only members of these groups can act on this agent.'}
      </p>
    </div>
  );
}
