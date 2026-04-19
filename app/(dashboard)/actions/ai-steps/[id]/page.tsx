'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAiStep, updateAiStep, deleteAiStep,
  type AiStep, type AiStepOutput,
} from '@/lib/api/ai-steps';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Sparkles, Save, Trash2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { AiStepFormBody, type AiStepFormData } from '@/components/actions/AiStepFormBody';

export default function EditAiStepPage() {
  const { id } = useParams() as { id: string };
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();
  const { confirm } = useConfirmDialog();

  const [step, setStep] = useState<AiStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectors, setConnectors] = useState<{ id: string; label: string }[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  const [form, setForm] = useState<AiStepFormData>({
    name: '', description: '', prompt: '', model: 'claude-sonnet-4-6',
    connector_ids: [], outputs: [], skill_ids: [],
  });

  const load = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoading(true);
    try {
      const [stepData, conns, skillsData] = await Promise.all([
        getAiStep(selectedOrgId, id),
        getConnectors(selectedOrgId).catch(() => ({ connectors: [] as any[] })),
        getSkills(selectedOrgId, { limit: 100 }).catch(() => ({ items: [] as Skill[] })),
      ]);
      setStep(stepData);
      setForm({
        name: stepData.name,
        description: stepData.description ?? '',
        prompt: stepData.prompt,
        model: stepData.model,
        connector_ids: stepData.connector_ids ?? [],
        outputs: stepData.outputs ?? [],
        skill_ids: stepData.skill_ids ?? [],
      });
      setConnectors((conns.connectors ?? []).filter((c: any) => c.agent_enabled).map((c: any) => ({ id: c.id, label: c.connector_name ?? c.id })));
      setSkills(skillsData.items ?? []);
    } catch {
      toast.error('Failed to load AI step');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!selectedOrgId || !id) return;
    setSaving(true);
    try {
      await updateAiStep(selectedOrgId, id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        prompt: form.prompt,
        model: form.model,
        connector_ids: form.connector_ids,
        outputs: form.outputs.filter((o) => o.key.trim()).map((o) => ({ key: o.key.trim(), description: o.description.trim() })),
        skill_ids: form.skill_ids,
      });
      toast.success('AI step saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Delete AI step?',
      description: `"${step?.name}" will be removed. Any agent actions referencing it will break.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteAiStep(selectedOrgId, id);
      toast.success('Deleted');
      router.push('/actions/ai-steps');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (!allowed) return <NoPermissionContent />;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!step) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
        <Link href="/actions/ai-steps" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
        <p className="text-sm text-muted-foreground">AI step not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <Link href="/actions/ai-steps"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" /> {step.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Edit AI step configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.prompt.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="p-5">
          <AiStepFormBody
            form={form}
            setForm={setForm as any}
            connectors={connectors}
            skills={skills}
          />
        </CardContent>
      </Card>
    </div>
  );
}
