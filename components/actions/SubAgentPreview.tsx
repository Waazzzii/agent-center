'use client';

import { type Agent } from '@/lib/api/agents';
import { Badge } from '@/components/ui/badge';


export function SubAgentPreview({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      {/* The "needs browser / no browser" pair is gone with the
          requires_browser flag. It was a self-declared label, not a fact —
          whether a run takes a browser is decided per action from the steps
          themselves, so the badge could disagree with what actually happened.
          Only rendered when there is something to say, so the preview does
          not open with an empty row. */}
      {!agent.is_active && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400">Inactive</Badge>
        </div>
      )}

      {agent.description && (
        <p className="text-sm text-muted-foreground italic">{agent.description}</p>
      )}

      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        Sub-agent runs the target agent&apos;s workflow end-to-end for each input in the batch.
      </p>
    </div>
  );
}
