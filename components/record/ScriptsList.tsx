'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Pencil, Copy } from 'lucide-react';
import { listScripts, deleteScript, createScript, getScriptLoginUsage, type BrowserScript } from '@/lib/api/scripts';
import { RunScriptModal } from './RunScriptModal';

interface ScriptsListProps {
  orgId: string | null;
  /** Increment this to trigger a list refresh from the outside. */
  refreshKey?: number;
}

export function ScriptsList({ orgId, refreshKey }: ScriptsListProps) {
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [runModalScript, setRunModalScript] = useState<BrowserScript | null>(null);
  const [scriptToDelete, setScriptToDelete] = useState<BrowserScript | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Login-usage check for the delete-confirmation dialog. Set when the
  // dialog opens, used to render the "in use by N logins" warning and
  // gate the Delete button. null = loading; { verify: 0, auto_login: 0 } =
  // safe to delete; either count > 0 = blocked.
  const [deleteUsage, setDeleteUsage] = useState<{ verify: number; auto_login: number } | null>(null);
  // Per-script "currently being duplicated" state so the action button can
  // show a busy state without blocking the rest of the table.
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await listScripts(orgId);
      setScripts(data.scripts ?? []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load scripts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, refreshKey]);

  /**
   * Duplicate a script — copies name + steps + parameters + test_values
   * into a brand-new script via the existing createScript endpoint. We
   * append "(copy)" / "(copy N)" to the name so the list stays scannable
   * and the user can rename inline (via the modal or step list) afterward.
   */
  const handleDuplicate = async (script: BrowserScript) => {
    if (!orgId || duplicatingId) return;
    setDuplicatingId(script.id);
    try {
      // Find the next "(copy N)" suffix that isn't already taken. Avoids
      // ending up with "Foo (copy) (copy) (copy)" if the operator duplicates
      // the same script multiple times.
      const base = script.name.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/, '');
      const existing = new Set(scripts.map((s) => s.name));
      let candidate = `${base} (copy)`;
      let n = 2;
      while (existing.has(candidate)) {
        candidate = `${base} (copy ${n})`;
        n++;
      }
      await createScript(orgId, {
        name: candidate,
        description: script.description,
        steps: script.steps,
        parameters: script.parameters,
        test_values: script.test_values,
      });
      toast.success(`Duplicated → ${candidate}`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to duplicate script');
    } finally {
      setDuplicatingId(null);
    }
  };

  // Fetch login-usage when the delete dialog opens so we can show the
  // "this script is in use" warning before the operator attempts delete.
  useEffect(() => {
    if (!orgId || !scriptToDelete) {
      setDeleteUsage(null);
      return;
    }
    let cancelled = false;
    setDeleteUsage(null);
    getScriptLoginUsage(orgId, scriptToDelete.id)
      .then((usage) => { if (!cancelled) setDeleteUsage(usage); })
      .catch(() => { if (!cancelled) setDeleteUsage({ verify: 0, auto_login: 0 }); });
    return () => { cancelled = true; };
  }, [orgId, scriptToDelete]);

  const handleDeleteConfirm = async () => {
    if (!orgId || !scriptToDelete) return;
    setIsDeleting(true);
    try {
      await deleteScript(orgId, scriptToDelete.id);
      toast.success('Script deleted');
      setScriptToDelete(null);
      await load();
    } catch (err: any) {
      // Backend returns 409 + { usage: { verify, auto_login } } when a login
      // still references this script. Surface that to the operator with a
      // clear message — they need to reassign those logins first.
      const usage = err?.response?.data?.usage;
      if (err?.response?.status === 409 && usage) {
        const verify = usage.verify ?? 0;
        const autoLogin = usage.auto_login ?? 0;
        const parts: string[] = [];
        if (verify > 0)    parts.push(`${verify} login${verify === 1 ? '' : 's'} as verify script`);
        if (autoLogin > 0) parts.push(`${autoLogin} login${autoLogin === 1 ? '' : 's'} as auto-login script`);
        toast.error(
          `Cannot delete — this script is in use by ${parts.join(' and ')}. ` +
          `Edit those logins and pick a different script first.`,
          { duration: 8000 }
        );
      } else {
        toast.error(err?.response?.data?.error || err?.message || 'Failed to delete script');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Saved Scripts ({scripts.length})
      </p>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
      ) : scripts.length === 0 ? (
        <Card><p className="py-10 text-center text-sm text-muted-foreground">
          No scripts saved yet. Click Record above to create one.
        </p></Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {/* table-auto + narrow numeric columns let the Name column
              expand to consume freed space. Parameters and Steps are
              now compact counts (no names, no unit word) — the actual
              variable list is one click away in the script editor and
              didn't justify a wide column on the index. */}
          <table className="w-full text-sm table-auto">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2 w-px whitespace-nowrap">Params</th>
                <th className="text-left font-medium px-4 py-2 w-px whitespace-nowrap">Steps</th>
                <th className="text-left font-medium px-4 py-2 w-px whitespace-nowrap">Created</th>
                <th className="text-right font-medium px-4 py-2 w-20" />
              </tr>
            </thead>
              <tbody>
                {scripts.map((script) => {
                  const paramCount = Object.keys(script.parameters ?? {}).length;
                  return (
                  <tr
                    key={script.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setRunModalScript(script)}
                  >
                    <td className="px-4 py-2.5">
                      <div>
                        <span className="font-medium">{script.name}</span>
                        {script.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[420px] truncate">
                            {script.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {paramCount === 0 ? '—' : paramCount}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {script.steps.length}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(script.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setRunModalScript(script)}
                          title="Edit script"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleDuplicate(script)}
                          disabled={duplicatingId === script.id}
                          title="Duplicate script"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setScriptToDelete(script)}
                          title="Delete script"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
        </Card>
      )}

      <RunScriptModal
        script={runModalScript}
        orgId={orgId}
        open={!!runModalScript}
        onClose={() => { setRunModalScript(null); load(); }}
        onSaved={() => load()}
      />

      <Dialog open={!!scriptToDelete} onOpenChange={(o) => !o && setScriptToDelete(null)}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete script?</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{scriptToDelete?.name}</strong> will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* In-use warning. Renders when at least one login references the
              script (verify or auto-login). Delete button is disabled so the
              operator can't even attempt the destructive call — they must
              first unlink the script from those logins. */}
          {deleteUsage && (deleteUsage.verify > 0 || deleteUsage.auto_login > 0) && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
              <p className="font-medium mb-1">This script is in use and cannot be deleted</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {deleteUsage.verify > 0 && (
                  <li>{deleteUsage.verify} login{deleteUsage.verify === 1 ? '' : 's'} use it as the <strong>verify script</strong></li>
                )}
                {deleteUsage.auto_login > 0 && (
                  <li>{deleteUsage.auto_login} login{deleteUsage.auto_login === 1 ? '' : 's'} use it as the <strong>auto-login script</strong></li>
                )}
              </ul>
              <p className="mt-2 opacity-80">Edit those logins and select a different script first, then come back to delete.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setScriptToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={
                isDeleting
                || deleteUsage === null  // still checking
                || (deleteUsage.verify > 0 || deleteUsage.auto_login > 0)
              }
              title={
                deleteUsage && (deleteUsage.verify > 0 || deleteUsage.auto_login > 0)
                  ? 'Script is in use — reassign affected logins first'
                  : undefined
              }
            >
              {isDeleting ? 'Deleting…' : deleteUsage === null ? 'Checking…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
