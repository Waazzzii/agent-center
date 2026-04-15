'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listLogins,
  createLogin,
  updateLogin,
  deleteLogin,
  verifyLogin,
  startLogin,
  type Login,
} from '@/lib/api/logins';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, LogIn, Loader2, CheckCircle2, AlertCircle, HelpCircle,
  ShieldCheck, Monitor,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { LoginFormBody } from '@/components/actions/LoginFormBody';
import {
  listActiveVerifySessions,
  getActiveVerifySession,
  setActiveVerifySession,
  clearActiveVerifySession,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';

// ─── Helpers ────────────────────────────────────────────────

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

// Active sessions that are still in terminal state should be cleared.
const TERMINAL = new Set(['completed', 'failed', 'aborted']);

// ─── Page ───────────────────────────────────────────────────

export default function LoginsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [items, setItems] = useState<Login[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Login | null>(null);
  const [form, setForm] = useState({ name: '', url: '', verify_text: '' });
  const [saving, setSaving] = useState(false);

  // Per-login "starting" state (during the initial POST call)
  const [starting, setStarting] = useState<Record<string, boolean>>({});

  // Active sessions from localStorage, keyed by login id.  Populated on mount
  // and kept in sync via subscribeActiveVerifySessions.
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveVerifySession>>({});

  // Which login's session (if any) is currently open in the HITL dialog
  const [viewingLoginId, setViewingLoginId] = useState<string | null>(null);

  // ── Load active sessions from localStorage on mount + subscribe ──
  useEffect(() => {
    const refresh = () => {
      const map: Record<string, ActiveVerifySession> = {};
      for (const s of listActiveVerifySessions()) map[s.entityId] = s;
      setActiveSessions(map);
    };
    refresh();
    return subscribeActiveVerifySessions(refresh);
  }, []);

  // ── Background poll: watch any active sessions for completion ──
  // When a verify/login completes on the backend, reflect it in the UI by
  // clearing the active session and reloading the logins list.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const activeIds = Object.keys(activeSessions);
    if (activeIds.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      let changed = false;
      for (const entityId of Object.keys(activeSessions)) {
        const s = activeSessions[entityId];
        if (!s) continue;
        try {
          const status = await getBrowserRunStatus(s.logId);
          if (TERMINAL.has(status.status)) {
            clearActiveVerifySession(entityId);
            changed = true;
          }
        } catch {
          // If the run is 404 (purged), clear it so the UI unfreezes
          clearActiveVerifySession(entityId);
          changed = true;
        }
      }
      if (changed && selectedOrgId) {
        await load();
      }
    };
    // Start immediately, then every 4s
    void tick();
    pollRef.current = setInterval(tick, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(activeSessions).join(','), selectedOrgId]);

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      setItems(await listLogins(selectedOrgId));
    } catch {
      toast.error('Failed to load logins');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  // ── CRUD ────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', url: '', verify_text: '' });
    setDialogOpen(true);
  };
  const openEdit = (item: Login) => {
    setEditing(item);
    setForm({ name: item.name, url: item.url, verify_text: item.verify_text });
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!selectedOrgId) return;
    if (!form.name.trim() || !form.url.trim() || !form.verify_text.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateLogin(selectedOrgId, editing.id, form);
        toast.success('Login updated');
      } else {
        await createLogin(selectedOrgId, form);
        toast.success('Login created');
      }
      setDialogOpen(false);
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (item: Login) => {
    if (!selectedOrgId) return;
    const ok = await confirm({
      title: 'Delete login?',
      description: `"${item.name}" will be removed. Any agent actions referencing it will break.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteLogin(selectedOrgId, item.id);
      toast.success('Deleted');
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to delete');
    }
  };

  // ── Verify / Log In actions ────────────────────────────────
  const handleVerify = async (item: Login) => {
    if (!selectedOrgId) return;
    setStarting((s) => ({ ...s, [item.id]: true }));
    try {
      const result = await verifyLogin(selectedOrgId, item.id);
      setActiveVerifySession({
        entityId: item.id,
        kind: 'login_verify',
        logId: result.executionLogId,
        label: `Verifying: ${item.name}`,
        mode: 'observe',
      });
      toast.success('Verifying in the background — click the monitor icon any time to watch.');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to start verify');
    } finally {
      setStarting((s) => ({ ...s, [item.id]: false }));
    }
  };

  const handleLogin = async (item: Login) => {
    if (!selectedOrgId) return;
    setStarting((s) => ({ ...s, [item.id]: true }));
    try {
      const result = await startLogin(selectedOrgId, item.id);
      setActiveVerifySession({
        entityId: item.id,
        kind: 'login_manual',
        logId: result.executionLogId,
        label: `Log in: ${item.name}`,
        mode: 'interactive',
      });
      // For manual login, immediately open the browser view so the user can interact
      setViewingLoginId(item.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to start login');
    } finally {
      setStarting((s) => ({ ...s, [item.id]: false }));
    }
  };

  if (!allowed) return <NoPermissionContent />;

  // Currently-open session (if any) for the dialog
  const activeForDialog = viewingLoginId ? activeSessions[viewingLoginId] : null;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LogIn className="h-5 w-5 text-primary" /> Logins
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable login profiles.  One session per login, shared across every agent that uses it.
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Login</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No logins yet. Create one to share auth sessions across agents.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const active = activeSessions[item.id];
            const isStarting = !!starting[item.id];
            const needsLogin = item.status === 'needs_login';

            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium">{item.name}</span>
                      <StatusPill status={item.status} />
                      {active && (
                        <Badge variant="outline" className="gap-1 border-blue-400 text-blue-600 dark:text-blue-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {active.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Last logged in {formatRelative(item.last_logged_in_at)}</span>
                      <span className="opacity-50">·</span>
                      <span>Last checked {formatRelative(item.last_checked_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground/80 truncate font-mono mt-1">{item.url}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Window icon — shown only when a session is running.  Click to view live. */}
                    {active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingLoginId(item.id)}
                        title="Open live browser view"
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </Button>
                    )}

                    {/* Primary action: Log In (if needs_login) or Verify (otherwise) */}
                    {needsLogin ? (
                      <Button
                        size="sm"
                        onClick={() => handleLogin(item)}
                        disabled={isStarting || !!active}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {isStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                        <span className="ml-1">Log In</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleVerify(item)}
                        disabled={isStarting || !!active}
                      >
                        {isStarting || active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        <span className="ml-1">{active ? 'Verifying…' : 'Verify'}</span>
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)} disabled={!!active}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item)} className="text-destructive hover:text-destructive" disabled={!!active}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Login' : 'New Login'}</DialogTitle>
          </DialogHeader>
          <LoginFormBody form={form} setForm={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.url.trim() || !form.verify_text.trim()}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live browser view.
          - Verify runs: observe mode — user can close (session keeps running) or Abort to kill.
          - Manual login: interactive mode — close disabled, only Done or Abort exit the flow. */}
      {activeForDialog && (
        <BrowserHITLDialog
          open={!!viewingLoginId}
          onOpenChange={(open) => {
            if (!open) setViewingLoginId(null);
          }}
          runId={activeForDialog.logId}
          agentName={activeForDialog.label}
          mode={activeForDialog.mode}
        />
      )}
    </div>
  );
}
