'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface SkillFormData {
  name: string;
  description: string;
  content: string;
}

interface Props {
  form: SkillFormData;
  setForm: (updater: (f: SkillFormData) => SkillFormData) => void;
  readOnly?: boolean;
}

/**
 * The shared body of the Skill form — reused wherever a skill is created or
 * edited (the Skills page, and inline from the AI-step skill chips). A skill is
 * a reusable instruction block: name + description + content.
 */
export function SkillFormBody({ form, setForm, readOnly = false }: Props) {
  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="space-y-1">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Format currency"
            disabled={readOnly}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label>Description</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Short summary of what this skill does"
          disabled={readOnly}
        />
      </div>
      <div className="space-y-1">
        <Label>Content {!readOnly && <span className="text-destructive">*</span>}</Label>
        <Textarea
          rows={10}
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          placeholder="The reusable instructions this skill injects into the prompt."
          className="font-mono text-xs"
          disabled={readOnly}
        />
      </div>
    </div>
  );
}
