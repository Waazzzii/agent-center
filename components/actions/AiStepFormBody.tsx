'use client';

import { type AiStepOutput, buildOutputInstructionBlock } from '@/lib/api/ai-steps';
import { type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useEffect } from 'react';
import { Plus, Trash2, ArrowUpFromLine } from 'lucide-react';
import { InputsList, parseVars } from './InputsList';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { SkillChips } from './SkillChips';
import { useAiModels } from '@/lib/hooks/use-ai-models';

export interface ConnectorOption { id: string; label: string; }

export interface AiStepFormData {
  name: string;
  description: string;
  prompt: string;
  model: string;
  connector_ids: string[];
  outputs: AiStepOutput[];
  skill_ids: string[];
}

/**
 * The model list is NOT here any more.
 *
 * It comes from the backend (`GET /:orgId/ai-models`, backed by the `ai_models`
 * table) via `useAiModels`. It used to be a literal in this file — one of three
 * copies across three repos with no shared package — and they drifted: the MCP
 * still validated against the previous generation, so authoring a step on a
 * current model through the MCP was rejected while this dropdown offered it.
 *
 * DEFAULT_MODEL is gone for the same reason. A new step takes its default from
 * the catalog's `is_default` row; there is nothing to keep in sync by hand.
 */

interface Props {
  form: AiStepFormData;
  setForm: (updater: (f: AiStepFormData) => AiStepFormData) => void;
  connectors: ConnectorOption[];
  skills: Skill[];
  readOnly?: boolean;
  /** When provided (workflow context), Required Inputs are colored by availability. */
  availableVars?: string[];
  /** Org id — enables inline skill create/edit from the skill chips. */
  orgId?: string | null;
  /** Called after a skill is created/updated so the parent can refetch the skills list. */
  onSkillsChanged?: () => void;
  /** Show the Skills section. Off in the workflow flyout — skills are managed on
   *  the step card there. Default true (standalone AI-step editor). */
  showSkills?: boolean;
}

/**
 * The shared body of the AI step form.  Used by:
 *   - AiStepDialog on the AI Steps CRUD page (editable or read-only)
 *   - Workflow action configuration dialog (read-only, with availability)
 *
 * Rendering is identical across contexts so the read-only view matches the
 * edit view field-for-field.
 */
/**
 * showSkills defaults to FALSE: the old skill library is retired.
 *
 * Skills were attachable prompt fragments you assigned to an AI step. Now that
 * AI steps are themselves the reusable, shareable unit that routines are built
 * from, a second layer of attachable things inside them was a distinction
 * without a difference — and one more concept for an operator to learn before
 * they could build anything.
 *
 * Deliberately hidden rather than deleted. Existing skill_ids stay on their
 * rows and keep being honoured at run time, so nothing that works today stops
 * working; there is just no longer a way to add more. Pass showSkills to opt a
 * surface back in if that turns out to be wrong.
 */
export function AiStepFormBody({ form, setForm, connectors, skills, readOnly = false, availableVars, orgId, onSkillsChanged, showSkills = false }: Props) {
  // The catalog, from the backend. `models` carries retired rows too, which is
  // what lets a step on an old model show a label instead of a raw id.
  const { models: catalogModels, selectable: selectableModels, defaultModel } = useAiModels(orgId);
  const catalogLabel = (id: string) =>
    catalogModels.find((m) => m.model_id === id)?.label ?? id;

  /**
   * Fill in the catalog default when the caller seeded no model.
   *
   * Owned HERE rather than by each page, because there are five places that
   * build this form's state and every one of them had hardcoded its own model.
   * They all kept saying claude-sonnet-4-6 long after it was retired — the
   * dropdown showed the current models while the selected value was the old
   * one. A page now seeds `model: ''` and the shared form answers, so the next
   * page someone adds cannot reintroduce a stale literal.
   *
   * Only ever fills a BLANK. An existing step's model is never touched, and
   * nothing is written in read-only views.
   */
  useEffect(() => {
    if (readOnly || form.model || !defaultModel) return;
    setForm((f) => (f.model ? f : { ...f, model: defaultModel }));
  }, [readOnly, form.model, defaultModel, setForm]);

  const addOutput = () => setForm((f) => ({
    ...f,
    // Required by default — opt-out by unchecking the box. Matches the
    // legacy behavior where every declared output was strict.
    outputs: [...f.outputs, { key: '', description: '', required: true }],
  }));
  const updateOutput = (idx: number, patch: Partial<AiStepOutput>) => setForm((f) => ({
    ...f,
    outputs: f.outputs.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
  }));
  const removeOutput = (idx: number) => setForm((f) => ({ ...f, outputs: f.outputs.filter((_, i) => i !== idx) }));

  const inputs = parseVars(form.prompt);

  return (
    <div className="space-y-3">
      {/* Name + Description hidden in read-only workflow context (redundant with dropdown) */}
      {!readOnly && (
        <>
          <div className="space-y-1">
            <Label>Name {!readOnly && <span className="text-destructive">*</span>}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Extract reservations"
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short summary of what this step does"
              disabled={readOnly}
            />
          </div>
        </>
      )}
      {readOnly && form.description && (
        <p className="text-sm text-muted-foreground italic">{form.description}</p>
      )}

      {readOnly ? (
        // ── Read-only: collapse prompt + auto-appended block into one final view ──
        <div className="space-y-1">
          <Label>Final Prompt</Label>
          <pre className="text-xs font-mono whitespace-pre-wrap bg-background rounded-md border p-2 max-h-64 overflow-auto">
            {form.prompt}{buildOutputInstructionBlock(form.outputs)}
          </pre>
          <p className="text-[10px] text-muted-foreground">
            Exactly what Claude receives — user prompt plus the auto-appended JSON instruction (if outputs are declared).
          </p>
        </div>
      ) : (
        // ── Editable: separate fields so users can configure each piece ──
        <>
          <div className="space-y-1">
            <Label>Prompt <span className="text-destructive">*</span></Label>
            <Textarea
              rows={8}
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              placeholder="Use {{variable}} to reference values from prior steps"
              className="font-mono text-xs"
            />
          </div>

          {/* Required Inputs (derived from {{vars}} in the prompt) */}
          <InputsList inputs={inputs} availableVars={availableVars} />

          {/* Outputs editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1">
                <ArrowUpFromLine className="h-3.5 w-3.5" /> Outputs
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={addOutput} className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-0.5" /> Add output
              </Button>
            </div>
            {/* One line, then the rest on demand. This was a four-line
                paragraph explaining machinery that is true of every AI step
                and changes for none of them — reference you read once and
                then scroll past forever, sitting between the Outputs label
                and the outputs themselves. */}
            <details className="group/outdoc">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground marker:content-none hover:text-foreground">
                Declare the JSON keys this step returns.
                <span className="ml-1 underline decoration-dotted underline-offset-2 group-open/outdoc:hidden">
                  How this works
                </span>
              </summary>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The executor appends a JSON instruction to the prompt automatically and parses
                the response into the execution context — you don&apos;t need to write
                &quot;respond with JSON&quot; yourself. When no keys are declared, it still
                nudges the model toward a
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">{`[{ "result": "..." }]`}</code>
                shape but skips strict validation.
              </p>
            </details>
            {form.outputs.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No declared outputs — response captured as free-form text (default JSON nudge still applies).</p>
            ) : (
              <div className="space-y-1.5">
                {form.outputs.map((o, i) => {
                  // Treat absent `required` as true so legacy rows
                  // (saved before this field existed) stay strict.
                  const isRequired = o.required !== false;
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <Input
                        placeholder="key"
                        value={o.key}
                        onChange={(e) => updateOutput(i, { key: e.target.value })}
                        className="w-40 text-xs font-mono"
                      />
                      <Input
                        placeholder="Description of what goes in this key"
                        value={o.description}
                        onChange={(e) => updateOutput(i, { description: e.target.value })}
                        className="flex-1 text-xs"
                      />
                      <label
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground select-none h-8 px-1.5 cursor-pointer shrink-0"
                        title="Unchecked: the executor accepts a missing or null value for this key without marking the item failed. Only valid for fields that don't apply to every result."
                      >
                        <Checkbox
                          checked={isRequired}
                          onCheckedChange={(checked) => updateOutput(i, { required: checked !== false })}
                        />
                        Required
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeOutput(i)} className="h-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Live preview of the auto-appended JSON instruction. Renders
                in both modes (declared schema vs. soft default) so the user
                can always see exactly what gets sent — but COLLAPSED, because
                it is a dozen lines of generated boilerplate that pushed Model
                and Connectors below the fold on every single step. Still one
                click away for the times you are debugging what the model
                actually received. */}
            <details className="pt-1">
              <summary className="cursor-pointer list-none text-[11px] text-muted-foreground marker:content-none hover:text-foreground">
                <span className="underline decoration-dotted underline-offset-2">
                  Show what gets appended to the prompt at runtime
                </span>
              </summary>
              <pre className="mt-1.5 text-[11px] font-mono whitespace-pre-wrap bg-background/60 rounded-md border border-dashed p-2 text-muted-foreground">
                {buildOutputInstructionBlock(form.outputs).trimStart()}
              </pre>
            </details>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Model</Label>
          <Select
            value={form.model}
            onValueChange={(v) => setForm((f) => ({ ...f, model: v }))}
            disabled={readOnly}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* A step still on a retired model has to render as ITSELF. Radix
                  shows an empty trigger when the value matches no item, so
                  omitting it would make every older step look unconfigured —
                  and the first person to hit Save while it read blank would be
                  the one who found out. Listed only when it is this step's
                  current value, so it is never something newly choosable. The
                  catalog returns retired rows precisely so this can show a
                  label rather than a raw id. */}
              {form.model && !selectableModels.some((m) => m.model_id === form.model) && (
                <SelectItem value={form.model}>
                  {catalogLabel(form.model)} — in use, no longer offered
                </SelectItem>
              )}
              {selectableModels.map((m) => (
                <SelectItem key={m.model_id} value={m.model_id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {connectors.length > 0 && (
        <div className="space-y-1">
          <Label>Connectors (MCP tools)</Label>
          <MultiSelectTags
            options={connectors.map((c) => ({ value: c.id, label: c.label }))}
            selected={form.connector_ids}
            onChange={(ids) => setForm((f) => ({ ...f, connector_ids: ids }))}
            placeholder="Select connectors…"
            disabled={readOnly}
          />
        </div>
      )}

      {showSkills && (!readOnly || form.skill_ids.length > 0) && (
        <div className="space-y-1">
          <Label>Skills</Label>
          <SkillChips
            orgId={orgId ?? null}
            skills={skills}
            selectedIds={form.skill_ids}
            onChange={(ids) => setForm((f) => ({ ...f, skill_ids: ids }))}
            onSkillsChanged={onSkillsChanged}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}
