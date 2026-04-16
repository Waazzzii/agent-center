'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  approveApproval,
  denyApproval,
  getBrowserRunStatus,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { startLogin } from '@/lib/api/logins';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  RefreshCw, CheckCircle2, XCircle, Eye, Loader2, MessageSquare, LogIn, PauseCircle, Users,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import {
  setActiveVerifySession,
  clearActiveVerifySession,
  listActiveVerifySessions,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';
import { useEventStream } from '@/lib/hooks/use-event-stream';

const PAGE_SIZE = 20;

type FilterType = 'all' | 'approval' | 'login';

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function InteractionsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');

  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewItem, setViewItem] = useState<AgentApprovalItem | null>(null);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});

  // Active login session keyed by login_id — when set, the group renders
  // "Logging in…" and the BrowserHITLDialog is open in interactive mode.
  const [activeLoginSessions, setActiveLoginSessions] = useState<Record<string, ActiveVerifySession>>({});
  const [viewingLoginId, setViewingLoginId] = useState<string | null>(null);
  // Per-login-group "starting" state during the POST to /login
  const [startingLogin, setStartingLogin] = useState<Record<string, boolean>>({});

  // Sync the active-session store with local state so other pages (Logins)
  // sharing the same login session stay in sync.
  useEffect(() => {
    const refresh = () => {
      const map: Record<string, ActiveVerifySession> = {};
      for (const s of listActiveVerifySessions()) {
        if (s.kind === 'login_manual' || s.kind === 'login_verify') map[s.entityId] = s;
      }
      setActiveLoginSessions(map);
    };
    refresh();
    return subscribeActiveVerifySessions(refresh);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!selectedOrgId) return;
    if (!silent) setLoading(true);
    try {
      const typesParam = filter === 'all' ? 'approval,login' : filter;
      const res = await getApprovals(selectedOrgId, {
        status: 'awaiting_approval',
        action_types: typesParam,
        limit: PAGE_SIZE,
      });
      setItems(res.items ?? []);
    } catch {
      if (!silent) toast.error('Failed to load interactions');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId, filter]);

  useEffect(() => { load(); }, [load]);

  // Background fallback poll — silent so it doesn't flash.
  useEffect(() => {
    const iv = setInterval(() => { load(true); }, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // ── Realtime: silently refresh on any interactions event ──
  const interactionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: selectedOrgId ? [`org:${selectedOrgId}:interactions`] : [],
    enabled: !!selectedOrgId,
    onEvent: () => {
      if (interactionsTimer.current) clearTimeout(interactionsTimer.current);
      interactionsTimer.current = setTimeout(() => { load(true); }, 150);
    },
  });

  const handleApprove = async (item: AgentApprovalItem) => {
    if (!selectedOrgId) return;
    setDeciding((d) => ({ ...d, [item.id]: true }));
    try {
      await approveApproval(selectedOrgId, item.id);
      toast.success('Approved');
      setViewItem(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    } finally {
      setDeciding((d) => ({ ...d, [item.id]: false }));
    }
  };

  const handleDeny = async (item: AgentApprovalItem) => {
    if (!selectedOrgId) return;
    setDeciding((d) => ({ ...d, [item.id]: true }));
    try {
      await denyApproval(selectedOrgId, item.id);
      toast.success('Denied');
      setViewItem(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to deny');
    } finally {
      setDeciding((d) => ({ ...d, [item.id]: false }));
    }
  };

  /**
   * Open Browser for a login group.  Instead of trying to attach to the paused
   * agent's (released) browser, we kick off a standalone manual login using
   * the EXACT same endpoint as the Logins page.  That flow allocates its own
   * browser, navigates to the login URL, and on "Done" saves the session and
   * auto-resumes every paused sibling run waiting on this login_id.
   */
  const handleOpenBrowser = async (loginId: string, loginName: string) => {
    if (!selectedOrgId) return;
    setStartingLogin((s) => ({ ...s, [loginId]: true }));
    try {
      const result = await startLogin(selectedOrgId, loginId);
      setActiveVerifySession({
        entityId: loginId,
        kind: 'login_manual',
        logId: result.executionLogId,
        label: `Log in: ${loginName}`,
        mode: 'interactive',
      });
      setViewingLoginId(loginId);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to start login');
    } finally {
      setStartingLogin((s) => ({ ...s, [loginId]: false }));
    }
  };

  // Poll for active login-session completion.  When the user clicks "Done"
  // in the HITL dialog, the backend's completeLoginManual auto-resumes every
  // paused sibling run on that login.  Those siblings re-verify and flip out
  // of 'awaiting_approval', so we refresh the list to reflect the change.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const activeIds = Object.keys(activeLoginSessions);
    if (activeIds.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const TERMINAL = new Set(['completed', 'failed', 'aborted']);
    const tick = async () => {
      let changed = false;
      for (const entityId of activeIds) {
        const s = activeLoginSessions[entityId];
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
      if (changed) await load(true);
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(activeLoginSessions).join(',')]);

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Interactions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent runs waiting for human review or login — one place for all human touch points.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'approval', 'login'] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'approval' ? 'Approvals' : 'Logins'}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> No interactions waiting
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(() => {
            // Group login items by login_id so N concurrent HITLs for the SAME
            // login profile collapse into one row.  Approvals (and any stray
            // logins without a login_id) render one-per-row as before.
            const approvals = items.filter((i) => i.action_type !== 'login');
            const logins    = items.filter((i) => i.action_type === 'login');

            const loginGroups = new Map<string, AgentApprovalItem[]>();
            const ungroupedLogins: AgentApprovalItem[] = [];
            for (const i of logins) {
              if (!i.login_id) { ungroupedLogins.push(i); continue; }
              const arr = loginGroups.get(i.login_id) ?? [];
              arr.push(i);
              loginGroups.set(i.login_id, arr);
            }
            // Sort each group by started_at ASC (oldest first) so the header
            // shows the longest-waiting time and the first-paused run is the
            // one that gets the "Open Browser" click.
            for (const arr of loginGroups.values()) {
              arr.sort((a, b) => a.started_at.localeCompare(b.started_at));
            }

            const rows: ReactNode[] = [];

            // Render grouped login cards
            for (const [loginId, group] of loginGroups) {
              const primary   = group[0];
              const count     = group.length;
              const active    = activeLoginSessions[loginId];
              const starting  = !!startingLogin[loginId];
              rows.push(
                <Card key={`login-group-${loginId}`} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="p-2 rounded-md shrink-0 bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                      <LogIn className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400">
                          Login Required
                        </Badge>
                        <span className="font-medium text-sm">{primary.login_name ?? 'Login'}</span>
                        {count > 1 && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Users className="h-3 w-3" />
                            {count} runs blocked
                          </Badge>
                        )}
                        {active && (
                          <Badge variant="outline" className="gap-1 border-blue-400 text-blue-600 dark:text-blue-400 text-[10px]">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Logging in…
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">
                          {formatRelative(primary.started_at)}
                        </span>
                      </div>
                      {count === 1 && !active ? (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">{primary.agent_name}</span>
                          <span className="mx-1">·</span>
                          {primary.action_name}
                        </p>
                      ) : (
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          {!active && count > 1 && (
                            <p className="italic text-[11px] mb-1">
                              Logging in once will auto-resume all {count} runs below.
                            </p>
                          )}
                          {active && (
                            <p className="italic text-[11px] mb-1 text-blue-600 dark:text-blue-400">
                              Once you finish, every run below will re-verify automatically.
                            </p>
                          )}
                          {group.map((g) => (
                            <div key={g.id} className="flex items-center gap-2 pl-2 border-l border-muted">
                              {active ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500 shrink-0" />
                              ) : null}
                              <span className="font-medium">{g.agent_name}</span>
                              <span className="opacity-60">·</span>
                              <span>{g.action_name}</span>
                              <span className="opacity-60">·</span>
                              <span className="text-[10px]">
                                {active ? 'waiting to re-verify' : formatRelative(g.started_at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {active ? (
                        // In-flight: show progress inline.  The dialog is modal
                        // so the user exits via Close (aborts → button returns
                        // to "Log In") or Done (succeeds → group disappears
                        // as siblings auto-resume).  No re-open affordance.
                        <Button
                          size="sm"
                          disabled
                          className="bg-amber-600/60 text-white disabled:opacity-100"
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          Logging in…
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleOpenBrowser(loginId, primary.login_name ?? 'Login')}
                          disabled={starting}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <LogIn className="h-3.5 w-3.5 mr-1" />}
                          Log In
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Render ungrouped logins (no login_id — legacy / edge case) + approvals as standalone rows
            for (const item of [...ungroupedLogins, ...approvals]) {
              const isLogin = item.action_type === 'login';
              rows.push(
                <Card key={item.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className={`p-2 rounded-md shrink-0 ${isLogin ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-violet-100 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400'}`}>
                      {isLogin ? <LogIn className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={isLogin ? 'border-amber-400 text-amber-600 dark:text-amber-400' : 'border-violet-400 text-violet-600 dark:text-violet-400'}>
                          {isLogin ? 'Login Required' : 'Approval Required'}
                        </Badge>
                        <span className="font-medium text-sm">{item.agent_name}</span>
                        <span className="text-xs text-muted-foreground">{item.action_name}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelative(item.started_at)}</span>
                      </div>
                      {item.approval_instructions && !isLogin && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.approval_instructions}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isLogin ? (
                        // Legacy fallback — login row without a login_id.  Show
                        // a disabled button; the workflow should be fixed to
                        // use a proper login profile.
                        <Button size="sm" disabled title="Login action missing login_id">
                          <LogIn className="h-3.5 w-3.5 mr-1" /> Log In
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setViewItem(item)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Review
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return rows;
          })()}
        </div>
      )}

      {/* Approval review modal */}
      <Dialog open={!!viewItem && viewItem.action_type !== 'login'} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Approval</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Agent</div>
                <div className="font-medium">{viewItem.agent_name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Step</div>
                <div>{viewItem.action_name}</div>
              </div>
              {viewItem.approval_instructions && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Instructions</div>
                  <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-2 text-xs">{viewItem.approval_instructions}</div>
                </div>
              )}
              {viewItem.output && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Previous output</div>
                  <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-2 text-xs font-mono max-h-64 overflow-auto">{viewItem.output}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {viewItem && (
              <>
                <Button variant="outline" onClick={() => handleDeny(viewItem)} disabled={!!deciding[viewItem.id]} className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50">
                  <XCircle className="h-4 w-4 mr-1" /> Deny
                </Button>
                <Button onClick={() => handleApprove(viewItem)} disabled={!!deciding[viewItem.id]}>
                  {deciding[viewItem.id] ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewingLoginId && activeLoginSessions[viewingLoginId] && (
        <BrowserHITLDialog
          open={!!viewingLoginId}
          onOpenChange={(open) => {
            if (!open) {
              setViewingLoginId(null);
              // Refresh list now + a couple more times shortly after to catch
              // sibling runs flipping out of awaiting_approval after auto-
              // resume re-verifies them.
              load();
              setTimeout(load, 1500);
              setTimeout(load, 4000);
            }
          }}
          runId={activeLoginSessions[viewingLoginId].logId}
          agentName={activeLoginSessions[viewingLoginId].label}
          mode={activeLoginSessions[viewingLoginId].mode}
        />
      )}
    </div>
  );
}
