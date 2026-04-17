'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getLogin, updateLogin, deleteLogin, verifyLogin, startLogin,
  type Login,
} from '@/lib/api/logins';
import { getBrowserRunStatus } from '@/lib/api/agents';
import {
  getAgentAccessGroups,
  getLoginAccessGroups,
  setLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { useEventStream } from '@/lib/hooks/use-event-stream';
import {
  listActiveVerifySessions,
  getActiveVerifySession,
  setActiveVerifySession,
  clearActiveVerifySession,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, LogIn, Save, Trash2,
  CheckCircle2, AlertCircle, HelpCircle, ShieldCheck,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { LoginFormBody, type LoginFormData } from '@/components/actions/LoginFormBody';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

function StatusPill({ status }: { status: Login['status'] }) {
  if (status === 'valid') return <Badge variant="outline" className="gap-1 border-green-500 text-green-600 dark:text-green-400"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 dark:text-amber-400"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
  return <Badge variant="outline" className="gap-1 border-slate-400 text-slate-500"><HelpCircle className="h-3 w-3" />Not Yet Checked</Badge>;
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function EditLoginPage() {
  const { id } = useParams() as { id: string };
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();
  const { confirm } = useConfirmDialog();

  const [login, setLogin] = useState<Login | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>([]);
  const [loginGroupIds, setLoginGroupIds] = useState<string[]>([]);

  const [form, setForm] = useState<LoginFormData>({ name: '', url: '', verify_text: '' });

  // Verify / login session state
  const [isStarting, setIsStarting] = useState(false);
  const [activeSession, setActiveSessionState] = useState<ActiveVerifySession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Subscribe to active session changes
  useEffect(() => {
    const refresh = () => {
      const s = getActiveVerifySession(id);
      setActiveSessionState(s);
    };
    refresh();
    return subscribeActiveVerifySessions(refresh);
  }, [id]);

  // Poll active session for completion
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!activeSession) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const status = await getBrowserRunStatus(activeSession.logId);
        if (TERMINAL.has(status.status)) {
          clearActiveVerifySession(id);
          if (selectedOrgId) load();
        }
      } catch {
        clearActiveVerifySession(id);
        if (selectedOrgId) load();
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.logId, id, selectedOrgId]);

  const load = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoading(true);
    try {
      const [loginData, groups, loginGroups] = await Promise.all([
        getLogin(selectedOrgId, id),
        getAgentAccessGroups(selectedOrgId),
        getLoginAccessGroups(selectedOrgId, id),
      ]);
      setLogin(loginData);
      setForm({ name: loginData.name, url: loginData.url, verify_text: loginData.verify_text });
      setAllGroups(groups);
      setLoginGroupIds(loginGroups.map((g) => g.id));
    } catch {
      toast.error('Failed to load login');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { load(); }, [load]);

  // SSE: refresh login status when it changes
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:logins`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => load(), 150);
    },
  });

  const handleSave = async () => {
    if (!selectedOrgId || !id) return;
    setSaving(true);
    try {
      await updateLogin(selectedOrgId, id, {
        name: form.name.trim(),
        url: form.url.trim(),
        verify_text: form.verify_text.trim(),
      });
      await setLoginAccessGroups(selectedOrgId, id, loginGroupIds).catch(() => {});
      toast.success('Login saved');
      // Refresh to get latest data
      const updated = await getLogin(selectedOrgId, id);
      setLogin(updated);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Delete login?',
      description: `"${login?.name}" will be removed. Any agent actions referencing it will break.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteLogin(selectedOrgId, id);
      toast.success('Deleted');
      router.push('/actions/logins');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleVerify = async () => {
    if (!selectedOrgId) return;
    setIsStarting(true);
    try {
      const result = await verifyLogin(selectedOrgId, id);
      setActiveVerifySession({
        entityId: id,
        kind: 'login_verify',
        logId: result.executionLogId,
        label: `Verifying: ${login?.name}`,
        mode: 'observe',
      });
      toast.success('Verifying in the background...');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start verify');
    } finally {
      setIsStarting(false);
    }
  };

  const handleLogin = async () => {
    if (!selectedOrgId) return;
    setIsStarting(true);
    try {
      const result = await startLogin(selectedOrgId, id);
      setActiveVerifySession({
        entityId: id,
        kind: 'login_manual',
        logId: result.executionLogId,
        label: `Log in: ${login?.name}`,
        mode: 'interactive',
      });
      setDialogOpen(true);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start login');
    } finally {
      setIsStarting(false);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!login) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
        <Link href="/actions/logins" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
        <p className="text-sm text-muted-foreground">Login not found.</p>
      </div>
    );
  }

  const needsLogin = login.status === 'needs_login';

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
              <LogIn className="h-5 w-5 text-primary" /> {login.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Edit login profile</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.url.trim() || !form.verify_text.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Status + actions card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusPill status={login.status} />
              <span className="text-xs text-muted-foreground">
                Last checked: {formatRelative(login.last_checked_at)}
              </span>
              {login.last_logged_in_at && (
                <span className="text-xs text-muted-foreground">
                  Last login: {formatRelative(login.last_logged_in_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {needsLogin ? (
                <Button size="sm" onClick={handleLogin} disabled={isStarting || !!activeSession}
                  className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs">
                  {isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                  <span className="ml-1">Log In</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleVerify} disabled={isStarting || !!activeSession} className="h-7 text-xs">
                  {isStarting || activeSession ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  <span className="ml-1">{activeSession ? 'Verifying...' : 'Verify'}</span>
                </Button>
              )}
              {activeSession && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDialogOpen(true)}>
                  Watch
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

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

      {/* Browser HITL dialog */}
      {activeSession && (
        <BrowserHITLDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          runId={activeSession.logId}
          agentName={activeSession.label}
          mode={activeSession.mode}
        />
      )}
    </div>
  );
}
