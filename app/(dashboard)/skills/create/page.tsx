'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { createSkill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function CreateSkillPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedOrgId || !name.trim() || !content.trim()) return;
    try {
      setSaving(true);
      await createSkill(selectedOrgId, { name: name.trim(), description: description.trim() || undefined, content: content.trim() });
      toast.success('Skill created');
      router.push('/skills');
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create skill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/skills')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">New Skill</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Skill Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <Input id="name" placeholder="e.g. Summarize Reservations" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="What does this skill do?" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="content">Prompt / Instructions <span className="text-destructive">*</span></Label>
            <Textarea
              id="content"
              placeholder="Write your prompt instructions here…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/skills')}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !content.trim()}>
              {saving ? 'Saving…' : 'Save Skill'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
