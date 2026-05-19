'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovalStep, updateApprovalStep, deleteApprovalStep,
  type ApprovalStep,
} from '@/lib/api/approval-steps';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Save, Trash2 } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';

export default function EditApprovalStepPage() {
  const { id } = useParams() as { id: string };
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();
  const { confirm } = useConfirmDialog();

  const [step, setStep] = useState<ApprovalStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    instructions: '',
    notificationSlackChannelId: '',
  });

  const load = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoading(true);
    try {
      const stepData = await getApprovalStep(selectedOrgId, id);
      setStep(stepData);
      setForm({
        name: stepData.name,
        instructions: stepData.instructions ?? '',
        notificationSlackChannelId: stepData.notification_slack_channel_id ?? '',
      });
    } catch {
      toast.error('Failed to load approval step');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!selectedOrgId || !id) return;
    setSaving(true);
    try {
      // Empty-string Slack channel is the same as null (clear the
      // override). The API client passes whatever we send straight
      // through.
      const slackCh = form.notificationSlackChannelId.trim();
      await updateApprovalStep(selectedOrgId, id, {
        name: form.name.trim(),
        instructions: form.instructions,
        notification_slack_channel_id: slackCh || null,
      });
      toast.success('Approval saved');
      // Refresh local copy so future Save with no changes is still
      // accurate.
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Delete approval step?',
      description: `"${step?.name}" will be removed. Any agent actions referencing it will lose their approval definition — re-link or remove those steps after.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteApprovalStep(selectedOrgId, id);
      toast.success('Deleted');
      router.push('/actions/approvals');
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
        <p className="text-sm text-muted-foreground">Approval step not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-orange-500" /> {step.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Edit approval step</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Updating the name propagates to every agent action that references this approval (no per-action override).
            </p>
          </div>
          <div className="space-y-1">
            <Label>Instructions for Approver</Label>
            <Textarea
              placeholder="Describe what the approver needs to review and decide. Supports {{variable}} templates resolved from the agent's runtime context."
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              rows={8}
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
