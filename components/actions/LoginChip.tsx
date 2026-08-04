'use client';

import { useState } from 'react';
import { updateLogin, type Login } from '@/lib/api/logins';
import { LoginFormBody, type LoginFormData } from './LoginFormBody';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { LogIn, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VerifyScriptOption { id: string; name: string; }

/**
 * The login for a browser-script step, shown as a compact card-styled piece
 * beside the step (matching the step card's height/style). The WHOLE piece is
 * clickable — it opens the reusable login editor in a right slide-out. Purely a
 * presentation of the existing paired login action; no data-model change.
 */
export function LoginChip({ orgId, login, verifyScriptOptions, onChanged, onDetach, readOnly }: {
  orgId: string | null;
  login: Login | null;
  verifyScriptOptions: VerifyScriptOption[];
  onChanged?: () => void;
  /** Detach the login from this workflow step (removes the paired login step; the login profile stays). */
  onDetach?: () => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!login) return null;
  return (
    <>
      <div
        onClick={(e) => { e.stopPropagation(); if (!readOnly) setOpen(true); }}
        title={`Login: ${login.name} — click to edit`}
        className={cn(
          'group relative inline-flex min-w-0 shrink-0 grow-0 basis-1/3 items-center gap-1 self-stretch rounded-[var(--r-xl)] border bg-card pl-3 pr-1 shadow-[var(--shadow-sm)] transition-colors',
          !readOnly && 'cursor-pointer hover:bg-muted/40',
        )}
      >
        {/* Type indicator hanging off the top-left corner, like the step icons. */}
        <span className="absolute -top-2.5 -left-2.5 z-10 grid h-5 w-5 place-items-center rounded-md bg-sky-100 text-sky-700 ring-2 ring-background dark:bg-sky-900/30 dark:text-sky-400">
          <LogIn className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{login.name}</span>
        {onDetach && !readOnly && (
          <button
            type="button"
            title="Detach login from this step"
            onClick={(e) => { e.stopPropagation(); onDetach(); }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && orgId && (
        <LoginEditSheet
          orgId={orgId}
          login={login}
          verifyScriptOptions={verifyScriptOptions}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function LoginEditSheet({ orgId, login, verifyScriptOptions, onClose, onChanged }: {
  orgId: string;
  login: Login;
  verifyScriptOptions: VerifyScriptOption[];
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [form, setForm] = useState<LoginFormData>({
    name: login.name, url: login.url, verify_script_id: login.verify_script_id ?? null,
  });
  const [saving, setSaving] = useState(false);
  const valid = !!(form.name.trim() && form.url.trim() && form.verify_script_id);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await updateLogin(orgId, login.id, {
        name: form.name.trim(), url: form.url.trim(), verify_script_id: form.verify_script_id as string,
      });
      toast.success('Login updated');
      onChanged?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.message || 'Failed to update login');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 py-4 sm:px-6"><SheetTitle>Edit login</SheetTitle></SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <LoginFormBody form={form} setForm={setForm} verifyScriptOptions={verifyScriptOptions} />
        </div>
        <SheetFooter className="border-t px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !valid}>{saving ? 'Saving…' : 'Save'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
