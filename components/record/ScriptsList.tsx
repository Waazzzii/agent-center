'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Play, Pencil } from 'lucide-react';
import { listScripts, deleteScript, type BrowserScript } from '@/lib/api/scripts';
import { RunScriptModal } from './RunScriptModal';

interface ScriptsListProps {
  orgId: string | null;
  onEdit?: (script: BrowserScript) => void;
}

export function ScriptsList({ orgId, onEdit }: ScriptsListProps) {
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [loading, setLoading] = useState(false);
  const [runModalScript, setRunModalScript] = useState<BrowserScript | null>(null);

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
  }, [orgId]);

  const handleDelete = async (script: BrowserScript) => {
    if (!orgId) return;
    const confirmed = window.confirm(
      `Delete script "${script.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteScript(orgId, script.id);
      toast.success('Script deleted');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete script');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Saved Scripts</CardTitle>
          <CardDescription>
            {scripts.length} script{scripts.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : scripts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No scripts saved yet. Record and save a session to create one.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-left font-medium text-muted-foreground pr-4">Name</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground pr-4">Parameters</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground pr-4">Steps</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground pr-4">Created</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((script) => (
                    <tr
                      key={script.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => onEdit?.(script)}
                    >
                      <td className="py-3 pr-4">
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
                      <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                            onClick={() => handleDelete(script)}
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
        </CardContent>
      </Card>

      <RunScriptModal
        script={runModalScript}
        orgId={orgId}
        open={!!runModalScript}
        onClose={() => setRunModalScript(null)}
      />
    </>
  );
}
