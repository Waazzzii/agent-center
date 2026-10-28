'use client';

/**
 * Interactions → Logins — the login HITL queue.
 *
 * A run parks when a browser it needs is signed out and automation cannot sign
 * in. This is where a human completes it. Open to agent_center_user and gated by
 * the LOGIN grain (access_group_logins) in the backend, so a login operator can
 * act here WITHOUT access to the agent that raised the park — the login grain is
 * its own authority.
 *
 * POOL-AWARE. Each row is one parked POOL MEMBER, not a login profile: the
 * backend resolves the member a run parked on (login_pin → COALESCE(lm.id,
 * aa.login_id)), so the same login profile can appear on several rows at once —
 * one per signed-out browser. Runs parked on the SAME member collapse into one
 * row ("N runs blocked"); Retry retries them all, Manual Login signs that one
 * browser in and resumes every run waiting on it.
 *
 * Deliberately built on the same primitives as the Decisions page (PageHeader,
 * the Card grid, 12px muted header) so the two read as one family. Logins only —
 * approvals are deprecated; the Interactions parent leaves room for more later.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  getBrowserRunStatus,
  retryParkedRun,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { useStartManualLogin } from '@/lib/hooks/use-start-manual-login';
import { Button } from '@/components/ui/button';
import { TableSearch } from '@/components/ui/data-table-toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, LogIn, RotateCcw, RefreshCw, Users, ArrowUpRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import {
  clearActiveVerifySession,
  listActiveVerifySessions,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';

const PAGE_SIZE = 50;

// Login | Member | Instance | Agent | Execution | Waiting | Actions
const GRID = 'grid-cols-[1fr_70px_120px_1fr_120px_90px_200px]';

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
  // Deep link from a Slack alert: ?login=<memberId> highlights + scrolls to the
  // exact signed-out browser the ping was about, since the link lands on the list.
  const searchParams = useSearchParams();
  const highlightLogin = searchParams.get('login');
  const highlightRef = useRef<HTMLDivElement>(null);

  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Local narrowing on top of what came back — never triggers a refetch.
  const [search, setSearch] = useState('');

  const [activeLoginSessions, setActiveLoginSessions] = useState<Record<string, ActiveVerifySession>>({});
  const [viewingLoginId, setViewingLoginId] = useState<string | null>(null);
  const [startingLogin, setStartingLogin] = useState<Record<string, boolean>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const { start: startManualLogin } = useStartManualLogin();

  useEffect(() => {
    const refresh = () => {
      const map: Record<string, ActiveVerifySession> = {};
      for (const s of listActiveVerifySessions()) {
        if (s.kind === 'login_manual') map[s.entityId] = s;
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
      // A run parks for a login when the script's own login_indicator step
      // fails, so the waiting row can be typed 'browser_script' as well as
      // 'login' — both are login pauses. Ask for both.
      const res = await getApprovals(selectedOrgId, {
        status: 'awaiting_approval',
        action_types: 'login,browser_script',
        limit: PAGE_SIZE,
      });
      setItems(res.items ?? []);
    } catch {
      if (!silent) toast.error('Failed to load logins');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const iv = setInterval(() => { load(true); }, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  // Versioned polling: refetch when the org's interactions topic version moves.
  useTopicVersions({
    topics: selectedOrgId ? [`org:${selectedOrgId}:interactions`] : [],
    enabled: !!selectedOrgId,
    onChange: () => { load(true); },
  });

  // Retry every run waiting on this member WITHOUT signing in — for a park that
  // was a hiccup rather than a real sign-out. Each retries on the pod and pool
  // browser it parked on; one still signed out simply parks again.
  const handleRetry = async (loginId: string, group: AgentApprovalItem[]) => {
    setRetrying((s) => ({ ...s, [loginId]: true }));
    const runs = group.flatMap((g) => (g.execution_log_id ? [g.execution_log_id] : []));
    const results = await Promise.allSettled(runs.map((id) => retryParkedRun(id)));
    setRetrying((s) => ({ ...s, [loginId]: false }));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) toast.success(runs.length === 1 ? 'Retrying the run' : `Retrying ${runs.length} runs`);
    else toast.error(`${failed} of ${runs.length} could not be retried`);
    // Clear the row promptly rather than waiting for the 60s poll. The run takes
    // a moment to pick the step back up and drop its awaiting_approval park, so
    // refresh now and again shortly after.
    load(true);
    setTimeout(() => load(true), 1500);
    setTimeout(() => load(true), 4000);
  };

  const handleManualLogin = async (loginId: string, loginName: string) => {
    if (!selectedOrgId) return;
    setStartingLogin((s) => ({ ...s, [loginId]: true }));
    const result = await startManualLogin(selectedOrgId, loginId, `Log in: ${loginName}`);
    setStartingLogin((s) => ({ ...s, [loginId]: false }));
    if (result) setViewingLoginId(loginId);
  };

  // While a manual-login session is live, poll its run to surface a server-side
  // failure the start call's 200 hid, and refresh the list when it ends.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const activeIds = Object.keys(activeLoginSessions);
    if (activeIds.length === 0) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const TERMINAL = new Set(['completed', 'failed', 'aborted']);
    const toasted = new Set<string>();
    const tick = async () => {
      let changed = false;
      for (const entityId of activeIds) {
        const s = activeLoginSessions[entityId];
        if (!s) continue;
        try {
          const status = await getBrowserRunStatus(s.logId);
          if (TERMINAL.has(status.status)) {
            if (status.status !== 'completed' && !toasted.has(s.logId)) {
              toasted.add(s.logId);
              const action = status.status === 'aborted' ? 'aborted' : 'failed';
              toast.error(status.error ? `Login ${action}: ${status.error}` : `Login ${action}.`);
            }
            clearActiveVerifySession(entityId);
            changed = true;
          }
        } catch { clearActiveVerifySession(entityId); changed = true; }
      }
      if (changed) await load(true);
    };
    void tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(activeLoginSessions).join(',')]);

  // Scroll the deep-linked row into view once the list has rendered.
  useEffect(() => {
    if (highlightLogin && !loading && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [highlightLogin, loading, items]);

  if (!allowed) return <NoPermissionContent />;

  // Narrow BEFORE grouping: a group shows "N runs blocked", and that number has
  // to mean the rows actually on screen.
  const q = search.trim().toLowerCase();
  const matches = (i: AgentApprovalItem) => !q || [
    i.agent_name, i.action_name, i.login_name,
  ].some((f) => (f ?? '').toLowerCase().includes(q));

  // Group by login_id — the POOL MEMBER the run parked on. Different members of
  // the same pool have different ids, so they land on separate rows.
  const shown = items.filter(matches);
  const loginGroups = new Map<string, AgentApprovalItem[]>();
  for (const i of shown) {
    const key = i.login_id ?? `nologin:${i.id}`;
    const arr = loginGroups.get(key) ?? [];
    arr.push(i);
    loginGroups.set(key, arr);
  }
  const groups = [...loginGroups.entries()].map(([key, group]) => ({
    key,
    loginId: group[0]!.login_id ?? null,
    group: group.sort((a, b) => a.started_at.localeCompare(b.started_at)),
  }));
  // Oldest park first — the one someone has been waiting on longest is the work.
  groups.sort((a, b) => a.group[0]!.started_at.localeCompare(b.group[0]!.started_at));

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Globe}
        title="Logins"
        description="Browsers waiting for a person to sign them in"
        actions={
          <Button variant="outline" size="icon-sm" onClick={() => load()} disabled={loading || !selectedOrgId} aria-label="Refresh" title="Refresh">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        }
      />

      {items.length > 0 && (
        <TableSearch value={search} onChange={setSearch} placeholder="Search by login or agent…" />
      )}

      <Card className="py-0 gap-0">
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {search ? (
                <p className="text-sm">Nothing matches &ldquo;{search}&rdquo;.</p>
              ) : (
                <p className="text-sm inline-flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" /> No logins waiting
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className={cn('hidden md:grid items-center gap-2 h-10 px-3 border-b text-xs font-medium text-muted-foreground', GRID)}>
                <span>Login</span>
                <span>Member</span>
                <span>Instance</span>
                <span>Agent</span>
                <span>Execution</span>
                <span>Waiting</span>
                <span className="text-right pr-1">Action</span>
              </div>

              <div className="divide-y divide-border/40">
                {groups.map(({ key, loginId, group }) => {
                  // The runs parked on this browser. A browser out of rotation can
                  // have none (waiting_only): its run moved on to another browser.
                  const parked = group.filter((g) => g.execution_log_id);
                  const primary = parked[0] ?? group[0]!;
                  const count = parked.length;
                  const active = loginId ? activeLoginSessions[loginId] : undefined;
                  const starting = loginId ? !!startingLogin[loginId] : false;
                  const isRetrying = !!retrying[key];
                  const agentsLabel = count === 0
                    ? 'Out of rotation'
                    : count === 1
                      ? `${primary.agent_name} · ${primary.action_name}`
                      : parked.map((g) => g.agent_name).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                  // pg returns bigint as a string — coerce. member/size null for a
                  // park that carries no pool info; pod null for one with no pin.
                  const memberIdx = Number(primary.pool_member_index ?? 0) || null;
                  const poolSize = Number(primary.pool_size ?? 0) || null;
                  const pod = primary.pod ?? null;
                  // The row a Slack deep link (?login=<member>) points at — ring it
                  // and scroll to it so the operator sees exactly which to act on.
                  const isHighlighted = !!highlightLogin && loginId === highlightLogin;
                  return (
                    <div
                      key={key}
                      ref={isHighlighted ? highlightRef : undefined}
                      className={cn(
                        'md:grid items-center gap-2 px-3 py-2.5 text-sm',
                        GRID,
                        isHighlighted && 'rounded-md bg-brand/10 ring-1 ring-brand/40',
                      )}
                    >
                      <div className="min-w-0">
                        <span className="font-medium truncate block">{primary.login_name ?? 'Login'}</span>
                        {count > 1 && (
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                            <Users className="h-3 w-3" /> {count} runs blocked
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground tabular-nums" title={poolSize && poolSize > 1 ? `Member ${memberIdx} of ${poolSize} in the pool` : 'Single browser'}>
                        {memberIdx ? (
                          <>#{memberIdx}{poolSize && poolSize > 1 ? <span className="opacity-60"> / {poolSize}</span> : null}</>
                        ) : '—'}
                      </div>

                      <div className="text-xs text-muted-foreground truncate" title={pod ?? undefined}>
                        {pod ?? <span className="opacity-50">—</span>}
                      </div>

                      <div className="min-w-0 text-xs text-muted-foreground truncate" title={agentsLabel}>
                        {agentsLabel}
                      </div>

                      <div className="min-w-0 text-xs">
                        {/* The run this login is blocking — click through to it.
                            When more than one run waits on this member, link the
                            oldest and flag the rest (they're the "N runs blocked"
                            in the Login cell). */}
                        {primary.execution_log_id ? (
                          <Link
                            href={`/agent-history/${primary.execution_log_id}`}
                            className="inline-flex items-center gap-1 text-brand hover:underline"
                            title={primary.execution_log_id}
                          >
                            <span className="font-mono">{primary.execution_log_id.slice(0, 8)}</span>
                            <ArrowUpRight className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground opacity-50">—</span>
                        )}
                        {count > 1 && <span className="ml-1 text-muted-foreground opacity-70">+{count - 1}</span>}
                      </div>

                      <div className="text-xs text-muted-foreground">{formatRelative(primary.started_at)}</div>

                      <div className="flex items-center justify-end gap-2">
                        {active ? (
                          <Button size="sm" disabled className="bg-warning/60 text-white disabled:opacity-100 text-xs">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="ml-1">Logging in…</span>
                          </Button>
                        ) : (
                          <>
                            {count > 0 && (
                              <Button size="sm" variant="outline" onClick={() => handleRetry(key, parked)}
                                disabled={isRetrying || starting} className="text-xs"
                                title="Run the waiting step again without signing in — for a hiccup, not a real sign-out">
                                {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                                <span className="ml-1">Retry</span>
                              </Button>
                            )}
                            <Button size="sm" onClick={() => loginId && handleManualLogin(loginId, primary.login_name ?? 'Login')}
                              disabled={!loginId || starting} className="bg-warning hover:bg-warning/90 text-white text-xs"
                              title={loginId ? 'Sign this browser in and resume every run waiting on it' : 'No login profile recorded for this park'}>
                              {starting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                              <span className="ml-1">Manual Login</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
        />
      )}
    </div>
  );
}
