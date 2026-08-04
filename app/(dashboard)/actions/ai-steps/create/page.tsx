'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { createAiStep } from '@/lib/api/ai-steps';
import { getConnectors } from '@/lib/api/connectors';
import { getSkills, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Sparkles, Save } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { AiStepFormBody, type AiStepFormData } from '@/components/actions/AiStepFormBody';
import { useTags } from '@/lib/hooks/use-tags';
import { TagPicker } from '@/components/tags/tag-picker';
import { Label } from '@/components/ui/label';

export default function CreateAiStepPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [connectors, setConnectors] = useState<{ id: string; label: string }[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<AiStepFormData>({
    name: '', description: '', prompt: '', model: 'claude-sonnet-4-6',
    connector_ids: [], outputs: [], skill_ids: [],
  });

  const { tags, createTag } = useTags(selectedOrgId);
  const [tagIds, setTagIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedOrgId) return;
    setLoading(true);
    Promise.all([
      getConnectors(selectedOrgId).catch(() => ({ connectors: [] as any[] })),
      getSkills(selectedOrgId, { limit: 100 }).catch(() => ({ items: [] as Skill[] })),
    ]).then(([conns, skillsData]) => {
      setConnectors((conns.connectors ?? []).filter((c: any) => c.agent_enabled).map((c: any) => ({ id: c.id, label: c.connector_name ?? c.id })));
      setSkills(skillsData.items ?? []);
    }).finally(() => setLoading(false));
  }, [selectedOrgId]);

  const handleSave = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const created = await createAiStep(selectedOrgId, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        prompt: form.prompt,
        model: form.model,
        connector_ids: form.connector_ids,
        outputs: form.outputs
          .filter((o) => o.key.trim())
          .map((o) => ({
            key: o.key.trim(),
            description: o.description.trim(),
            // Persist required: true so the DB row always has the
            // explicit value, instead of relying on absent === true
            // which the verifier honors but reads less obviously.
            required: o.required !== false,
          })),
        skill_ids: form.skill_ids,
        tag_ids: tagIds,
      });
      toast.success('AI step created');
      router.push(`/actions/ai-steps/${created.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create AI step');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" /> New AI Step
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create a reusable AI prompt for agent workflows</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.prompt.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Create
        </Button>
      </div>

      {/* Form */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="p-5">
            <AiStepFormBody
              form={form}
              setForm={setForm as any}
              connectors={connectors}
              skills={skills}
              orgId={selectedOrgId}
              onSkillsChanged={() => { if (selectedOrgId) getSkills(selectedOrgId, { limit: 100 }).then((r) => setSkills(r.items ?? [])).catch(() => {}); }}
            />
            <div className="mt-4 space-y-1 border-t pt-4">
              <Label>Tags</Label>
              <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} onCreate={(name) => createTag({ name })} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
