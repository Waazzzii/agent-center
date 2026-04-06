'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getSkill, updateSkill, getSkillUsages, type Skill, type SkillUsage } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, Settings, Link2 } from 'lucide-react';

export default function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: skillId } = use(params);
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();

  const [skill, setSkill] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [usages, setUsages] = useState<SkillUsage[]>([]);
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
      const [data, usageData] = await Promise.all([
        getSkill(selectedOrgId, skillId),
        getSkillUsages(selectedOrgId, skillId).catch(() => []),
      ]);
      setSkill(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setContent(data.content);
      setUsages(usageData);
    } catch {
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
        <h1 className="text-3xl font-bold">{skill?.name ?? 'Edit Skill'}</h1>
      </div>

      <Tabs defaultValue="settings">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <Link2 className="h-4 w-4 mr-2" />
            Assignments
            {usages.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {usages.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1">
                <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                <Input id="name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} rows={2} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="content">Prompt / Instructions <span className="text-destructive">*</span></Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => { setContent(e.target.value); setDirty(true); }}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => router.push('/skills')}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !dirty || !name.trim() || !content.trim()}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {usages.length === 0 ? (
                <p className="text-sm text-muted-foreground">This skill hasn't been assigned to any agent steps yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Agent</th>
                      <th className="text-left py-2 font-medium text-muted-foreground">Step</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {usages.map((u) => (
                      <tr key={u.action_id} className="group">
                        <td className="py-2.5 pr-4 font-medium">{u.agent_name}</td>
                        <td className="py-2.5 text-muted-foreground">{u.action_name}</td>
                        <td className="py-2.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Go to agent"
                            onClick={() => router.push(`/agents/${u.agent_id}`)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
