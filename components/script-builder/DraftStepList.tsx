'use client';

/**
 * Read-only live view of the AI Script Builder's draft steps.
 *
 * Rendering reuses StepDescription from the script editor so authored steps
 * look identical to recorded ones. Highlights:
 *   • currentTestIndex — step being executed by run_draft (pulsing dot)
 *   • failedIndex — step the last test run failed at (red accent)
 *   • verified — green check on the header when the draft passed a full run
 */

import { useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle2, ListChecks } from 'lucide-react';
import { StepDescription } from '@/components/record/StepEditor';
import type { BuilderDraft } from '@/lib/api/script-builder';

interface DraftStepListProps {
  draft: BuilderDraft | null;
  currentTestIndex: number | null;
  failedIndex: number | null;
  className?: string;
}

export function DraftStepList({ draft, currentTestIndex, failedIndex, className }: DraftStepListProps) {
  const steps = draft?.steps ?? [];
  const params = Object.keys(draft?.parameters ?? {});
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(0);

  // Auto-scroll when the agent appends steps.
  useEffect(() => {
    if (steps.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCountRef.current = steps.length;
  }, [steps.length]);

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ListChecks className="h-3.5 w-3.5" />
          Draft script {steps.length > 0 && `(${steps.length} steps)`}
        </span>
        {draft?.verified && (
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {steps.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No steps drafted yet — the agent is still exploring.
          </p>
        ) : (
          <ul>
            {steps.map((step, i) => {
              const isCurrent = currentTestIndex === i;
              const isFailed = failedIndex === i;
              return (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2 px-3 py-1.5 border-b border-border/40 text-sm',
                    isCurrent && 'bg-brand/10',
                    isFailed && 'border-l-2 border-l-red-500 bg-red-500/5',
                  )}
                >
                  <span className="mt-0.5 w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {step.name && (
                      <p className="text-xs font-medium truncate">{step.name}</p>
                    )}
                    <StepDescription step={step} />
                  </div>
                  <span className="mt-0.5 shrink-0">
                    {isCurrent ? (
                      <span className="block h-2 w-2 rounded-full bg-brand animate-pulse" />
                    ) : isFailed ? (
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    ) : step._tested ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/70" />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {params.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2 shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Variables</span>
          {params.map((p) => (
            <Badge
              key={p}
              variant="default"
              className="bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30 text-xs px-1.5 py-0 h-5 font-mono"
            >
              {`{{${p}}}`}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
