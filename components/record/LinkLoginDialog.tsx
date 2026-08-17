'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { listLogins, type Login } from '@/lib/api/logins';
import { updateScript, propagateScriptLogin, getScriptAgentUsage, type BrowserScript } from '@/lib/api/scripts';

/**
 * Link (or unlink) the login profile whose authenticated session a script
 * runs inside.
 *
 * Lives OUTSIDE the live browser window on purpose. Linking is a
 * configuration decision with blast radius — it rewrites the paired login
 * step in every agent using this script — and burying that behind a
 * dropdown in the recorder's toolbar made it look like a per-session
 * preference. Inside the browser window the only login affordance is "Log
 * in", which just runs the linked login now.
 *
 * The agent-impact confirmation is the reason this is a shared component
 * rather than two call sites: it must not be possible to change the link
 * from a surface that forgot to warn.
 */
export function LinkLoginDialog({
  open, onClose, orgId, script, onLinked,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
  script: BrowserScript | null;
  onLinked?: (loginId: string | null) => void;
}) {
  const [logins, setLogins] = useState<Login[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId || !script) return;
    setSelected(script.login_id ?? null);
    setAgentCount(null);
    listLogins(orgId).then(setLogins).catch(() => setLogins([]));
    // Counted up front rather than at confirm time so the warning is visible
    // BEFORE the operator commits to a choice.
    getScriptAgentUsage(orgId, script.id)
      .then((u) => setAgentCount(u.count))
      .catch(() => setAgentCount(0));
  }, [open, orgId, script]);

  const changed = !!script && selected !== (script.login_id ?? null);
  const unlinking = changed && selected === null;

  const handleSave = async () => {
    if (!orgId || !script || !changed) { onClose(); return; }
    setSaving(true);
    try {
      await updateScript(orgId, script.id, { login_id: selected });
      // Best-effort: a propagate failure doesn't roll back the link, it just
      // means the agent editors sync on their next visit.
      const propagated = await propagateScriptLogin(orgId, script.id, selected).catch(() => null);
      if (propagated && propagated.agents_touched > 0) {
        const parts = [];
        if (propagated.actions_added > 0)   parts.push(`+${propagated.actions_added} login step(s)`);
        if (propagated.actions_removed > 0) parts.push(`-${propagated.actions_removed} login step(s)`);
        toast.success(
          `Updated ${propagated.agents_touched} agent${propagated.agents_touched === 1 ? '' : 's'}` +
          (parts.length ? ` (${parts.join(', ')})` : ''),
        );
      } else {
        toast.success(selected ? 'Login linked' : 'Login unlinked');
      }
      onLinked?.(selected);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update the linked login');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-brand" /> Linked login
          </DialogTitle>
          <DialogDescription className="text-xs">
            The login profile whose authenticated session this script runs inside. Agents using
            this script get a matching login step automatically.
          </DialogDescription>
        </DialogHeader>

        <Select
          value={selected ?? '__none__'}
          onValueChange={(v) => setSelected(v === '__none__' ? null : v)}
        >
          <SelectTrigger><SelectValue placeholder="Select a login…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— None —</SelectItem>
            {logins.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Blast radius, shown before the choice is committed. */}
        {changed && agentCount !== null && agentCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/25 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              This script is used by <strong>{agentCount} agent{agentCount === 1 ? '' : 's'}</strong>.{' '}
              {unlinking
                ? 'Unlinking removes the paired login step from all of them.'
                : 'Linking replaces any existing paired login step in all of them.'}
            </span>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={saving || !changed}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {unlinking ? 'Unlink' : 'Link login'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
