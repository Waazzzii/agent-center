'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputsList, parseVarsAcross } from './InputsList';

export interface LoginFormData {
  name: string;
  url: string;
  /** Browser-script ID that verifies the login state. Required. */
  verify_script_id: string | null;
}

export interface VerifyScriptOption {
  id: string;
  name: string;
}

interface Props {
  form: LoginFormData;
  setForm: (updater: (f: LoginFormData) => LoginFormData) => void;
  /** All available browser scripts for the org — used to populate the
   *  verify-script dropdown. The current value must be present in the list
   *  for the dropdown to render its name correctly. */
  verifyScriptOptions?: VerifyScriptOption[];
  readOnly?: boolean;
  availableVars?: string[];
  /** Optional footer content rendered after the form (e.g. last checked timestamps). */
  footer?: React.ReactNode;
}

export function LoginFormBody({ form, setForm, verifyScriptOptions = [], readOnly = false, availableVars, footer }: Props) {
  const inputs = parseVarsAcross(form.url);

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
        <Label>Verify Script {!readOnly && <span className="text-destructive">*</span>}</Label>
        <Select
          value={form.verify_script_id ?? '__none__'}
          onValueChange={(v) => setForm((f) => ({ ...f, verify_script_id: v === '__none__' ? null : v }))}
          disabled={readOnly}
        >
          <SelectTrigger className="text-xs">
            <SelectValue placeholder="Select a browser script that proves logged-in state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" disabled>
              Select a verify script…
            </SelectItem>
            {verifyScriptOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!readOnly && (
          <p className="text-xs text-muted-foreground">
            Required. The agent runs this script to confirm the session is logged in. Successful run = logged in; any step failure or timeout = not logged in. Same engine as auto-login scripts.
          </p>
        )}
      </div>

      <InputsList inputs={inputs} availableVars={availableVars} />

      {footer}
    </div>
  );
}
