'use client';

import { type BrowserScript, type RecordedStep } from '@/lib/api/scripts';
import { Label } from '@/components/ui/label';
import { ArrowUpFromLine } from 'lucide-react';
import { InputsList } from './InputsList';

interface Props {
  script: BrowserScript;
  /**
   * Optional list of variable names produced by prior actions in the
   * surrounding workflow.  When provided, Required Input pills are colored
   * green (available) or amber (missing).  When omitted, pills are neutral.
   */
  availableVars?: string[];
}

/**
 * Parameters stored on the script are its INPUTS (what it reads from the
 * execution context via {{variable}} references).
 * Outputs are derived from `extract` steps with a `field_name` — those write
 * new variables that downstream actions can reference.
 */
function deriveOutputs(steps: RecordedStep[]): string[] {
  const names = new Set<string>();
  for (const s of steps ?? []) {
    if (s.action === 'extract' && s.field_name) names.add(s.field_name);
  }
  return Array.from(names);
}

export function BrowserScriptPreview({ script, availableVars }: Props) {
  const stepCount = Array.isArray(script.steps) ? script.steps.length : 0;
  const inputs  = script.parameters && typeof script.parameters === 'object'
    ? Object.keys(script.parameters)
    : [];
  const outputs = deriveOutputs(script.steps ?? []);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      {script.description && (
        <p className="text-sm text-muted-foreground italic">{script.description}</p>
      )}

      <InputsList inputs={inputs} availableVars={availableVars} />

      {outputs.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <ArrowUpFromLine className="h-3 w-3" /> Produces Outputs
          </Label>
          <div className="flex flex-wrap gap-1">
            {outputs.map((p) => (
              <span key={p} className="text-[11px] font-mono px-2 py-0.5 rounded border bg-background">
                {`{{${p}}}`}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Downstream actions can reference these as {'{{variables}}'}.
          </p>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground pt-1 border-t">
        {stepCount} recorded step{stepCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
