'use client';

import { type Agent } from '@/lib/api/agents';
import { Badge } from '@/components/ui/badge';
import { Monitor, MonitorOff } from 'lucide-react';

export function SubAgentPreview({ agent }: { agent: Agent }) {
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        {agent.requires_browser ? (
          <Badge variant="outline" className="gap-1 border-sky-400 text-sky-600 dark:text-sky-400">
            <Monitor className="h-3 w-3" />Needs browser
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-slate-400 text-slate-500">
            <MonitorOff className="h-3 w-3" />No browser
          </Badge>
        )}
        {!agent.is_active && (
          <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400">Inactive</Badge>
        )}
      </div>

      {agent.description && (
        <p className="text-sm text-muted-foreground italic">{agent.description}</p>
      )}

      <p className="text-[10px] text-muted-foreground pt-1 border-t">
        Sub-agent runs the target agent&apos;s workflow end-to-end for each input in the batch.
      </p>
    </div>
  );
}
