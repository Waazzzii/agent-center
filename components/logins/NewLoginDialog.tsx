'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

/**
 * Create a login. Asks for the name, then opens the real editor.
 *
 * There used to be a whole create PAGE that mirrored the edit page field for
 * field, because a login needed a name, a URL and a verify script before it
 * could exist. It needs none of that now — the URL comes from the login
 * script's first navigate step and verification is gone — so all that was left
 * was a second copy of a form, kept in step by hand.
 *
 * Why a modal and not a draft-mode edit page: credentials, 2FA enrolment,
 * access groups and run history all key off a login id. Until the row exists
 * there is nothing to store them against, so a "draft" editor would accept a
 * password and silently drop it — and an unsaved-changes warning would not
 * help, because saving could not have stored it either. Creating the row first
 * means everything after this point is real.
 *
 * The cost is an abandoned row if someone types a name and walks away. That is
 * visible in the list and deletable in two clicks, which is a better failure
 * than a form that quietly discards a credential.
 */
export function NewLoginDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Creates the row and navigates. Throws to keep the dialog open on failure. */
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setName(''); setSaving(false); } }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onCreate(trimmed);
      // Left open on purpose — the caller navigates away, and closing here
      // first makes the list flash behind the dialog on a slow route change.
    } catch {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New login</DialogTitle>
          <DialogDescription className="text-xs">
            Just a name to start. The login script, credentials and two-factor are set up on
            the next screen — and the sign-in URL comes from the script, so there is nothing
            else to fill in here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit(); } }}
            placeholder="e.g. AirBnB — Scottsdale"
            disabled={saving}
          />
          <p className="text-[11px] text-muted-foreground">
            Name it for the identity, not the site — several logins often share one site.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {saving ? 'Creating…' : 'Create & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
