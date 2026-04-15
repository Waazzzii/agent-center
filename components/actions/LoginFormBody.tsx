'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { InputsList, parseVarsAcross } from './InputsList';

export interface LoginFormData {
  name: string;
  url: string;
  verify_text: string;
}

interface Props {
  form: LoginFormData;
  setForm: (updater: (f: LoginFormData) => LoginFormData) => void;
  readOnly?: boolean;
  availableVars?: string[];
  /** Optional footer content rendered after the form (e.g. last checked timestamps). */
  footer?: React.ReactNode;
}

export function LoginFormBody({ form, setForm, readOnly = false, availableVars, footer }: Props) {
  const inputs = parseVarsAcross(form.url, form.verify_text);

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="space-y-1">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Salesforce production"
            disabled={readOnly}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label>Login URL {!readOnly && <span className="text-destructive">*</span>}</Label>
        <Input
          value={form.url}
          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          placeholder="https://app.example.com/login"
          disabled={readOnly}
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label>Verification Text {!readOnly && <span className="text-destructive">*</span>}</Label>
        <Textarea
          rows={3}
          value={form.verify_text}
          onChange={(e) => setForm((f) => ({ ...f, verify_text: e.target.value }))}
          placeholder="Text or element that indicates the user is logged in, e.g. 'Dashboard'"
          disabled={readOnly}
          className="text-xs"
        />
        {!readOnly && (
          <p className="text-xs text-muted-foreground">The agent will check for this to confirm login succeeded.</p>
        )}
      </div>

      <InputsList inputs={inputs} availableVars={availableVars} />

      {footer}
    </div>
  );
}
