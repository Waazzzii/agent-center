'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listAiSteps,
  createAiStep,
  updateAiStep,
  deleteAiStep,
  type AiStep,
} from '@/lib/api/ai-steps';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { AiStepDialog, type AiStepFormData } from '@/components/actions/AiStepDialog';

export default function AiStepsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [items, setItems] = useState<AiStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectors, setConnectors] = useState<{ id: string; label: string }[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AiStep | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [rows, conns, skillsData] = await Promise.all([
        listAiSteps(selectedOrgId),
        getConnectors(selectedOrgId).catch(() => ({ connectors: [] as any[] })),
        getSkills(selectedOrgId, { limit: 100 }).catch(() => ({ items: [] as Skill[] })),
      ]);
      setItems(rows);
      setConnectors((conns.connectors ?? []).filter((c: any) => c.agent_enabled).map((c: any) => ({ id: c.id, label: c.connector_name ?? c.id })));
      setSkills(skillsData.items ?? []);
    } catch {
      toast.error('Failed to load AI steps');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (item: AiStep) => { setEditing(item); setDialogOpen(true); };

  const handleSave = async (data: AiStepFormData) => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        description: data.description.trim() || null,
        prompt: data.prompt,
        model: data.model,
        connector_ids: data.connector_ids,
        outputs: data.outputs.filter((o) => o.key.trim()).map((o) => ({
          key: o.key.trim(),
          description: o.description.trim(),
        })),
        skill_ids: data.skill_ids,
      };
      if (editing) {
        await updateAiStep(selectedOrgId, editing.id, payload);
        toast.success('AI step updated');
      } else {
        await createAiStep(selectedOrgId, payload);
        toast.success('AI step created');
      }
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save AI step');
    } finally {
      setSaving(false);
    }
  };

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
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> AI Steps
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Reusable AI prompts that agent workflows can reference.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New AI Step</Button>
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
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{item.model}</span>
                    {item.connector_ids.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.connector_ids.length} connector{item.connector_ids.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {(item.skill_ids?.length ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.skill_ids!.length} skill{item.skill_ids!.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {item.description && <p className="text-xs text-muted-foreground mb-1.5">{item.description}</p>}
                  <p className="text-xs font-mono line-clamp-2 text-muted-foreground/80">{item.prompt}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item)} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AiStepDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        step={editing}
        connectors={connectors}
        skills={skills}
        saving={saving}
        onSave={handleSave}
      />
    </div>
  );
}
