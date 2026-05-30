'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  approveApproval,
  denyApproval,
  getBrowserRunStatus,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { startLogin, clearLoginSession } from '@/lib/api/logins';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  CheckCircle2, XCircle, Eye, Loader2, MessageSquare, LogIn, PauseCircle, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

  const [activeLoginSessions, setActiveLoginSessions] = useState<Record<string, ActiveVerifySession>>({});
  const [viewingLoginId, setViewingLoginId] = useState<string | null>(null);
  const [startingLogin, setStartingLogin] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    const iv = setInterval(() => { load(true); }, 60_000);
    return () => clearInterval(iv);
  }, [load]);

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

  const handleOpenBrowser = async (loginId: string, loginName: string) => {
    if (!selectedOrgId) return;
    setStartingLogin((s) => ({ ...s, [loginId]: true }));
    try {
      // Pre-clear the persisted storage_state row before allocating
      // the new browser slot. The operator clicked Log In, so any
      // remaining cookies / localStorage are about to be irrelevant
      // anyway — wiping them up front means the freshly-allocated
      // worker context starts from a truly empty state. Avoids the
      // "stale session bleeds into the fresh manual login" loop that
      // previously required closing and reopening the browser.
      // No live context exists yet (no logId), so clearLoginSession
      // only touches the DB row. Best-effort: don't block the login
      // flow on a clear failure.
      await clearLoginSession(selectedOrgId, loginId).catch(() => {});
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
          if (TERMINAL.has(status.status)) { clearActiveVerifySession(entityId); changed = true; }
        } catch { clearActiveVerifySession(entityId); changed = true; }
      }
      if (changed) await load(true);
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(activeLoginSessions).join(',')]);

  if (!allowed) return <NoPermissionContent />;

  // Group logins by login_id
  const approvals = items.filter((i) => i.action_type !== 'login');
  const logins = items.filter((i) => i.action_type === 'login');
  const loginGroups = new Map<string, AgentApprovalItem[]>();
  const ungroupedLogins: AgentApprovalItem[] = [];
  for (const i of logins) {
    if (!i.login_id) { ungroupedLogins.push(i); continue; }
    const arr = loginGroups.get(i.login_id) ?? [];
    arr.push(i);
    loginGroups.set(i.login_id, arr);
  }
  for (const arr of loginGroups.values()) arr.sort((a, b) => a.started_at.localeCompare(b.started_at));

  // Build unified rows
  type Row = { type: 'login-group'; loginId: string; group: AgentApprovalItem[] }
    | { type: 'login-verify'; loginId: string; session: ActiveVerifySession }
    | { type: 'item'; item: AgentApprovalItem };
  const rows: Row[] = [];
  for (const [loginId, group] of loginGroups) rows.push({ type: 'login-group', loginId, group });

  // Synthetic verify rows — when the user clicks Done in the HITL dialog,
  // the backend immediately flips the awaiting_approval action_log to
  // 'executing' (so the original row disappears from this list) and
  // kicks off an independent background verify. activeLoginSessions
  // tracks that verify in localStorage. Without a synthetic row here,
  // the post-Done "Verifying…" state has nowhere to render — the row
  // just vanishes. Render one synthetic row per in-flight login_verify
  // that doesn't already have a backing awaiting_approval group.
  for (const [loginId, session] of Object.entries(activeLoginSessions)) {
    if (session.kind !== 'login_verify') continue;
    if (loginGroups.has(loginId)) continue; // group still has rows — original row handles the badge
    rows.push({ type: 'login-verify', loginId, session });
  }

  for (const item of [...ungroupedLogins, ...approvals]) rows.push({ type: 'item', item });

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" /> Interactions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent runs waiting for human review or login.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'approval', 'login'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                filter === f ? 'bg-brand text-brand-fg' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f === 'all' ? 'All' : f === 'approval' ? 'Approvals' : 'Logins'}
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" /> No interactions waiting
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Type</th>
                <th className="text-left font-medium px-4 py-2">Agent</th>
                <th className="text-left font-medium px-4 py-2">Step</th>
                <th className="text-left font-medium px-4 py-2 w-24">Waiting</th>
                <th className="w-36" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (row.type === 'login-group') {
                  const { loginId, group } = row;
                  const primary = group[0]!;
                  const count = group.length;
                  const active = activeLoginSessions[loginId];
                  const starting = !!startingLogin[loginId];
                  return (
                    <tr key={`lg-${loginId}`} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <Badge variant="warning" className="gap-1">
                          <LogIn className="h-3 w-3" /> Login
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{primary.login_name ?? 'Login'}</div>
                        {count > 1 && (
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Users className="h-3 w-3" /> {count} runs blocked
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {count === 1
                          ? <>{primary.agent_name} &middot; {primary.action_name}</>
                          : group.map((g) => g.agent_name).filter((v, i, a) => a.indexOf(v) === i).join(', ')
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(primary.started_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {active ? (
                          // Two states share this branch:
                          //   login_manual  → dialog is open, user is logging in
                          //   login_verify  → Done was clicked, post-login verify
                          //                   is running in the background
                          // Both render as a disabled spinner button so the row
                          // doesn't bounce back to a clickable "Log In" between
                          // Done and verify-completion. Label differs so the
                          // operator knows which phase we're in.
                          <Button size="sm" disabled className="bg-warning/60 text-white disabled:opacity-100 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            {active.kind === 'login_verify' ? 'Verifying...' : 'Logging in...'}
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleOpenBrowser(loginId, primary.login_name ?? 'Login')}
                            disabled={starting} className="bg-warning hover:bg-warning/90 text-white text-xs">
                            {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                            <span className="ml-1">Log In</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                }

                if (row.type === 'login-verify') {
                  // Post-Done verify, no backing awaiting_approval row.
                  // The polling effect above tears this synthetic row down
                  // when the verify reaches a terminal status.
                  const { loginId, session } = row;
                  return (
                    <tr key={`lv-${loginId}`} className="border-t bg-muted/10">
                      <td className="px-4 py-2.5">
                        <Badge variant="warning" className="gap-1">
                          <LogIn className="h-3 w-3" /> Login
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-muted-foreground">
                        {session.label}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        Verifying saved session in background
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {formatRelative(new Date(session.createdAt).toISOString())}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button size="sm" disabled className="bg-warning/60 text-white disabled:opacity-100 text-xs">
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Verifying...
                        </Button>
                      </td>
                    </tr>
                  );
                }

                const { item } = row;
                const isLogin = item.action_type === 'login';
                return (
                  <tr key={item.id} className="border-t hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => !isLogin && setViewItem(item)}>
                    <td className="px-4 py-2.5">
                      <Badge variant={isLogin ? 'warning' : 'brand'} className="gap-1">
                        {isLogin ? <><LogIn className="h-3 w-3" /> Login</> : <><PauseCircle className="h-3 w-3" /> Approval</>}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-medium">{item.agent_name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.action_name}
                      {item.approval_instructions && !isLogin && (
                        <div className="truncate max-w-[200px] mt-0.5 opacity-60">{item.approval_instructions}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(item.started_at)}</td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      {isLogin ? (
                        <Button size="sm" disabled className="text-xs">
                          <LogIn className="h-3 w-3 mr-1" /> Log In
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setViewItem(item)} className="text-xs">
                          <Eye className="h-3 w-3 mr-1" /> Review
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Approval review modal.
          - max-w-3xl (768px) gives wide content room for instructions + the
            prior step's output (often a multi-line JSON dump).
          - h-[80vh] + flex column lets the header/footer pin while the body
            scrolls. Without this the inner output panel was capped at
            ~256px and clipped real content.
          - p-0 on DialogContent so the header / body / footer manage their
            own padding and the body can scroll edge-to-edge. */}
      <Dialog open={!!viewItem && viewItem.action_type !== 'login'} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="sm:max-w-3xl h-[80vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Review Approval</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm min-h-0">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Agent</div>
                  <div className="font-medium truncate">{viewItem.agent_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Step</div>
                  <div className="truncate">{viewItem.action_name}</div>
                </div>
              </div>
              {viewItem.approval_instructions && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Instructions</div>
                  <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-3 text-xs leading-relaxed">
                    {viewItem.approval_instructions}
                  </div>
                </div>
              )}
              {viewItem.output && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Previous output</div>
                  <pre className="whitespace-pre-wrap break-words bg-muted/50 rounded-md p-3 text-xs font-mono leading-relaxed">
                    {(() => {
                      // Pretty-print JSON if the prior step emitted one;
                      // fall back to raw text otherwise. Same convention
                      // the execution detail page uses so operators see
                      // identical formatting in both places.
                      try { return JSON.stringify(JSON.parse(viewItem.output), null, 2); }
                      catch { return viewItem.output; }
                    })()}
                  </pre>
                </div>
              )}
              {!viewItem.approval_instructions && !viewItem.output && (
                <p className="text-xs text-muted-foreground italic py-4">
                  No instructions or upstream output recorded for this approval.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="px-6 py-4 border-t shrink-0">
            {viewItem && (
              <>
                <Button variant="destructive" onClick={() => handleDeny(viewItem)} disabled={!!deciding[viewItem.id]}>
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
              load();
              setTimeout(load, 1500);
              setTimeout(load, 4000);
            }
          }}
          runId={activeLoginSessions[viewingLoginId].logId}
          agentName={activeLoginSessions[viewingLoginId].label}
          mode={activeLoginSessions[viewingLoginId].mode}
          // After Done on a manual login, the backend kicks off an
          // independent verify run. Swap the active session for this
          // loginId to track THAT run's id so the row stays in the
          // "Verifying..." state instead of bouncing back to a
          // clickable "Log In" button between Done and verify-completion.
          // The polling effect above keys off the active session's
          // logId — it'll pick up the new id, poll to terminal, and
          // then clear, refreshing the row to its final state.
          onVerifyStarted={(verifyRunId) => {
            const loginId = viewingLoginId;
            const label = activeLoginSessions[loginId]?.label ?? 'Verifying login';
            setActiveVerifySession({
              entityId: loginId,
              kind: 'login_verify',
              logId: verifyRunId,
              label,
              mode: 'observe',
            });
          }}
        />
      )}
    </div>
  );
}
