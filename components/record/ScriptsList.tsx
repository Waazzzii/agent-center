'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Play } from 'lucide-react';
import { listScripts, deleteScript, type BrowserScript } from '@/lib/api/scripts';
import { RunScriptModal } from './RunScriptModal';

interface ScriptsListProps {
  orgId: string | null;
  onEdit?: (script: BrowserScript) => void;
  /** Increment this to trigger a list refresh from the outside. */
  refreshKey?: number;
}

export function ScriptsList({ orgId, onEdit, refreshKey }: ScriptsListProps) {
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [runModalScript, setRunModalScript] = useState<BrowserScript | null>(null);
  const [scriptToDelete, setScriptToDelete] = useState<BrowserScript | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteConfirm = async () => {
    if (!orgId || !scriptToDelete) return;
    setIsDeleting(true);
    try {
      await deleteScript(orgId, scriptToDelete.id);
      toast.success('Script deleted');
      setScriptToDelete(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete script');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border bg-card">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="text-sm font-semibold">Saved Scripts</p>
            <p className="text-xs text-muted-foreground">{scripts.length} script{scripts.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : scripts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No scripts saved yet. Click Record above to create one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-4 pb-2 pt-3 text-left font-medium text-muted-foreground pr-4">Name</th>
                  <th className="pb-2 pt-3 text-left font-medium text-muted-foreground pr-4">Parameters</th>
                  <th className="pb-2 pt-3 text-left font-medium text-muted-foreground pr-4">Steps</th>
                  <th className="pb-2 pt-3 text-left font-medium text-muted-foreground pr-4">Created</th>
                  <th className="pb-2 pt-3 pr-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((script) => (
                  <tr
                    key={script.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => onEdit?.(script)}
                  >
                    <td className="px-4 py-3 pr-4">
                      <div>
                        <span className="font-medium">{script.name}</span>
                        {script.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                            {script.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      {script.parameters.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {script.parameters.map((p) => (
                            <Badge key={p} variant="secondary" className="text-xs px-1.5 py-0 h-5 font-mono">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-muted-foreground">
                        {script.steps.length} step{script.steps.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(script.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setRunModalScript(script)}
                        >
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setScriptToDelete(script)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setScriptToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
