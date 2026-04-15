'use client';

import { type AiStep } from '@/lib/api/ai-steps';
import { type Skill } from '@/lib/api/skills';
import { AiStepFormBody, type ConnectorOption } from './AiStepFormBody';

/**
 * Read-only preview of an AI step shown inline in the workflow action
 * configuration dialog.  Renders the same form body as the edit view so the
 * layout is identical — just disabled.
 */
export function AiStepPreview({
  step,
  connectors,
  skills,
  availableVars,
}: {
  step: AiStep;
  connectors: ConnectorOption[];
  skills: Skill[];
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
    skill_ids: step.skill_ids ?? [],
  };

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <AiStepFormBody
        form={form}
        setForm={() => {}}
        connectors={connectors}
        skills={skills}
        readOnly
        availableVars={availableVars}
      />
    </div>
  );
}
