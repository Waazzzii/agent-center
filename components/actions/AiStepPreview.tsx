'use client';

import { type AiStep } from '@/lib/api/ai-steps';
import { AiStepFormBody, type ConnectorOption } from './AiStepFormBody';

/**
 * Read-only preview of an AI step shown inline in the workflow action
 * configuration dialog.  Renders the same form body as the edit view so the
 * layout is identical — just disabled.
 */
export function AiStepPreview({
  step,
  connectors,
  availableVars,
}: {
  step: AiStep;
  connectors: ConnectorOption[];
  availableVars?: string[];
}) {
  // Read-only mode — no need for setForm to do anything useful.  Supply a
  // static form snapshot and a no-op setter.
  const form = {
    name: step.name,
    description: step.description ?? '',
    prompt: step.prompt,
    model: step.model,
    connector_ids: step.connector_ids ?? [],
    outputs: step.outputs ?? [],
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <AiStepFormBody
        form={form}
        setForm={() => {}}
        connectors={connectors}
        readOnly
        availableVars={availableVars}
      />
    </div>
  );
}
