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

/*
 * All neutral. A trigger is metadata about a run, not its state — and the
 * brand/info fills it used to wear were the same colours the status column
 * beside it uses for "needs a person" and "running", so a Decision trigger
 * next to a Completed badge read as a second status. The glyph carries the
 * type; only the two that point at something else get a tint: a decision
 * (a person answered — brand, as everywhere) and a sub-agent (the Run Agent
 * step colour).
 */
const TRIGGERS: Record<string, { icon: React.ReactNode; label: string }> = {
  webhook: { icon: <Webhook className="h-3 w-3" />, label: 'Webhook' },
  cron:    { icon: <Clock className="h-3 w-3" />,   label: 'Cron' },
  manual:  { icon: <Play className="h-3 w-3" />,    label: 'Manual' },
  // Execution-only trigger types. These never appear in the Trigger card on
  // the agent editor — agent_triggers has no matching rows — but they are
  // what actually started a run, so the history has to name them.
  decision:  { icon: <Gavel className="h-3 w-3 text-brand" />,          label: 'Decision' },
  sub_agent: { icon: <GitBranch className="h-3 w-3 text-step-agent" />, label: 'Sub-agent' },
  internal:  { icon: <Zap className="h-3 w-3" />,                       label: 'Internal' },
};

export function TriggerBadge({ type }: { type: string }) {
  const def = TRIGGERS[type] ?? { icon: null, label: type };
  return (
    <Badge variant="neutral" className="gap-1 text-xs">
      {def.icon}{def.label}
    </Badge>
  );
}

/** Plain label for a trigger type, for prose and tooltips. */
export function triggerLabel(type?: string | null): string {
  if (!type) return 'Unknown';
  return TRIGGERS[type]?.label ?? type;
}
