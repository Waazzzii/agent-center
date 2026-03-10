'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { createAgent } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function CreateAgentPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedOrgId || !name.trim()) return;
    try {
      setSaving(true);
      const agent = await createAgent(selectedOrgId, { name: name.trim(), description: description.trim() || undefined });
      toast.success('Agent created');
      router.push(`/agents/${agent.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create agent');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/agents')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">New Agent</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <Input id="name" placeholder="e.g. Daily Reservation Summary" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="What does this agent do?" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => router.push('/agents')}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Creating…' : 'Create Agent'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
