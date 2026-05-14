'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getLogin, updateLogin, deleteLogin, verifyLogin, startLogin,
  setLoginCredentials, clearLoginCredentials, testAutoLogin,
  listLoginRuns,
  type Login, type LoginRunAudit,
} from '@/lib/api/logins';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, LogIn, Save, Trash2,
  CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Globe, Users,
  Sparkles, Plus, X as XIcon, Eye, EyeOff, KeyRound,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { LoginFormBody, type LoginFormData } from '@/components/actions/LoginFormBody';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { RunScriptModal } from '@/components/record/RunScriptModal';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';
import { cn } from '@/lib/utils';

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

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

  // ── Auto-login state ─────────────────────────────────────────────
  // The script link is part of the normal save flow (PATCH /logins/:id).
  // Credentials are managed via a dedicated PUT/DELETE endpoint because
  // they need server-side encryption and we never echo plaintext back.
  // The credentials editor below tracks proposed values that haven't
  // been submitted yet; users click "Update credentials" explicitly to
  // commit.
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [credEntries, setCredEntries] = useState<{ key: string; value: string; reveal: boolean }[]>([]);
  const [savingCreds, setSavingCreds] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);

  // Slack channel override for this login profile. Empty string =
  // "no override; fall through to program / org-default cascade".
  // Tracked separately from `login.notification_slack_channel_id` so the
  // operator can type freely without an immediate PATCH; persisted by the
  // existing main Save button alongside the other login fields.
  const [slackChannelId, setSlackChannelId] = useState<string>('');

  // Auto-login TEST state — driven by `login.test_phase` SSE events. No
  // browser viewer; the operator gets live status text + a final outcome
  // message inline in the card.
  type TestPhase = 'idle' | 'verifying_initial' | 'running_script' | 'verifying_after_script';
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [testResult, setTestResult] = useState<{
    kind: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  // Recent run audit rows — sourced from agent_login_run_log. Paginated
  // 10-per-page server-side so the table stays small regardless of how
  // many historical runs a login has accumulated.
  //
  // SSE-triggered refreshes re-fetch the CURRENT page. New rows always
  // land on page 0 (newest-first ordering) — if the operator is browsing
  // an older page we leave them where they are; only their view of that
  // older page refreshes (which won't actually change).
  const RUNS_PER_PAGE = 10;
  const [recentRuns, setRecentRuns] = useState<LoginRunAudit[]>([]);
  const [recentRunsPage, setRecentRunsPage] = useState(0);
  const [recentRunsTotal, setRecentRunsTotal] = useState(0);
  const recentRunsTotalPages = Math.max(1, Math.ceil(recentRunsTotal / RUNS_PER_PAGE));
  const loadRecentRuns = useCallback(async (page = recentRunsPage) => {
    if (!selectedOrgId || !id) return;
    try {
      const res = await listLoginRuns(selectedOrgId, id, {
        limit:  RUNS_PER_PAGE,
        offset: page * RUNS_PER_PAGE,
      });
      setRecentRunsTotal(res.total);
      // If the total shrank below the current page (rare — cascade delete
      // or admin cleanup), snap back to the last valid page. Skip the
      // rows update so we don't briefly flash an empty table; the snap
      // will retrigger this callback with the right page.
      const maxPage = Math.max(0, Math.ceil(res.total / RUNS_PER_PAGE) - 1);
      if (page > maxPage) {
        setRecentRunsPage(maxPage);
        return;
      }
      setRecentRuns(res.rows);
    } catch {
      // Best-effort — don't toast on this one, it's a secondary panel.
    }
  }, [selectedOrgId, id, recentRunsPage]);

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

  /**
   * Two flavors of load:
   *   • initial / explicit (silent=false) — toggles the loading spinner,
   *     re-seeds form fields, resets the credentials editor. Used on
   *     mount and after manual user actions.
   *   • background / silent (silent=true) — refreshes display-only state
   *     (the `login` object that drives the status pill and timestamps).
   *     Crucially does NOT touch form, scripts, scriptId, or credEntries
   *     state, so SSE-driven refreshes can't blow away typing in progress
   *     or visibly re-render every section of the page.
   */
  const load = useCallback(async (silent = false) => {
    if (!selectedOrgId || !id) return;
    if (!silent) setLoading(true);
    try {
      if (silent) {
        // Lightweight refresh — just pull the login row. Status / pill /
        // last_checked_at flip in place; nothing else moves.
        const loginData = await getLogin(selectedOrgId, id);
        setLogin(loginData);
        return;
      }
      const [loginData, groups, loginGroups, scriptsData] = await Promise.all([
        getLogin(selectedOrgId, id),
        getAgentAccessGroups(selectedOrgId),
        getLoginAccessGroups(selectedOrgId, id),
        listScripts(selectedOrgId).catch(() => ({ scripts: [] as BrowserScript[] })),
      ]);
      setLogin(loginData);
      setForm({ name: loginData.name, url: loginData.url, verify_text: loginData.verify_text });
      setAllGroups(groups);
      setLoginGroupIds(loginGroups.map((g) => g.id));
      setScripts(scriptsData.scripts ?? []);
      setScriptId(loginData.auto_login_script_id ?? null);
      setSlackChannelId(loginData.notification_slack_channel_id ?? '');
      // Reset credentials editor on initial / explicit reload — we never
      // display existing values (encrypted), so the editor always starts
      // blank. SSE-driven silent refreshes skip this so half-typed entries
      // aren't wiped.
      setCredEntries([]);
    } catch {
      if (!silent) toast.error('Failed to load login');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { load(); }, [load]);

  // SSE: refresh login status when it changes + listen for live phase
  // updates from the auto-login test runner.
  //
  // Subscription scope: ONLY the login-specific topic + the run-scoped
  // topic (for the in-flight verify/manual/logout/test). We deliberately
  // do NOT subscribe to `org:<orgId>:logins` here — that channel carries
  // every login change in the org and would re-render this page whenever
  // an unrelated login profile is touched. The list page subscribes to
  // the org topic; this detail page only cares about its own login.
  //
  // All SSE-driven refreshes use load(silent=true), which only updates
  // the read-only `login` row — it does NOT re-seed the form, scripts,
  // scriptId, or credEntries state. That's why the page no longer
  // visibly flickers when a background event fires.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Memoize the topics array — useEventStream re-subscribes whenever the
  // identity of this array changes, so handing it a new literal on every
  // render would tear down + recreate the SSE connection (and might
  // explain part of the "constantly refreshing" feel).
  const sseTopics = useMemo(
    () => (selectedOrgId
      ? [`login:${id}`, ...(activeSession ? [`run:${activeSession.logId}`] : [])]
      : []),
    [selectedOrgId, id, activeSession?.logId]
  );
  useEventStream({
    topics: sseTopics,
    enabled: !!selectedOrgId,
    onEvent: (ev) => {
      // Defensive filter — even on the login-specific topic, we may
      // receive run-status events whose entityId is the runId (not the
      // login id). Only treat events that are clearly tied to this
      // login as cause for a status refresh.
      const eventForThisLogin =
        ev.entityId === id ||
        (ev.data && typeof ev.data === 'object' && 'loginId' in ev.data && ev.data.loginId === id);

      // Auto-login test progress — intercept these before the generic
      // refresh path so we drive the button label deterministically.
      if (ev.type === 'login.test_phase' && ev.entityId === id) {
        const { phase, message, outcome } = (ev.data ?? {}) as {
          phase?: string; message?: string; outcome?: string;
        };
        if (phase === 'completed') {
          setTestPhase('idle');
          // Already-logged-in is informational (not a success in the
          // "we exercised the script" sense), everything else is a real
          // pass. UI palette differs accordingly.
          setTestResult({
            kind: outcome === 'already_valid' ? 'info' : 'success',
            message: message ?? 'Test completed.',
          });
          // Refresh the login to pick up the new status/last_checked_at,
          // plus the recent-runs panel. Silent: don't blow away the form.
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => { load(true); loadRecentRuns(); }, 150);
          return;
        }
        if (phase === 'failed') {
          setTestPhase('idle');
          setTestResult({ kind: 'error', message: message ?? 'Auto-login test failed.' });
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => { load(true); loadRecentRuns(); }, 150);
          return;
        }
        if (phase === 'verifying_initial' || phase === 'running_script' || phase === 'verifying_after_script') {
          setTestPhase(phase);
          setTestResult(null);
          return;
        }
        return;
      }
      // Everything else — only react if the event is for this login (or
      // for an active run we're tracking). Silent refresh so the form,
      // credentials editor, and script picker don't re-render.
      if (!eventForThisLogin && !ev.type?.startsWith('login_run.')) return;
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { load(true); loadRecentRuns(); }, 150);
    },
  });

  // Initial + reload-driven fetch of the recent runs.
  useEffect(() => { loadRecentRuns(); }, [loadRecentRuns]);

  const handleSave = async () => {
    if (!selectedOrgId || !id) return;
    setSaving(true);
    try {
      // Compare scriptId against what's persisted on the login. If it
      // changed (including being explicitly cleared to null), send the
      // patch. null tells the backend to unset the FK; undefined
      // (= "not provided") would leave it alone.
      const scriptChanged = scriptId !== (login?.auto_login_script_id ?? null);
      // Same explicit-set vs leave-alone semantics for the Slack channel
      // override. Empty string in the UI maps to null in the patch
      // (explicit clear); only send the field if it actually changed.
      const normalizedSlack = slackChannelId.trim() || null;
      const slackChanged = normalizedSlack !== (login?.notification_slack_channel_id ?? null);
      await updateLogin(selectedOrgId, id, {
        name: form.name.trim(),
        url: form.url.trim(),
        verify_text: form.verify_text.trim(),
        ...(scriptChanged ? { auto_login_script_id: scriptId } : {}),
        ...(slackChanged ? { notification_slack_channel_id: normalizedSlack } : {}),
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

  /**
   * Commit credentials separately from the main save. Reasoning: we
   * never display existing values, so a "form dirty?" check is impossible
   * for credentials — every save would overwrite. Forcing a dedicated
   * button makes the overwrite intentional. Empty entries are stripped
   * (key must be non-blank); zero valid entries is a no-op with a toast.
   */
  const handleSaveCredentials = async () => {
    if (!selectedOrgId || !id) return;
    const credentials: Record<string, string> = {};
    for (const e of credEntries) {
      const k = e.key.trim();
      if (k) credentials[k] = e.value;
    }
    if (Object.keys(credentials).length === 0) {
      toast.error('Add at least one credential key + value first');
      return;
    }
    setSavingCreds(true);
    try {
      const updated = await setLoginCredentials(selectedOrgId, id, credentials);
      setLogin(updated);
      setCredEntries([]); // clear editor — values are now encrypted server-side
      toast.success('Credentials saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  };

  /**
   * Standalone test of the auto-login chain — same code path the agent
   * uses (verify → script → re-verify) but with no HITL fallback.
   *
   * UX: no browser viewer. Live progress comes via the
   * `login.test_phase` SSE events handled in the useEventStream above,
   * which drives the `testPhase` state and rotates the button label
   * through the stages. Final outcome lands in `testResult` and renders
   * inline below the button row.
   */
  const handleTestAutoLogin = async () => {
    if (!selectedOrgId) return;
    setTestResult(null);
    // Optimistic phase — the SSE event will overwrite this within a
    // moment but it avoids a flash of "Test auto-login" while the
    // request is still in flight.
    setTestPhase('verifying_initial');
    try {
      await testAutoLogin(selectedOrgId, id);
    } catch (err: any) {
      setTestPhase('idle');
      setTestResult({
        kind: 'error',
        message: err.response?.data?.error || 'Failed to start auto-login test',
      });
    }
  };

  const handleClearCredentials = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Remove stored credentials?',
      description: 'Auto-login attempts will fall through to manual HITL until you re-enter credentials.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setSavingCreds(true);
    try {
      const updated = await clearLoginCredentials(selectedOrgId, id);
      setLogin(updated);
      setCredEntries([]);
      toast.success('Credentials removed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove credentials');
    } finally {
      setSavingCreds(false);
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
              <LogIn className="h-5 w-5 text-brand" /> {login.name}
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
        <CardContent className="py-2 px-4">
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
                  className="bg-warning hover:bg-warning/90 text-white text-xs">
                  {isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                  <span className="ml-1">Log In</span>
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleVerify} disabled={isStarting || !!activeSession} className="text-xs">
                  {isStarting || activeSession ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                  <span className="ml-1">{activeSession ? 'Verifying...' : 'Verify'}</span>
                </Button>
              )}
              {activeSession && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setDialogOpen(true)}>
                  Watch
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Card>
        <CardContent className="py-3 px-5">
          <LoginFormBody form={form} setForm={setForm} />
        </CardContent>
      </Card>

      {/* Automate Login */}
      <Card>
        <CardContent className="py-3 px-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Automate login (optional)
              </Label>
              <p className="text-xs text-muted-foreground max-w-2xl">
                When verify fails, the agent will try the linked browser script with the stored
                credentials before falling through to manual login. Requires <strong>both</strong> a
                script and credentials to be configured. 2FA-protected sites should leave this
                unconfigured — they still fall through to manual login as today.
              </p>
            </div>
            {/* Status badges at a glance + test button. Test is only
                enabled when both halves of auto-login are configured —
                otherwise we'd just trigger the 400 the backend returns. */}
            <div className="flex items-center gap-2 shrink-0">
              {scriptId ? (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Script
                </Badge>
              ) : (
                <Badge variant="neutral" className="gap-1 text-[10px]">No script</Badge>
              )}
              {login.credentials_secret_id ? (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <KeyRound className="h-2.5 w-2.5" /> Credentials set
                </Badge>
              ) : (
                <Badge variant="neutral" className="gap-1 text-[10px]">No credentials</Badge>
              )}
              {/* Test button — runs the SAME verify → script → re-verify
                  chain the agent uses, just standalone. Label rotates
                  through the phases as SSE events come in. Disabled when
                  config is incomplete, a test is in flight, or another
                  verify/login session is using the browser slot. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs min-w-[170px]"
                disabled={
                  !scriptId
                  || !login.credentials_secret_id
                  || testPhase !== 'idle'
                  || !!activeSession
                }
                onClick={handleTestAutoLogin}
                title={
                  !scriptId || !login.credentials_secret_id
                    ? 'Configure both a script and credentials first'
                    : testPhase !== 'idle'
                      ? 'Test in progress — watch the status below'
                      : 'Run the auto-login chain end-to-end without affecting any agent run'
                }
              >
                {testPhase === 'idle'
                  ? <Sparkles className="h-3 w-3 mr-1" />
                  : <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                {testPhase === 'idle'        ? 'Test auto-login'
                  : testPhase === 'verifying_initial'      ? 'Verifying login…'
                  : testPhase === 'running_script'         ? 'Auto-login proceeding…'
                  : testPhase === 'verifying_after_script' ? 'Verifying auto-login…'
                  : 'Testing…'}
              </Button>
            </div>
          </div>

          {/* Test outcome banner — renders below the header row once a
              test reaches its terminal phase. Stays visible until the
              next test run (which clears testResult) or the operator
              dismisses it. Color/icon varies with outcome kind. */}
          {testResult && (
            <div
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
                testResult.kind === 'success' && 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
                testResult.kind === 'info' && 'border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
                testResult.kind === 'error' && 'border-rose-200 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
              )}
            >
              {testResult.kind === 'success'
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                : testResult.kind === 'info'
                  ? <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  : <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <div className="flex-1 leading-snug">{testResult.message}</div>
              <button
                type="button"
                onClick={() => setTestResult(null)}
                className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0"
                title="Dismiss"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Script picker + inline record */}
          <div className="space-y-1.5">
            <Label className="text-xs">Browser script</Label>
            <div className="flex items-center gap-2">
              <Select
                value={scriptId ?? '__none__'}
                onValueChange={(v) => setScriptId(v === '__none__' ? null : v)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a script…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None (HITL only) —</SelectItem>
                  {scripts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Inline record: opens the existing RunScriptModal in record
                  mode, pre-seeded with the login URL so the operator lands
                  on the right page to record the flow. On save, the new
                  script auto-links to this login. */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setRecordModalOpen(true)}
                title="Record a new login script"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              The script should fill the login form and submit. Use{' '}
              <code className="font-mono">{'{{username}}'}</code>,{' '}
              <code className="font-mono">{'{{password}}'}</code> (or any keys you set in credentials
              below) as variables — they get substituted with the encrypted values at runtime.
            </p>
          </div>

          {/* Credentials key-value editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Credentials</Label>
              {login.credentials_secret_id && (
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  disabled={savingCreds}
                  className="text-[10px] text-destructive hover:underline disabled:opacity-50"
                >
                  Remove stored credentials
                </button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {login.credentials_secret_id
                ? 'Credentials are on file. Stored values are not shown — enter new keys + values below and click "Update credentials" to replace them.'
                : 'Add key-value pairs the script will receive as parameters. Stored encrypted at rest; never echoed back by the API.'}
            </p>
            <div className="space-y-1.5">
              {credEntries.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="key (e.g. username)"
                    value={e.key}
                    onChange={(ev) => setCredEntries((prev) => prev.map((p, idx) => idx === i ? { ...p, key: ev.target.value } : p))}
                    className="flex-1 font-mono text-xs"
                  />
                  <Input
                    type={e.reveal ? 'text' : 'password'}
                    placeholder="value"
                    value={e.value}
                    onChange={(ev) => setCredEntries((prev) => prev.map((p, idx) => idx === i ? { ...p, value: ev.target.value } : p))}
                    className="flex-1 font-mono text-xs"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setCredEntries((prev) => prev.map((p, idx) => idx === i ? { ...p, reveal: !p.reveal } : p))}
                    title={e.reveal ? 'Hide' : 'Show'}
                  >
                    {e.reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setCredEntries((prev) => prev.filter((_, idx) => idx !== i))}
                    title="Remove this entry"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCredEntries((prev) => [...prev, { key: '', value: '', reveal: false }])}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add credential
                </Button>
                {credEntries.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveCredentials}
                    disabled={savingCreds || credEntries.every((e) => !e.key.trim())}
                  >
                    {savingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />}
                    Update credentials
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Access groups */}
      <Card>
        <CardContent className="py-3 px-5 space-y-2">
          <Label>Access Groups</Label>
          <p className="text-xs text-muted-foreground">
            Controls who gets notified and who can complete this login when an agent pauses for HITL. Groups are shared across every agent that uses this login profile.
          </p>
          <MultiSelectTags
            options={allGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.member_count})` }))}
            selected={loginGroupIds}
            onChange={setLoginGroupIds}
            placeholder="Select access groups..."
          />
          {loginGroupIds.length === 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              <Globe className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Open to everyone.</strong> With no groups selected, any user with Agent Center access in this organization can complete this login when an agent pauses. Add one or more groups to restrict it.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Users className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>Restricted.</strong> Only members of the {loginGroupIds.length === 1 ? 'selected group' : `${loginGroupIds.length} selected groups`} can complete this login.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slack notification override for this login profile. When the login
          action HITL-pauses, the notify service uses this channel before
          falling back to program (for submissions runs) or the org default.
          Persisted by the main Save button at the top of the page. */}
      <Card>
        <CardContent className="py-3 px-5">
          <SlackChannelInput
            scope="login"
            value={slackChannelId}
            onChange={setSlackChannelId}
            description="Click Save at the top of the page to persist changes here."
          />
        </CardContent>
      </Card>

      {/* Recent run history — covers manual login/logout, verify, auto-login
          test, and the login action inside agent runs (linked back to the
          agent execution log row). Single source of truth for "why did this
          login fail an hour ago?". */}
      <Card>
        <CardContent className="py-3 px-5 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Recent runs</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => loadRecentRuns()}
            >
              Refresh
            </Button>
          </div>
          {recentRuns.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No runs yet. Manual login, logout, verify, auto-login test, and agent-triggered logins will all appear here.
            </p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-1.5">When</th>
                    <th className="text-left font-medium px-3 py-1.5">Kind</th>
                    <th className="text-left font-medium px-3 py-1.5">Result</th>
                    <th className="text-left font-medium px-3 py-1.5">Detail</th>
                    <th className="text-left font-medium px-3 py-1.5 w-32">Triggered by</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    // Map status → palette + label. Two are "yellow":
                    //   executing → in flight
                    //   completed but outcome='not_logged_in' or 'already_valid' → informational
                    const pillCls =
                      r.status === 'completed'
                        ? r.outcome === 'not_logged_in'
                          ? 'border-amber-400 text-amber-600 dark:text-amber-400'
                          : r.outcome === 'already_valid'
                            ? 'border-sky-300 text-sky-600 dark:text-sky-400'
                            : 'border-green-500 text-green-600 dark:text-green-400'
                        : r.status === 'executing'
                          ? 'border-slate-300 text-slate-500'
                          : r.status === 'aborted'
                            ? 'border-slate-400 text-slate-500'
                            : 'border-red-400 text-red-600 dark:text-red-400';
                    const kindLabel: Record<typeof r.kind, string> = {
                      verify:      'Verify',
                      manual:      'Manual login',
                      logout:      'Manual logout',
                      auto_test:   'Auto-login test',
                      agent_login: 'Agent login',
                    };
                    const detail =
                      r.error_message ||
                      (r.outcome ? r.outcome.replace(/_/g, ' ') : '') ||
                      (r.status === 'executing' ? 'in progress…' : '—');
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {formatRelative(r.started_at)}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{kindLabel[r.kind] ?? r.kind}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <Badge variant="outline" className={`text-[10px] ${pillCls}`}>
                            {r.status === 'completed' ? (r.outcome ?? 'completed') : r.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground" title={detail}>
                          <div className="max-w-[420px] truncate">{detail}</div>
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                          {r.agent_execution_log_id ? (
                            <Link
                              href={`/agent-history/${r.agent_execution_log_id}`}
                              className="text-brand hover:underline"
                            >
                              Agent run
                            </Link>
                          ) : (
                            r.triggered_by_email ?? '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination — only render when there's more than one page of
              data. Buttons are disabled at the boundaries; the page
              indicator shows 1-based position to the operator. */}
          {recentRunsTotal > RUNS_PER_PAGE && (
            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span>
                Showing {recentRunsPage * RUNS_PER_PAGE + 1}
                –{Math.min((recentRunsPage + 1) * RUNS_PER_PAGE, recentRunsTotal)}
                {' '}of {recentRunsTotal}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setRecentRunsPage((p) => Math.max(0, p - 1))}
                  disabled={recentRunsPage === 0}
                >
                  Previous
                </Button>
                <span className="px-2">
                  Page {recentRunsPage + 1} of {recentRunsTotalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setRecentRunsPage((p) => Math.min(recentRunsTotalPages - 1, p + 1))}
                  disabled={recentRunsPage >= recentRunsTotalPages - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
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

      {/* Inline record-a-new-login-script flow. Reuses the same modal
          used everywhere else (Scripts list, agent action editor) so
          there's exactly one recording UI to maintain. `script={null}` +
          `mode="record"` puts it into recording mode; onSaved fires once
          the operator saves the recorded script. We then refresh the
          scripts list and auto-select the new script for this login. */}
      <RunScriptModal
        script={null}
        orgId={selectedOrgId}
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        mode="record"
        onSaved={async () => {
          // Re-fetch scripts; pick the newest one (it was just created)
          // and auto-select it for this login. The operator can confirm
          // the selection and hit the main Save button to persist the
          // linkage to the login profile.
          if (!selectedOrgId) return;
          try {
            const data = await listScripts(selectedOrgId);
            const all = data.scripts ?? [];
            setScripts(all);
            // "Newest" = max created_at. Sorts the cached list and picks.
            const newest = [...all].sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            if (newest) {
              setScriptId(newest.id);
              toast.success(`Recorded "${newest.name}" — click Save to link it to this login`);
            }
          } catch {
            toast.error('Recording saved, but failed to refresh script list');
          }
        }}
      />
    </div>
  );
}
