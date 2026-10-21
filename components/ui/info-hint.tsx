'use client';

/**
 * InfoHint — a small info icon with a tooltip. Replaces inline descriptions so
 * forms stay tight; the explanation is one hover away.
 */

import * as React from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

export function InfoHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="More information"
            className={cn('inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground', className)}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
