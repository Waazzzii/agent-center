'use client';

import { Label } from '@/components/ui/label';
import { ArrowDownToLine } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Extract every {{variable}} reference from a string. */
export function parseVars(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = new Set<string>();
  const re = /\{\{\s*(\w+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return Array.from(names);
}

/** Collect all {{vars}} across multiple text fields, de-duplicated. */
export function parseVarsAcross(...texts: (string | null | undefined)[]): string[] {
  const names = new Set<string>();
  for (const t of texts) for (const v of parseVars(t)) names.add(v);
  return Array.from(names);
}

/**
 * Shared "Required Inputs" section — reused by all entity previews.
 * When `availableVars` is provided, colors each pill green (available) or
 * amber (missing) for the surrounding workflow context.
 */
export function InputsList({
  inputs,
  availableVars,
}: {
  inputs: string[];
  availableVars?: string[];
}) {
  if (inputs.length === 0) return null;
  const hasAvailability = availableVars !== undefined;
  const missing = hasAvailability ? inputs.filter((v) => !availableVars!.includes(v)) : [];

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        <ArrowDownToLine className="h-3 w-3" /> Required Inputs
      </Label>
      <div className="flex flex-wrap gap-1">
        {inputs.map((v) => {
          const available = hasAvailability && availableVars!.includes(v);
          return (
            <span
              key={v}
              className={cn(
                'text-[11px] font-mono px-2 py-0.5 rounded border',
                !hasAvailability && 'bg-background border-border',
                hasAvailability && available && 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
                hasAvailability && !available && 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
              )}
            >
              {`{{${v}}}`}
            </span>
          );
        })}
      </div>
      {hasAvailability && missing.length > 0 && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Variables in amber aren&apos;t produced by any prior action.  Add a step that sets them, or make sure they&apos;re provided at trigger time.
        </p>
      )}
    </div>
  );
}
