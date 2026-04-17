'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listLogins,
  deleteLogin,
  verifyLogin,
  startLogin,
  type Login,
} from '@/lib/api/logins';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, LogIn, Loader2, CheckCircle2, AlertCircle, HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { useEventStream } from '@/lib/hooks/use-event-stream';
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

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

// ─── Page ───────────────────────────────────────────────────

export default function LoginsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();
  const router = useRouter();

  const [items, setItems] = useState<Login[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-login "starting" state (during the initial POST call)
  const [starting, setStarting] = useState<Record<string, boolean>>({});

  // Active sessions from localStorage, keyed by login id
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveVerifySession>>({});

  // Which login's session is currently open in the HITL dialog
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
          clearActiveVerifySession(entityId);
          changed = true;
        }
      }
      if (changed && selectedOrgId) {
        await load();
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(activeSessions).join(','), selectedOrgId]);

  const load = useCallback(async (silent = false) => {
    if (!selectedOrgId) return;
    if (!silent) setLoading(true);
    try {
      setItems(await listLogins(selectedOrgId));
    } catch {
      if (!silent) toast.error('Failed to load logins');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  // ── Realtime: silently reload when any login in this org changes
  const loginRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:logins`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => {
      if (loginRefreshTimer.current) clearTimeout(loginRefreshTimer.current);
      loginRefreshTimer.current = setTimeout(() => { load(true); }, 150);
    },
  });

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
      setViewingLoginId(item.id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to start login');
    } finally {
      setStarting((s) => ({ ...s, [item.id]: false }));
    }
  };

  if (!allowed) return <NoPermissionContent />;

  const activeForDialog = viewingLoginId ? activeSessions[viewingLoginId] : null;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LogIn className="h-5 w-5 text-primary" /> Logins
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable login profiles.  One session per login, shared across every agent that uses it.
          </p>
        </div>
        <Button onClick={() => router.push('/actions/logins/create')}><Plus className="h-4 w-4 mr-1" /> New Login</Button>
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
        <Card>
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Name</th>
                  <th className="text-left font-medium px-4 py-2">URL</th>
                  <th className="text-left font-medium px-4 py-2 w-28">Status</th>
                  <th className="text-left font-medium px-4 py-2 w-28">Last Checked</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const active = activeSessions[item.id];
                  const isStarting = !!starting[item.id];
                  const needsLogin = item.status === 'needs_login';

                  return (
                    <tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/actions/logins/${item.id}`)}>
                      <td className="px-4 py-2.5 font-medium">{item.name}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-[200px]">{item.url}</td>
                      <td className="px-4 py-2.5"><StatusPill status={item.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(item.last_checked_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {needsLogin ? (
                            <Button size="sm" onClick={() => handleLogin(item)} disabled={isStarting || !!active}
                              className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs">
                              {isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                              <span className="ml-1">Log In</span>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleVerify(item)} disabled={isStarting || !!active} className="h-7 text-xs">
                              {isStarting || active ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                              <span className="ml-1">{active ? 'Verifying...' : 'Verify'}</span>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/50 hover:text-destructive"
                            onClick={() => handleDelete(item)} disabled={!!active}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Live browser view */}
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
