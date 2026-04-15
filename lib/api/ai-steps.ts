import agentClient from './agent-client';

export interface AiStepOutput {
  /** JSON key name, e.g. "reservations" */
  key: string;
  /** Human-readable description of what goes in this key. Sent to Claude. */
  description: string;
}

/**
 * Render the JSON output instruction block that the executor auto-appends
 * to every AI step prompt at runtime when outputs are declared.
 *
 * IMPORTANT: keep this in sync with the executor's inline version in
 * `agent-backend/services/agents/agent-executor.service.js` → runPromptAction.
 * Both must produce identical text so the UI preview matches what Claude
 * actually receives.
 */
export function buildOutputInstructionBlock(outputs: AiStepOutput[]): string {
  const usable = outputs.filter((o) => o.key.trim());
  if (usable.length === 0) return '';
  const schemaLines = usable
    .map((o) => `  "${o.key.trim()}": ${JSON.stringify(o.description ?? '')}`)
    .join(',\n');
  return [
    '',
    '---',
    'Respond with ONLY a JSON object (no markdown fences, no surrounding prose) matching this schema:',
    '{',
    schemaLines,
    '}',
    'Each key\'s value must be the actual data described — do NOT repeat the description.',
  ].join('\n');
}

export interface AiStep {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  prompt: string;
  model: string;
  connector_ids: string[];
  /** Declared output schema — executor appends JSON instruction + parses result. */
  outputs: AiStepOutput[];
  skill_ids?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface AiStepInput {
  name: string;
  description?: string | null;
  prompt: string;
  model?: string;
  connector_ids?: string[];
  outputs?: AiStepOutput[];
  skill_ids?: string[];
}

export async function listAiSteps(orgId: string): Promise<AiStep[]> {
  const res = await agentClient.get<AiStep[]>(`/api/admin/${orgId}/ai-steps`);
  return res.data;
}

export async function getAiStep(orgId: string, id: string): Promise<AiStep> {
  const res = await agentClient.get<AiStep>(`/api/admin/${orgId}/ai-steps/${id}`);
  return res.data;
}

export async function createAiStep(orgId: string, data: AiStepInput): Promise<AiStep> {
  const res = await agentClient.post<AiStep>(`/api/admin/${orgId}/ai-steps`, data);
  return res.data;
}

export async function updateAiStep(orgId: string, id: string, data: Partial<AiStepInput>): Promise<AiStep> {
  const res = await agentClient.patch<AiStep>(`/api/admin/${orgId}/ai-steps/${id}`, data);
  return res.data;
}

export async function deleteAiStep(orgId: string, id: string): Promise<void> {
  await agentClient.delete(`/api/admin/${orgId}/ai-steps/${id}`);
}
