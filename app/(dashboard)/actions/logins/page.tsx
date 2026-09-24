'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  listLogins,
  createLogin,
  duplicateLogin,
  type Login,
} from '@/lib/api/logins';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Plus, Trash2, Copy, LogIn, Loader2, CheckCircle2, AlertCircle, HelpCircle, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { DeleteLoginDialog } from '@/components/logins/DeleteLoginDialog';
import { NewLoginDialog } from '@/components/logins/NewLoginDialog';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import {
  listActiveVerifySessions,
  clearActiveVerifySession,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';

// ─── Helpers ────────────────────────────────────────────────

/** What the 2FA column says for each source. */
const MFA_LABELS: Record<string, string> = {
  totp:  'Authenticator',
  slack: 'Slack',
  gmail: 'Gmail',
};

function StatusPill({ status }: { status: Login['status'] }) {
  if (status === 'valid') return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
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
  const [deleteTarget, setDeleteTarget] = useState<Login | null>(null);
  const router = useRouter();
  const [newLoginOpen, setNewLoginOpen] = useState(false);
  // Local filtering — the list is small enough that a round trip per keystroke
  // would be slower than rendering it, and the status filter has to agree with
  // the search anyway.
  const [search, setSearch] = useState('');
  // 'needs_creds' is not a status — it is "configured but unusable", which is
  // the thing worth finding in a list where every login is meant to be
  // automatic. A login with no credentials cannot sign itself in, so its first
  // run parks for a human no matter what its status says.
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'needs_login' | 'needs_creds'>('all');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [items, setItems] = useState<Login[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-login "starting" state (during the initial POST call)
  const [starting, setStarting] = useState<Record<string, boolean>>({});
  // Active sessions from localStorage, keyed by login id
  const [activeSessions, setActiveSessions] = useState<Record<string, ActiveVerifySession>>({});

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

  // Opens the usage-aware dialog rather than a yes/no box.
  //
  // "Any agent actions referencing it will break" was the old warning, and it
  // was wrong in the worst direction: they did not break, they silently ran
  // unauthenticated. The dialog shows which agents depend on this login and
  // offers to move them before anything is destroyed.
  const handleDelete = (item: Login) => setDeleteTarget(item);

  // ── Log In ────────────────────────────────────────────────
  // Log Out used to live here too. It is a destructive, profile-wiping
  // operation that fails any run currently holding the login, and it sat one
  // stray click away from Delete on every row of a list people scan. It now
  // lives only on the login's own page, where the operator has the context
  // that decision needs. Nothing else moved: the poll below still tracks a
  // logout started there, because the active-session store is shared.

  // Straight to the copy's edit page: a duplicate always needs its own
  // credentials before it can do anything, so landing on the list would just
  // mean finding the new row and clicking into it.
  const handleDuplicate = async (item: Login) => {
    if (!selectedOrgId) return;
    setStarting((s) => ({ ...s, [item.id]: true }));
    try {
      const copy = await duplicateLogin(selectedOrgId, item.id);
      if (copy.warning) toast.warning(copy.warning);
      toast.success(`Created ${copy.name} — add its credentials to finish.`);
      router.push(`/actions/logins/${copy.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Failed to duplicate login');
      setStarting((s) => ({ ...s, [item.id]: false }));
    }
  };

  // A POOL IS ONE LOGIN, NOT N OF THEM.
  //
  // Members are real agent_logins rows, so they arrive in this list as
  // siblings — "Streamline Login", "Streamline Login #2", "#3" — which reads
  // as three separate things to configure when it is one identity with three
  // browsers. They are folded into their parent here and shown on its page.
  const membersByParent = new Map<string, Login[]>();
  for (const l of items) {
    if (!l.pool_parent_id) continue;
    const list = membersByParent.get(l.pool_parent_id) ?? [];
    list.push(l);
    membersByParent.set(l.pool_parent_id, list);
  }
  /** The pool as one unit: the parent plus its members, parent first. */
  const poolOf = (parent: Login): Login[] =>
    [parent, ...(membersByParent.get(parent.id) ?? [])];
  /** Members of this pool that a person has to go and sign in to. */
  const needingLogin = (parent: Login): Login[] =>
    poolOf(parent).filter((m) => m.status === 'needs_login');

  const visible = items
    .filter((l) => {
      // Folded into its parent's row.
      if (l.pool_parent_id) return false;
      if (statusFilter === 'needs_creds' && l.credentials_secret_id) return false;
      // Status filters ask about the POOL: a parent whose member is signed
      // out is a login that needs attention, and hiding it under "Needs
      // login" would hide the only row that leads to the fix.
      if (statusFilter === 'valid' && !poolOf(l).some((m) => m.status === 'valid')) return false;
      if (statusFilter === 'needs_login' && needingLogin(l).length === 0) return false;
      const q = search.trim().toLowerCase();
      return !q || poolOf(l).some((m) => m.name.toLowerCase().includes(q));
    })
    // Numeric-aware so "Market 2" sorts before "Market 10" — logins get named
    // in sequences per market often enough for that to matter.
    .sort((a, b) => {
      const c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? c : -c;
    });

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <LogIn className="h-5 w-5 text-brand" /> Login Scripts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable login profiles.  One session per login, shared across every agent that uses it.
          </p>
        </div>
        <Button onClick={() => setNewLoginOpen(true)} disabled={!selectedOrgId}>
          <Plus className="h-4 w-4 mr-1" /> New Login
        </Button>
      </div>

      {/* Name, then straight into the editor — there is no separate create
          form any more. See NewLoginDialog for why a row is created up front
          rather than drafted. */}
      <NewLoginDialog
        open={newLoginOpen}
        onOpenChange={setNewLoginOpen}
        onCreate={async (name) => {
          if (!selectedOrgId) throw new Error('No organization selected');
          try {
            const created = await createLogin(selectedOrgId, { name });
            router.push(`/actions/logins/${created.id}`);
          } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.message || 'Failed to create login');
            throw err;   // keeps the dialog open with the name still typed
          }
        }}
      />

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
          {/* CardContent p-0 wraps BOTH the toolbar and the table, which is
              what the scripts list does and why it looks right. Card is
              `flex flex-col gap-6`: py-0 removes its padding but not its gap,
              so two children put 24px of air between the filter bar and the
              first row. One child, no gap. */}
          <CardContent className="p-0">
            {/* Same shape as the scripts list: search on the left, count while
                filtering, filters on the right. */}
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search logins by name…"
                  className="h-9 pl-8"
                />
              </div>
              {(search || statusFilter !== 'all') && (
                <span className="text-xs text-muted-foreground">{visible.length} of {items.length}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {([
                  ['all', 'All'],
                  ['valid', 'Logged in'],
                  ['needs_login', 'Needs login'],
                  ['needs_creds', 'Needs credentials'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                      statusFilter === key ? 'bg-brand text-brand-fg' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      title={`Sort ${sortDir === 'asc' ? 'Z→A' : 'A→Z'}`}
                    >
                      Name
                      {sortDir === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />}
                    </button>
                  </th>
                  {/* Was URL, then briefly "Sign-in". Every login is automatic
                      now, so saying so on each row said nothing. The two things
                      that actually vary — and that decide whether a login can
                      run unattended — are whether its credentials are stored
                      and where its second factor comes from. */}
                  <th className="text-left font-medium px-4 py-2 w-36">Credentials</th>
                  <th className="text-left font-medium px-4 py-2 w-32">Two-factor</th>
                  <th className="text-left font-medium px-4 py-2 w-28">Status</th>
                  <th className="text-left font-medium px-4 py-2 w-28">Last Checked</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr className="border-t">
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {search
                        ? <>Nothing matches &ldquo;{search}&rdquo;.</>
                        : statusFilter === 'needs_creds'
                          ? 'Every login has its credentials stored.'
                          : 'No logins match this filter.'}
                    </td>
                  </tr>
                )}
                {visible.map((item) => {
                  const active = activeSessions[item.id];
                  const isStarting = !!starting[item.id];
                  return (
                    <tr key={item.id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => router.push(`/actions/logins/${item.id}`)}>
                      <td className="px-4 py-2.5 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {item.name}
                          {poolOf(item).length > 1 && (
                            <span
                              className="rounded-full border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground"
                              title={`${poolOf(item).length} browsers, up to ${item.max_browsers}. Concurrent runs each take their own.`}
                            >
                              {poolOf(item).length} browsers
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {!item.auto_login_script_id ? (
                          <span className="text-amber-600 dark:text-amber-500">No login script</span>
                        ) : item.credentials_secret_id ? (
                          <span className="text-muted-foreground">Stored</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-500">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {item.mfa_source && item.mfa_source !== 'none'
                          ? MFA_LABELS[item.mfa_source] ?? item.mfa_source
                          : <span className="text-muted-foreground/50">None</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusPill status={item.status} />
                          {/* Say WHICH sibling is out, not just that one is.
                              "Needs login" on a pool tells an operator to go
                              looking; the count tells them what they will
                              find when they get there. */}
                          {needingLogin(item).filter((m) => m.id !== item.id).length > 0 && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-500">
                              +{needingLogin(item).filter((m) => m.id !== item.id).length} in pool
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatRelative(item.last_checked_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {/* Duplicate and Delete only. Log In and Log Out
                              both moved to the login's own page: one opens a
                              live browser the operator has to sit in front of,
                              the other wipes a profile and fails any run
                              holding it. Neither belongs a stray click away
                              from Delete on a list people scan. The Status
                              column still says which logins need attention;
                              the row click goes to where it can be given. */}
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 hover:text-foreground"
                            onClick={() => handleDuplicate(item)} disabled={isStarting || !!active}
                            title="Duplicate — copies the script and 2FA setup, not the credentials or session">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive/50 hover:text-destructive"
                            onClick={() => handleDelete(item)} disabled={!!active}
                            title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <DeleteLoginDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        orgId={selectedOrgId}
        login={deleteTarget}
        allLogins={items}
        onDeleted={() => { void load(); }}
      />
    </div>
  );
}
