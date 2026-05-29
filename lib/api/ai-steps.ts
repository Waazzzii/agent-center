import agentClient from './agent-client';

export interface AiStepOutput {
  /** JSON key name, e.g. "reservations" */
  key: string;
  /** Human-readable description of what goes in this key. Sent to Claude. */
  description: string;
  /**
   * When false, the executor's declared_outputs verifier will NOT flip
   * the item's `_status='failed'` if this key is missing or null/empty.
   * Defaults to required (true) — absent / true on legacy rows means
   * "must be present, non-null, non-blank" exactly as before.
   *
   * Use case: a field that only applies to certain scenarios (e.g.
   * `cancellation_reason` on a status field that's sometimes "active").
   * The model can omit it / return null without failing the whole step.
   */
  required?: boolean;
}

/**
 * Render the JSON output instruction block that the executor auto-appends
 * to every AI step prompt at runtime.
 *
 * Two modes:
 *   • Declared outputs → strict schema; each array element must contain
 *     every declared key. Validated post-hoc.
 *   • No declared outputs → soft default: ask for `[{ "result": "..." }]`.
 *     Not enforced (raw response returned), but nudges the model toward
 *     parseable output for downstream consumers.
 *
 * The response is ALWAYS a JSON array of objects — single-result responses
 * become a one-element array.  This makes the shape consistent and lets
 * downstream sub-agents iterate without guessing.
 *
 * IMPORTANT: keep this in sync with the executor's inline version in
 * `agent-backend/services/agents/agent-executor.service.js` → runPromptAction.
 * Both must produce identical text so the UI preview matches what Claude
 * actually receives.
 */
export function buildOutputInstructionBlock(outputs: AiStepOutput[]): string {
  const usable = outputs.filter((o) => o.key.trim());
  if (usable.length === 0) {
    return [
      '',
      '---',
      'OUTPUT FORMAT — strongly preferred:',
      '• Respond with ONLY a JSON array of result objects. No markdown fences (```), no surrounding prose.',
      '• Default shape when no specific schema is required:',
      '[',
      '  { "result": "your result here" }',
      ']',
      '• If you have multiple results, emit one array element per result. If none, emit [].',
      '• Make sure the JSON is syntactically valid: matching brackets, no trailing commas, all strings closed.',
    ].join('\n');
  }
  const schemaLines = usable
    .map((o) => {
      // Required by default; only annotate when explicitly optional so
      // existing prompts don't drift.
      const optionalMarker = o.required === false ? ' [optional]' : '';
      return `    "${o.key.trim()}": ${JSON.stringify((o.description ?? '') + optionalMarker)}`;
    })
    .join(',\n');
  const hasOptional = usable.some((o) => o.required === false);
  return [
    '',
    '---',
    'OUTPUT FORMAT — strict requirements:',
    '• Respond with ONLY a JSON array. No markdown fences (```), no prose before or after, no comments.',
    '• Output a single complete JSON value — do not split across multiple messages.',
    '• Each element matches this schema:',
    '[',
    '  {',
    schemaLines,
    '  }',
    ']',
    '• Return ALL results found as separate elements in the array.  If only one result, return a one-element array.  If none, return an empty array [].',
    '• Each value must be the actual data described — do NOT repeat the description.',
    '• Do NOT invent placeholder values or partial words. If a field has no real value, use null.',
    ...(hasOptional
      ? ['• Keys marked [optional] in the schema may be omitted or set to null when they don\'t apply to the result — don\'t fabricate them.']
      : []),
    '• Make sure the JSON is syntactically valid: matching brackets, no trailing commas, all strings closed.',
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
