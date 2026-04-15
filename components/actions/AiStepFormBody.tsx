'use client';

import { type AiStepOutput, buildOutputInstructionBlock } from '@/lib/api/ai-steps';
import { type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, ArrowUpFromLine } from 'lucide-react';
import { InputsList, parseVars } from './InputsList';

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

export const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { value: 'claude-opus-4',     label: 'Claude Opus 4' },
  { value: 'claude-haiku-4',    label: 'Claude Haiku 4' },
];

interface Props {
  form: AiStepFormData;
  setForm: (updater: (f: AiStepFormData) => AiStepFormData) => void;
  connectors: ConnectorOption[];
  skills: Skill[];
  readOnly?: boolean;
  /** When provided (workflow context), Required Inputs are colored by availability. */
  availableVars?: string[];
}

/**
 * The shared body of the AI step form.  Used by:
 *   - AiStepDialog on the AI Steps CRUD page (editable or read-only)
 *   - Workflow action configuration dialog (read-only, with availability)
 *
 * Rendering is identical across contexts so the read-only view matches the
 * edit view field-for-field.
 */
export function AiStepFormBody({ form, setForm, connectors, skills, readOnly = false, availableVars }: Props) {
  const toggleConnector = (id: string) => setForm((f) => ({
    ...f,
    connector_ids: f.connector_ids.includes(id)
      ? f.connector_ids.filter((x) => x !== id)
      : [...f.connector_ids, id],
  }));
  const toggleSkill = (id: string) => setForm((f) => ({
    ...f,
    skill_ids: f.skill_ids.includes(id)
      ? f.skill_ids.filter((x) => x !== id)
      : [...f.skill_ids, id],
  }));
  const addOutput = () => setForm((f) => ({ ...f, outputs: [...f.outputs, { key: '', description: '' }] }));
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

      <div className="space-y-1">
        <Label>Prompt {!readOnly && <span className="text-destructive">*</span>}</Label>
        <Textarea
          rows={readOnly ? 6 : 8}
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          placeholder="Use {{variable}} to reference values from prior steps"
          disabled={readOnly}
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
          {!readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={addOutput} className="h-7 text-xs">
              <Plus className="h-3.5 w-3.5 mr-0.5" /> Add output
            </Button>
          )}
        </div>
        {!readOnly && (
          <p className="text-[11px] text-muted-foreground">
            Declare the JSON keys this step should return.  The executor appends a JSON
            instruction to the prompt automatically and parses the response into the
            execution context — you don&apos;t need to write &quot;respond with JSON&quot; yourself.
          </p>
        )}
        {form.outputs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {readOnly ? 'No declared outputs.' : 'No declared outputs — response will be captured as free-form text.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {form.outputs.map((o, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  placeholder="key"
                  value={o.key}
                  onChange={(e) => updateOutput(i, { key: e.target.value })}
                  disabled={readOnly}
                  className="w-40 text-xs font-mono"
                />
                <Input
                  placeholder="Description of what goes in this key"
                  value={o.description}
                  onChange={(e) => updateOutput(i, { description: e.target.value })}
                  disabled={readOnly}
                  className="flex-1 text-xs"
                />
                {!readOnly && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeOutput(i)} className="h-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live preview of the auto-appended JSON instruction.  Exactly what
            the executor concatenates to the prompt at runtime, so users can
            see what Claude will actually receive. */}
        {form.outputs.some((o) => o.key.trim()) && (
          <div className="space-y-1 pt-1">
            <Label className="text-[11px] text-muted-foreground">
              Auto-appended to prompt at runtime
            </Label>
            <pre className="text-[11px] font-mono whitespace-pre-wrap bg-background/60 rounded-md border border-dashed p-2 text-muted-foreground">
              {buildOutputInstructionBlock(form.outputs).trimStart()}
            </pre>
          </div>
        )}
      </div>

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
              {MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {connectors.length > 0 && (
        <div className="space-y-1">
          <Label>Connectors (MCP tools)</Label>
          <div className="flex flex-wrap gap-1.5">
            {connectors.map((c) => {
              const active = form.connector_ids.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleConnector(c.id)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-foreground/30'}`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {skills.length > 0 && (
        <div className="space-y-1">
          <Label>Skills</Label>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => {
              const active = form.skill_ids.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleSkill(s.id)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:border-foreground/30'}`}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
