'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getSkill, updateSkill, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: skillId } = use(params);
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (selectedOrgId && skillId) loadSkill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, skillId]);

  const loadSkill = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getSkill(selectedOrgId, skillId);
      setSkill(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setContent(data.content);
      setIsActive(data.is_active);
    } catch (err: any) {
      toast.error('Failed to load skill');
      router.push('/skills');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedOrgId) return;
    try {
      setSaving(true);
      await updateSkill(selectedOrgId, skillId, {
        name: name.trim(),
        description: description.trim() || undefined,
        content: content.trim(),
        is_active: isActive,
      });
      toast.success('Skill saved');
      setDirty(false);
      await loadSkill();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  const markDirty = () => setDirty(true);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/skills')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Edit Skill</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skill Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <Input id="name" value={name} onChange={(e) => { setName(e.target.value); markDirty(); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} rows={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="content">Prompt / Instructions <span className="text-destructive">*</span></Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => { setContent(e.target.value); markDirty(); }}
              rows={10}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch id="active" checked={isActive} onCheckedChange={(v) => { setIsActive(v); markDirty(); }} />
            <Label htmlFor="active">Active</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/skills')}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !dirty || !name.trim() || !content.trim()}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
