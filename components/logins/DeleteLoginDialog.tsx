'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  deleteLogin, getLoginUsage, reassignLogin,
  type Login, type LoginUsage,
} from '@/lib/api/logins';

/**
 * Delete a login, but not out from under the agents using it.
 *
 * Why this is a dialog and not a confirm(): deleting a login used to null
 * `login_id` on every agent action referencing it, and a null login is not an
 * error at run time — it means "blank browser". Those agents kept running,
 * logged out, reporting success over empty results. The failure was silent and
 * wrong rather than loud.
 *
 * So the operator gets three things a yes/no box cannot give them: WHICH agents
 * depend on this login, a one-step way to move them somewhere else, and — only
 * once they have seen both — the option to delete anyway.
 *
 * Reassign is offered first because it is almost always what was meant. Without
 * it, refusing the delete just sends people looking for a force flag.
 */
export function DeleteLoginDialog({
  open, onClose, orgId, login, allLogins, onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
  login: Login | null;
  /** Every login in the org — the reassign targets, minus this one. */
  allLogins: Login[];
  onDeleted?: () => void;
}) {
  const [usage, setUsage] = useState<LoginUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orgId || !login) return;
    setUsage(null);
    setTarget(null);
    setLoading(true);
    // Loaded on open rather than at confirm time: the whole point is that the
    // blast radius is visible BEFORE a choice is made.
    getLoginUsage(orgId, login.id)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  }, [open, orgId, login]);

  const targets = allLogins.filter((l) => l.id !== login?.id);

  const handleReassign = async () => {
    if (!orgId || !login || !target) return;
    setBusy(true);
    try {
      const r = await reassignLogin(orgId, login.id, target);
      const name = targets.find((l) => l.id === target)?.name ?? 'the new login';
      toast.success(`Moved ${r.moved} action(s) to ${name}`);
      // Re-read rather than assuming it is now empty — another surface may have
      // added a reference while this dialog was open.
      const fresh = await getLoginUsage(orgId, login.id);
      setUsage(fresh);
      setTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to reassign');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (force: boolean) => {
    if (!orgId || !login) return;
    setBusy(true);
    try {
      await deleteLogin(orgId, login.id, { force });
      toast.success(`Deleted "${login.name}"`);
      onDeleted?.();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; usage?: LoginUsage } } };
      // A 409 means something referenced it after we loaded — show the fresh
      // usage instead of a dead-end toast.
      if (e.response?.data?.usage) setUsage(e.response.data.usage);
      toast.error(e.response?.data?.error || 'Failed to delete');
    } finally {
      setBusy(false);
    }
  };

  const blocking = !!usage?.blocking;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {login?.name ?? 'login'}?</DialogTitle>
          <DialogDescription>
            {loading
              ? 'Checking what depends on this login…'
              : blocking
                ? 'Agents are still using this login.'
                : 'Nothing depends on this login.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading usage…
          </div>
        ) : (
          <div className="space-y-4">
            {blocking && (
              <>
                <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Deleting this clears the login on {usage!.actions.length} action(s).
                    Those actions will not fail — they will run in a blank browser and
                    report success over empty results.
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Used by {usage!.agent_count} agent{usage!.agent_count === 1 ? '' : 's'}
                  </p>
                  <ul className="max-h-40 overflow-y-auto rounded-md border divide-y">
                    {usage!.agents.map((a) => (
                      <li key={a.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <span className="truncate">{a.name}</span>
                        <Link
                          href={`/agents/${a.id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand hover:underline shrink-0"
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1 rounded-md border p-3">
                  <p className="text-xs font-medium">Move these actions to another login</p>
                  <p className="text-xs text-muted-foreground">
                    Usually what you want — the actions keep working as a different identity.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Select value={target ?? ''} onValueChange={setTarget}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a login…" />
                      </SelectTrigger>
                      <SelectContent>
                        {targets.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" disabled={!target || busy} onClick={handleReassign}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Move'}
                    </Button>
                  </div>
                  {targets.length === 0 && (
                    <p className="text-xs text-muted-foreground pt-1">
                      No other login to move them to. Create one first, or open each agent
                      and change the action by hand.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Scripts are reported but never block: that FK nulls harmlessly and
                costs the editor a default, not a run. */}
            {!!usage?.scripts.length && (
              <p className="text-xs text-muted-foreground">
                {usage.scripts.length} script(s) name this as their editor default
                ({usage.scripts.map((s) => s.name).join(', ')}). They will keep working;
                the editor just loses its pre-filled login.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={busy || loading}
            onClick={() => handleDelete(blocking)}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            {blocking ? 'Delete anyway' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
