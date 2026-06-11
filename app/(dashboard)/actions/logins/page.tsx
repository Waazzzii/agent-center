'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listLogins,
  deleteLogin,
  startLogout,
  type Login,
} from '@/lib/api/logins';
import { useStartManualLogin } from '@/lib/hooks/use-start-manual-login';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plus, Trash2, LogIn, LogOut, Loader2, CheckCircle2, AlertCircle, HelpCircle,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
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
  if (status === 'valid') return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
  // 'verifying' renders between a manual-login Done click and the
  // background verify completing — see Login['status'] in lib/api/logins.ts.
  if (status === 'verifying') return <Badge variant="neutral" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verifying…</Badge>;
  return <Badge variant="neutral" className="gap-1"><HelpCircle className="h-3 w-3" />Not Yet Checked</Badge>;
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
  const { start: startManualLogin } = useStartManualLogin();

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
    // Dedupe toasts per logId across ticks while this effect is alive.
    const toasted = new Set<string>();
    const tick = async () => {
      let changed = false;
      for (const entityId of Object.keys(activeSessions)) {
        const s = activeSessions[entityId];
        if (!s) continue;
        try {
          const status = await getBrowserRunStatus(s.logId);
          if (TERMINAL.has(status.status)) {
            // Server-side background failures (clear-profile-no-worker,
            // crashed runs, etc.) come through here. The initial POST
            // returned 200 because the work was kicked off in a
            // background task — without this toast they'd just vanish
            // from the UI with no signal to the operator.
            if (status.status !== 'completed' && !toasted.has(s.logId)) {
              toasted.add(s.logId);
              const kindLabel =
                s.kind === 'login_logout' ? 'Logout' :
                s.kind === 'login_verify' ? 'Verify' :
                s.kind === 'login_manual' ? 'Login' :
                'Operation';
              const action = status.status === 'aborted' ? 'aborted' : 'failed';
              toast.error(
                status.error
                  ? `${kindLabel} ${action}: ${status.error}`
                  : `${kindLabel} ${action}.`
              );
            }
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

  // ── Near-realtime: silently reload when any login in this org changes.
  // Versioned polling (5s, visible tabs only) — see use-topic-versions.
  useTopicVersions({
    topics: selectedOrgId ? [`org:${selectedOrgId}:logins`] : [],
    enabled: !!selectedOrgId,
    onChange: () => { load(true); },
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

  // ── Log Out / Log In actions ───────────────────────────────
  // Log In still opens the noVNC dialog (operator interacts with the
  // login form). Log Out is fully automated server-side — backend
  // closes Chrome + rm-rf's the profile dir + marks needs_login — so
  // it just kicks off the run and lets the polling effect track it to
  // terminal. The row's button shows a spinner while active; the
  // shared poll surfaces failure via toast.
  const handleLogout = async (item: Login) => {
    if (!selectedOrgId) return;

    // Destructive confirm — see actions/logins/[id]/page.tsx for the
    // full rationale. Same warning text so operators get a consistent
    // message whether they trigger logout from the list or the detail
    // page.
    const confirmed = await confirm({
      title:       'Log Out of this Profile?',
      description: (
        <div className="space-y-2">
          <p>
            This will close every Chrome window using{' '}
            <span className="font-medium text-foreground">{item.name}</span>{' '}
            and wipe its saved session.
          </p>
          <p>
            <span className="font-medium text-destructive">
              Any agent runs currently using this login will fail mid-step.
            </span>{' '}
            Queued runs will need to re-acquire the login (new HITL prompts)
            before they can continue.
          </p>
          <p>Only continue if you intend to force a fresh login from scratch.</p>
        </div>
      ),
      confirmText: 'Log Out',
      cancelText:  'Cancel',
      variant:     'destructive',
    });
    if (!confirmed) return;

    setStarting((s) => ({ ...s, [item.id]: true }));
    try {
      const result = await startLogout(selectedOrgId, item.id);
      setActiveVerifySession({
        entityId: item.id,
        kind: 'login_logout',
        logId: result.executionLogId,
        label: `Log out: ${item.name}`,
        // 'observe' rather than 'interactive' — there's no HITL step
        // for logout anymore, so any dialog-opening code path treats
        // this as read-only.
        mode: 'observe',
      });
      // Intentionally NO setViewingLoginId here — logout has nothing
      // for the operator to do in the dialog. The button on the row
      // shows the spinner state via activeSessions[item.id].kind.
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to start logout');
    } finally {
      setStarting((s) => ({ ...s, [item.id]: false }));
    }
  };

  const handleLogin = async (item: Login) => {
    if (!selectedOrgId) return;
    setStarting((s) => ({ ...s, [item.id]: true }));
    // Centralized in useStartManualLogin — same flow as the
    // Interactions page and the edit-login page. Pre-clears stale
    // storage_state, kicks off the login_run, and stamps the
    // active-verify-sessions store. Returns null on error (toast
    // already fired) or { logId } on success.
    const result = await startManualLogin(selectedOrgId, item.id, `Log in: ${item.name}`);
    setStarting((s) => ({ ...s, [item.id]: false }));
    if (result) setViewingLoginId(item.id);
  };

  if (!allowed) return <NoPermissionContent />;

  const activeForDialog = viewingLoginId ? activeSessions[viewingLoginId] : null;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LogIn className="h-5 w-5 text-brand" /> Logins
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
        <Card className="overflow-hidden py-0">
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
                  // 'verifying' is the intermediate state between a manual-
                  // login Done click and the background verify settling on
                  // valid / needs_login. Previously this branch was missing
                  // — the button immediately rendered as Log Out (since
                  // needsLogin is false) and the operator couldn't tell
                  // that anything was happening in the background.
                  const isVerifying = item.status === 'verifying';

                  return (
                    <tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/actions/logins/${item.id}`)}>
                      <td className="px-4 py-2.5 font-medium">{item.name}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-[200px]">{item.url}</td>
                      <td className="px-4 py-2.5"><StatusPill status={item.status} /></td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(item.last_checked_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {isVerifying ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              className="text-xs"
                              title="Verifying the saved session — this finishes in a few seconds."
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="ml-1">Verifying…</span>
                            </Button>
                          ) : needsLogin ? (
                            <Button size="sm" onClick={() => handleLogin(item)} disabled={isStarting || !!active}
                              className="bg-warning hover:bg-warning/90 text-white text-xs">
                              {isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                              <span className="ml-1">Log In</span>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => handleLogout(item)} disabled={isStarting || !!active} className="text-xs">
                              {isStarting || active ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                              <span className="ml-1">
                                {active?.kind === 'login_logout' ? 'Logging out…' : 'Log Out'}
                              </span>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" className="text-destructive/50 hover:text-destructive"
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
          purpose={activeForDialog.kind === 'login_logout' ? 'logout' : 'login'}
        />
      )}
    </div>
  );
}
