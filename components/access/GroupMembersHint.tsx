'use client';

/**
 * GroupMembersHint — hover the member count to see WHO is in the group. Members
 * live in Wazzi admin, so they're fetched lazily on first hover (not with the
 * list) to keep the groups table cheap.
 */

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { getRunGroupMembers, type RunAccessGroupMember } from '@/lib/api/agent-run-access';

export function GroupMembersHint({
  orgId, groupId, children, className,
}: {
  orgId: string | null;
  groupId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [members, setMembers] = React.useState<RunAccessGroupMember[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(() => {
    if (members || loading || !orgId) return;
    setLoading(true);
    getRunGroupMembers(orgId, groupId)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [orgId, groupId, members, loading]);

  const label = (m: RunAccessGroupMember) => {
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ');
    return { name: name || m.email, sub: name ? m.email : null };
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip onOpenChange={(open) => { if (open) load(); }}>
        <TooltipTrigger asChild>
          <span className={cn('cursor-default underline decoration-dotted underline-offset-2', className)}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-xs leading-relaxed">
          {loading ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading members…</span>
          ) : !members || members.length === 0 ? (
            'No members — managed in Wazzi admin.'
          ) : (
            <ul className="space-y-0.5">
              {members.map((m) => {
                const { name, sub } = label(m);
                return (
                  <li key={m.email}>
                    <span className="text-foreground">{name}</span>
                    {sub && <span className="text-muted-foreground/70"> · {sub}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
