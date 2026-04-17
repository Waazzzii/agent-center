'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { createLogin } from '@/lib/api/logins';
import {
  getAgentAccessGroups,
  setLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, LogIn, Save } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { LoginFormBody, type LoginFormData } from '@/components/actions/LoginFormBody';

export default function CreateLoginPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>([]);
  const [loginGroupIds, setLoginGroupIds] = useState<string[]>([]);
  const [form, setForm] = useState<LoginFormData>({ name: '', url: '', verify_text: '' });

  useEffect(() => {
    if (selectedOrgId) getAgentAccessGroups(selectedOrgId).then(setAllGroups).catch(() => {});
  }, [selectedOrgId]);

  const handleSave = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const created = await createLogin(selectedOrgId, {
        name: form.name.trim(),
        url: form.url.trim(),
        verify_text: form.verify_text.trim(),
      });
      // Save access groups
      if (loginGroupIds.length > 0) {
        await setLoginAccessGroups(selectedOrgId, created.id, loginGroupIds).catch(() => {});
      }
      toast.success('Login created');
      router.push(`/actions/logins/${created.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create login');
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
            <Link href="/actions/logins"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" /> New Login
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Create a reusable login profile for agent workflows</p>
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.url.trim() || !form.verify_text.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Create
        </Button>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="p-5">
          <LoginFormBody form={form} setForm={setForm} />
        </CardContent>
      </Card>

      {/* Access groups */}
      <Card>
        <CardContent className="p-5 space-y-2">
          <Label>Access Groups</Label>
          <p className="text-xs text-muted-foreground">
            Only members of selected groups can perform this login when an agent pauses. Leave empty for anyone.
          </p>
          <MultiSelectTags
            options={allGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.member_count})` }))}
            selected={loginGroupIds}
            onChange={setLoginGroupIds}
            placeholder="Select access groups..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
