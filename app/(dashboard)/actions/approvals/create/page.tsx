'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { createApprovalStep } from '@/lib/api/approval-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Save } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';

export default function CreateApprovalStepPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    instructions: '',
    notificationSlackChannelId: '',
  });

  const handleSave = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const slackCh = form.notificationSlackChannelId.trim();
      const created = await createApprovalStep(selectedOrgId, {
        name: form.name.trim(),
        instructions: form.instructions,
        notification_slack_channel_id: slackCh || null,
      });
      toast.success('Approval created');
      router.push(`/actions/approvals/${created.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create approval step');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-orange-500" /> New Approval
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create a reusable human-review step that agent workflows can reference.
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Create
        </Button>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Confirm contract submission"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Shown on the agent card and in the operator's approval inbox.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Instructions for Approver</Label>
            <Textarea
              placeholder="Describe what the approver needs to review and decide. Supports {{variable}} templates resolved from the agent's runtime context."
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={6}
              className="text-sm"
            />
          </div>
          <SlackChannelInput
            scope="approval"
            value={form.notificationSlackChannelId}
            onChange={(v) => setForm((f) => ({ ...f, notificationSlackChannelId: v }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
