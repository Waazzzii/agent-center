'use client';

import { Label } from '@/components/ui/label';
import { InputsList, parseVars } from './InputsList';

/**
 * Preview for the approval action type.  Unlike the others, approvals don't
 * reference a reusable entity — the instructions are inline on the action
 * itself.  This component renders the instructions as a read-only block and
 * surfaces the {{variables}} used inside them.
 */
export function ApprovalPreview({
  instructions,
  availableVars,
}: {
  instructions: string;
  availableVars?: string[];
}) {
  if (!instructions?.trim()) return null;
  const inputs = parseVars(instructions);

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Preview</Label>
        <p className="text-sm whitespace-pre-wrap">{instructions}</p>
      </div>

      <InputsList inputs={inputs} availableVars={availableVars} />
    </div>
  );
}
