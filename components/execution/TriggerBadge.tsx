'use client';

/**
 * What set a run off.
 *
 * Shared by the run feed and the run detail's Trigger zone. It lived in the
 * feed as a local component until the detail page needed the same vocabulary —
 * and a second copy is how "Gavel means decision" quietly becomes true in one
 * place and not the other.
 *
 * Icons match the rest of the product deliberately: Gavel is a decision
 * everywhere (Decisions, the desk screen, the sidebar), GitBranch is a
 * sub-agent everywhere. Reusing either for something else makes a list where
 * two different things wear one icon.
 */

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Webhook, Clock, Play, Gavel, GitBranch, Zap } from 'lucide-react';

const TRIGGERS: Record<string, {
  icon: React.ReactNode;
  label: string;
  variant: 'brand' | 'info' | 'neutral';
}> = {
  webhook: { icon: <Webhook className="h-3 w-3" />, label: 'Webhook', variant: 'brand' },
  cron:    { icon: <Clock className="h-3 w-3" />,   label: 'Cron',    variant: 'info' },
  manual:  { icon: <Play className="h-3 w-3" />,    label: 'Manual',  variant: 'neutral' },
  // Execution-only trigger types. These never appear in the Trigger card on
  // the agent editor — agent_triggers has no matching rows — but they are
  // what actually started a run, so the history has to name them.
  decision:  { icon: <Gavel className="h-3 w-3" />,     label: 'Decision',  variant: 'brand' },
  sub_agent: { icon: <GitBranch className="h-3 w-3" />, label: 'Sub-agent', variant: 'info' },
  internal:  { icon: <Zap className="h-3 w-3" />,       label: 'Internal',  variant: 'neutral' },
};

export function TriggerBadge({ type }: { type: string }) {
  const def = TRIGGERS[type] ?? { icon: null, label: type, variant: 'neutral' as const };
  return (
    <Badge variant={def.variant} className="gap-1 text-xs">
      {def.icon}{def.label}
    </Badge>
  );
}

/** Plain label for a trigger type, for prose and tooltips. */
export function triggerLabel(type?: string | null): string {
  if (!type) return 'Unknown';
  return TRIGGERS[type]?.label ?? type;
}
