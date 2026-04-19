'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { listAiSteps, deleteAiStep, type AiStep } from '@/lib/api/ai-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

export default function AiStepsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();
  const router = useRouter();

  const [items, setItems] = useState<AiStep[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      setItems(await listAiSteps(selectedOrgId));
    } catch {
      toast.error('Failed to load AI steps');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item: AiStep) => {
    if (!selectedOrgId) return;
    const ok = await confirm({
      title: 'Delete AI step?',
      description: `"${item.name}" will be removed. Any agent actions referencing it will break.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteAiStep(selectedOrgId, item.id);
      toast.success('Deleted');
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" /> AI Steps
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable AI prompts that agent workflows can reference.</p>
        </div>
        <Button onClick={() => router.push('/actions/ai-steps/create')}><Plus className="h-4 w-4 mr-1" /> New AI Step</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No AI steps yet. Create one to reuse prompts across agent workflows.
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden py-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Name</th>
                  <th className="text-left font-medium px-4 py-2 w-32">Model</th>
                  <th className="text-left font-medium px-4 py-2">Description</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => router.push(`/actions/ai-steps/${item.id}`)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.connector_ids.length > 0 && (
                          <Badge variant="outline" className="text-[9px] h-4">{item.connector_ids.length} connector{item.connector_ids.length !== 1 ? 's' : ''}</Badge>
                        )}
                        {(item.outputs?.length ?? 0) > 0 && (
                          <Badge variant="outline" className="text-[9px] h-4">{item.outputs.length} output{item.outputs.length !== 1 ? 's' : ''}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{item.model?.replace('claude-', '')}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[300px]">{item.description || item.prompt?.slice(0, 80)}</td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/50 hover:text-destructive"
                        onClick={() => handleDelete(item)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </Card>
      )}
    </div>
  );
}
