'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputsList } from './InputsList';

/**
 * The Login URL is gone from here too, for the same reason as the verify
 * script: it duplicated something a script already states. The login script's
 * first step is a navigate (enforced in step-schema.js), and that address IS
 * where signing in begins — so it is derived on the pages that know which
 * script is attached, rather than typed here and left to drift.
 *
 * `url` stays on LoginFormData because the record still has one: the manual
 * (HITL) path navigates the operator's browser there. This form just no longer
 * asks a human to maintain it.
 *
 * A login used to carry a verify script — a browser script whose job was to
 * prove the session was signed in, picked here and required before the login
 * could be saved. It is gone from this form and from the runtime.
 *
 * What replaced it is a step of the business script itself, marked "Proves we
 * are signed in" in the script editor. The question is the same; asking it
 * during the run that needs the answer, rather than in a separate check before
 * it, is what changed. A verify script could pass and leave the session to
 * expire two steps later, and it cost a browser launch on every run to say so.
 */
export interface LoginFormData {
  name: string;
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
  // Nothing templated left to surface: the URL is gone and the name is not a
  // template. Kept as an empty list so the section's shape is unchanged for
  // any caller passing availableVars.
  const inputs: string[] = [];

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

      <InputsList inputs={inputs} availableVars={availableVars} />

      {footer}
    </div>
  );
}
