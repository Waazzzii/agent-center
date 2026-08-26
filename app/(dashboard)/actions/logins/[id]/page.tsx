'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getLogin, updateLogin, deleteLogin, verifyLogin, startLogout,
  setLoginCredentials, clearLoginCredentials, testAutoLogin, clearLoginSession,
  getLoginCredentialKeys, deleteLoginCredentialKey,
  setLoginTotp, clearLoginTotp, previewLoginTotp,
  listLoginRuns,
  type Login, type LoginRunAudit, type TotpPreview,
} from '@/lib/api/logins';
import { isReservedParam } from '@/lib/script-params';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { listScripts, deleteScript, type BrowserScript } from '@/lib/api/scripts';
import {
  getAgentAccessGroups,
  getLoginAccessGroups,
  setLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import {
  listActiveVerifySessions,
  getActiveVerifySession,
  setActiveVerifySession,
  clearActiveVerifySession,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';
import { useStartManualLogin } from '@/lib/hooks/use-start-manual-login';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Loader2, LogIn, LogOut, Save, Trash2, Eraser,
  CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Globe, Users,
  Sparkles, Plus, X as XIcon, Eye, EyeOff, KeyRound, Pencil,
  Settings2, History, Camera, Image as ImageIcon,
} from 'lucide-react';
import { decodeQrFromFile, imageFromTransfer, cameraSupported } from '@/lib/qr-decode';
import { QrScannerDialog } from '@/components/actions/QrScannerDialog';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
// LoginFormBody is no longer rendered here — the name moved into the page
// header, the URL into a disclosure under Login, and the verify script into
// its own card. The type is still the shape of this page's form state, and
// the component itself is still used by the create page and LoginChip.
import { type LoginFormData } from '@/components/actions/LoginFormBody';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { RunScriptModal } from '@/components/record/RunScriptModal';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';
import { cn } from '@/lib/utils';
import {
  Field, FieldNest, InfoBubble, ScriptSlot, CONTROL_W,
} from '@/components/actions/login-fields';
import { MfaSourceSection } from '@/components/actions/MfaSourceSection';

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

function StatusPill({ status }: { status: Login['status'] }) {
  if (status === 'valid') return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
  // 'verifying' is an intermediate state — see Login['status'] docstring.
  // Spinner + "Verifying..." makes it visually obvious that we're
  // mid-check, so operators don't read it as a settled outcome.
  if (status === 'verifying') return <Badge variant="neutral" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Verifying…</Badge>;
  return <Badge variant="neutral" className="gap-1"><HelpCircle className="h-3 w-3" />Not Yet Checked</Badge>;
}

/** Cap on the control itself. The row spans the card; the input doesn't
 *  need to. */

/**
 * A small ⓘ next to a label. Explanatory copy lives in here rather than as
 * a line of prose under every control — the explanation is needed once,
 * while the vertical space it costs is paid on every render.
 */

/**
 * One labelled control: label above, control below, explanation behind an
 * ⓘ on the label row.
 */

/**
 * Indented block for things that BELONG to the field aboveit (the script's
 * credentials under the script that declares them), so the relationship is
 * visible rather than stated in prose.
 */

/**
 * One script slot (login or verify) — picker, edit, and record.
 *
 * The empty case is the point of this component. When no scripts of the
 * kind exist there is nothing to pick, so the dropdown is suppressed and
 * recording becomes the only offered action. An empty select reads as
 * "something is broken"; a single labelled button reads as "do this next".
 *
 * Login scripts are hidden from the general Scripts list (they belong to
 * their login), so this row is also the only way to open one for editing.
 */

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

  const [form, setForm] = useState<LoginFormData>({ name: '', url: '', verify_script_id: null });

  // Verify / login session state. `startingAction` tracks WHICH button
  // was just clicked so we only spin the one that's actually starting up
  // — a single `isStarting` boolean would spin every button (Verify and
  // Log Out share the row, so the wrong icon would animate). All buttons
  // remain disabled while any action is in flight to prevent the operator
  // from kicking off two browser-slot sessions at once.
  type StartingAction = 'verify' | 'login' | 'logout' | 'clear_session' | null;
  const [startingAction, setStartingAction] = useState<StartingAction>(null);
  const { start: startManualLogin } = useStartManualLogin();
  const isStarting = startingAction !== null;
  const [activeSession, setActiveSessionState] = useState<ActiveVerifySession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Auto-login state ─────────────────────────────────────────────
  // The script link is part of the normal save flow (PATCH /logins/:id).
  // Credentials are managed via a dedicated PUT/DELETE endpoint because
  // they need server-side encryption and we never echo plaintext back.
  // The credentials editor below tracks proposed values that haven't
  // been submitted yet; users click "Update credentials" explicitly to
  // commit.
  // `scripts` = the 'login' pool (auto-login slot). `verifyScripts` = the
  // 'login_verify' pool. Separate because each slot offers only its own kind.
  const [scripts, setScripts] = useState<BrowserScript[]>([]);
  const [verifyScripts, setVerifyScripts] = useState<BrowserScript[]>([]);
  const [scriptId, setScriptId] = useState<string | null>(null);
  // Credential KEYS are no longer typed by hand — they're the login script's
  // declared inputs. `storedCredKeys` is what's actually on file (names only,
  // never values) so each row can show Set / Not set. `credDrafts` holds
  // values the operator has typed but not yet submitted.
  const [storedCredKeys, setStoredCredKeys] = useState<string[]>([]);
  const [credDrafts, setCredDrafts] = useState<Record<string, string>>({});
  const [revealedCred, setRevealedCred] = useState<Record<string, boolean>>({});
  const [savingCreds, setSavingCreds] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [recordVerifyModalOpen, setRecordVerifyModalOpen] = useState(false);
  // Login scripts are no longer listed on the general Scripts page — this
  // login IS their home, so the page has to be able to open one for editing.
  const [editScript, setEditScript] = useState<BrowserScript | null>(null);
  // Verify scripts can't simply be deleted: verify_script_id is NOT NULL, so
  // Postgres refuses while a login points at one. Deleting therefore means
  // REPLACING — this holds the script on its way out plus the chosen stand-in.
  const [verifyToDelete, setVerifyToDelete] = useState<BrowserScript | null>(null);
  const [verifyReplacementId, setVerifyReplacementId] = useState<string | null>(null);
  const [tab, setTab] = useState<'setup' | '2fa' | 'runs' | 'access'>('setup');
  const [editingName, setEditingName] = useState(false);

  // ── TOTP (authenticator 2FA) state ───────────────────────────────
  // Same write-only model as credentials: the seed goes up once and is
  // never echoed back. `totpPreview` holds a CURRENT code fetched from the
  // server (never the seed) so the operator can compare it against their
  // phone and know immediately that enrollment worked — otherwise the
  // first signal of a mistyped key is a failed agent run hours later.
  const [totpInput, setTotpInput] = useState('');
  const [savingTotp, setSavingTotp] = useState(false);
  const [totpPreview, setTotpPreview] = useState<TotpPreview | null>(null);
  const [totpPreviewLoading, setTotpPreviewLoading] = useState(false);
  // QR capture. A TOTP QR encodes exactly the otpauth:// URI, so every
  // capture path (paste, drop, file picker, camera) decodes to the same
  // string the operator could have typed — and enrolls through the same
  // endpoint. `decodingQr` covers the image paths, which are fast but not
  // instant on a large screenshot.
  const [decodingQr, setDecodingQr] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [canUseCamera, setCanUseCamera] = useState(false);
  const totpFileInputRef = useRef<HTMLInputElement | null>(null);

  // Camera availability is a client-only check (getUserMedia + secure
  // context), so it has to happen after mount or SSR and the client render
  // disagree. Hiding the button beats offering one that always fails.
  useEffect(() => { setCanUseCamera(cameraSupported()); }, []);

  // Slack channel override for this login profile. Empty string =
  // "no override; fall through to program / org-default cascade".
  // Tracked separately from `login.notification_slack_channel_id` so the
  // operator can type freely without an immediate PATCH; persisted by the
  // existing main Save button alongside the other login fields.
  const [slackChannelId, setSlackChannelId] = useState<string>('');

  // Auto-login TEST state — driven by `login.test_phase` SSE events. No
  // browser viewer; the operator gets live status text + a final outcome
  // message inline in the card.
  //
  // `testRunId` is the executionLogId returned by POST /test-auto-login.
  // It exists purely as a polling fallback: if the terminal SSE event is
  // lost (tab backgrounded → browser throttles SSE, network blip, server
  // hiccup), the button would otherwise stay stuck in "Auto-login
  // proceeding…" forever. While testRunId is set, we poll the run's
  // terminal status the same way activeSession polling does and force-
  // reset testPhase when it goes terminal.
  type TestPhase = 'idle' | 'verifying_initial' | 'running_script' | 'verifying_after_script';
  const [testPhase, setTestPhase] = useState<TestPhase>('idle');
  const [testRunId, setTestRunId] = useState<string | null>(null);
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
      setRecentRunsTotal((prev) => (prev === res.total ? prev : res.total));
      // If the total shrank below the current page (rare — cascade delete
      // or admin cleanup), snap back to the last valid page. Skip the
      // rows update so we don't briefly flash an empty table; the snap
      // will retrigger this callback with the right page.
      const maxPage = Math.max(0, Math.ceil(res.total / RUNS_PER_PAGE) - 1);
      if (page > maxPage) {
        setRecentRunsPage(maxPage);
        return;
      }
      // Reference-stable update — SSE breadcrumbs during a long run cause
      // this to refetch repeatedly even though the audit list rarely
      // changes mid-run. Replacing the array on every fetch was forcing
      // the table to re-render and the page to "bounce". Only swap in
      // the new array when the shape OR content of any row differs.
      setRecentRuns((prev) => {
        if (prev.length !== res.rows.length) return res.rows;
        for (let i = 0; i < prev.length; i++) {
          const a = prev[i];
          const b = res.rows[i];
          if (
            a.id !== b.id
            || a.status !== b.status
            || a.outcome !== b.outcome
            || a.error_message !== b.error_message
            || a.started_at !== b.started_at
          ) {
            return res.rows;
          }
        }
        return prev;
      });
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
    // Track which logId we've already toasted on so a re-fire of the poll
    // (or a network hiccup that re-runs the tick) doesn't double-toast the
    // same failure.
    let toastedLogId: string | null = null;
    const tick = async () => {
      try {
        const status = await getBrowserRunStatus(activeSession.logId);
        if (TERMINAL.has(status.status)) {
          // Surface failures to the operator. The standalone-login flows
          // (manual login, verify, logout, auto-login test) run their
          // critical work in a background task on the server, so the
          // initial POST returns 200 even when the work later fails —
          // that's why these used to fail silently. Now any non-completed
          // terminal status produces a toast with the server's error
          // message (when present) or a kind-aware fallback string.
          if (status.status !== 'completed' && toastedLogId !== activeSession.logId) {
            toastedLogId = activeSession.logId;
            const kindLabel =
              activeSession.kind === 'login_logout' ? 'Logout' :
              activeSession.kind === 'login_verify' ? 'Verify' :
              activeSession.kind === 'login_manual' ? 'Login' :
              'Operation';
            const action = status.status === 'aborted' ? 'aborted' : 'failed';
            toast.error(
              status.error
                ? `${kindLabel} ${action}: ${status.error}`
                : `${kindLabel} ${action}.`
            );
          }
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

  // Poll the auto-login TEST run for terminal status as an SSE-loss
  // fallback. Same shape as the activeSession poll above but keyed off
  // testRunId. SSE remains the primary signal (it carries the per-phase
  // breadcrumbs that drive the rotating button label); this poll only
  // exists so that if the SSE terminal event is missed — tab in the
  // background and the browser throttled the EventSource, server hiccup,
  // network blip — the button doesn't stay stuck in "Auto-login
  // proceeding…" forever. On terminal status with no SSE-driven
  // testResult set, we render a generic success/failure outcome so the
  // operator gets visible confirmation without needing to refresh.
  const testPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!testRunId) {
      if (testPollRef.current) { clearInterval(testPollRef.current); testPollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const status = await getBrowserRunStatus(testRunId);
        if (TERMINAL.has(status.status)) {
          setTestRunId(null);
          setTestPhase('idle');
          // Only fill in a fallback result if SSE didn't beat us to it.
          setTestResult((prev) => prev ?? {
            kind: status.status === 'completed' ? 'success' : 'error',
            message:
              status.status === 'completed'
                ? 'Test completed.'
                : status.status === 'aborted'
                  ? 'Test was aborted.'
                  : 'Auto-login test failed.',
          });
          // Pull the latest login row + audit list so the status pill and
          // recent-runs table reflect reality. Silent: don't blow away
          // the form.
          if (selectedOrgId) { load(true); loadRecentRuns(); }
        }
      } catch {
        // Treat fetch failures as terminal — better to unstick the UI and
        // let the operator retry than to spin forever on a 404/transient.
        setTestRunId(null);
        setTestPhase('idle');
        setTestResult((prev) => prev ?? {
          kind: 'error',
          message: 'Lost track of the auto-login test — refresh to see the latest status.',
        });
      }
    };
    void tick();
    testPollRef.current = setInterval(tick, 4000);
    return () => { if (testPollRef.current) { clearInterval(testPollRef.current); testPollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRunId, selectedOrgId]);

  // Visibility-change reconcile: when the operator returns to a tab that
  // was backgrounded long enough for the browser to throttle/kill the
  // SSE stream, force an immediate silent reload + a poll-tick for any
  // in-flight test run. Without this, the button can stay stuck in
  // "Auto-login proceeding…" until the next 4s interval fires.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (selectedOrgId) load(true);
      if (testRunId) {
        // Fire-and-forget — the polling effect will resync state on the
        // very next tick regardless, this just hurries it along.
        getBrowserRunStatus(testRunId).then((status) => {
          if (TERMINAL.has(status.status)) {
            setTestRunId(null);
            setTestPhase('idle');
            setTestResult((prev) => prev ?? {
              kind: status.status === 'completed' ? 'success' : 'error',
              message:
                status.status === 'completed'
                  ? 'Test completed.'
                  : status.status === 'aborted'
                    ? 'Test was aborted.'
                    : 'Auto-login test failed.',
            });
            if (selectedOrgId) { load(true); loadRecentRuns(); }
          }
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testRunId, selectedOrgId]);

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
        //
        // Reference-stable update: SSE breadcrumbs during a verify/login
        // run fire this many times in quick succession. Replacing the
        // `login` object on every call forced every Card on the page to
        // re-render (the form, scripts panel, recent runs — anything that
        // closes over `login`) and produced a "bouncing page" feel. Only
        // swap in the new object when a display-relevant field actually
        // changed.
        const loginData = await getLogin(selectedOrgId, id);
        setLogin((prev) => {
          if (!prev) return loginData;
          const changed =
            prev.status !== loginData.status
            || prev.last_checked_at !== loginData.last_checked_at
            || prev.last_logged_in_at !== loginData.last_logged_in_at
            || prev.credentials_secret_id !== loginData.credentials_secret_id
            || prev.auto_login_script_id !== loginData.auto_login_script_id
            || prev.notification_slack_channel_id !== loginData.notification_slack_channel_id
            || prev.name !== loginData.name
            || prev.url !== loginData.url
            || prev.verify_script_id !== loginData.verify_script_id;
          return changed ? loginData : prev;
        });
        return;
      }
      // The two slots draw from different pools now (migration 283): the
      // auto-login picker offers only 'login' scripts, the verify picker
      // only 'login_verify'. Fetched separately rather than one list
      // filtered client-side so each picker can't drift from the server's
      // definition of what belongs in it.
      const [loginData, groups, loginGroups, loginScriptsData, verifyScriptsData, credKeys] = await Promise.all([
        getLogin(selectedOrgId, id),
        getAgentAccessGroups(selectedOrgId),
        getLoginAccessGroups(selectedOrgId, id),
        listScripts(selectedOrgId, { kinds: ['login'] }).catch(() => ({ scripts: [] as BrowserScript[] })),
        listScripts(selectedOrgId, { kinds: ['login_verify'] }).catch(() => ({ scripts: [] as BrowserScript[] })),
        getLoginCredentialKeys(selectedOrgId, id).catch(() => [] as string[]),
      ]);
      setLogin(loginData);
      setForm({ name: loginData.name, url: loginData.url, verify_script_id: loginData.verify_script_id ?? null });
      setAllGroups(groups);
      setLoginGroupIds(loginGroups.map((g) => g.id));
      setScripts(loginScriptsData.scripts ?? []);
      setVerifyScripts(verifyScriptsData.scripts ?? []);
      setStoredCredKeys(credKeys);
      setScriptId(loginData.auto_login_script_id ?? null);
      setSlackChannelId(loginData.notification_slack_channel_id ?? '');
      // Reset the credential drafts on initial / explicit reload — we never
      // display existing values (encrypted), so every field starts blank.
      // SSE-driven silent refreshes skip this so half-typed entries aren't
      // wiped mid-edit.
      setCredDrafts({});
      setRevealedCred({});
    } catch {
      if (!silent) toast.error('Failed to load login');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { load(); }, [load]);

  // Near-realtime: versioned polling on this login's topic (+ the active
  // run's topic while one is in flight). Replaces the SSE stream.
  //
  // Scope: ONLY the login-specific topic + run topic. We deliberately do
  // NOT watch `org:<orgId>:logins` — that would refresh this page when
  // any unrelated login in the org changes.
  //
  // What changed vs SSE: we no longer receive event payloads, so the
  // auto-login test's per-phase label rotation ("Verifying login…" →
  // "Auto-login proceeding…") is driven optimistically at start + by the
  // testRunId terminal poll instead of mid-run breadcrumb events. The
  // operator sees start + terminal states — the intermediate phase
  // granularity was nice-to-have. All refreshes stay silent
  // (load(silent=true)) so the form/credentials editor never flickers,
  // and the reference-stable setLogin/setRecentRuns updates mean a
  // refetch with unchanged data re-renders nothing.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTopics = useMemo(
    () => (selectedOrgId
      ? [`login:${id}`, ...(activeSession ? [`run:${activeSession.logId}`] : [])]
      : []),
    [selectedOrgId, id, activeSession?.logId]
  );
  useTopicVersions({
    topics: versionTopics,
    enabled: !!selectedOrgId,
    onChange: () => {
      // Debounce so a burst of near-simultaneous changes (login_run
      // completed + login status flip) coalesces into a single fetch.
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { load(true); loadRecentRuns(); }, 300);
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
      // verify_script_id is required (route-layer rejects nulls). Only send
      // the field when it changed — otherwise leave the existing value alone.
      const verifyScriptChanged = form.verify_script_id !== (login?.verify_script_id ?? null);
      // Same explicit-set vs leave-alone semantics for the Slack channel
      // override. Empty string in the UI maps to null in the patch
      // (explicit clear); only send the field if it actually changed.
      const normalizedSlack = slackChannelId.trim() || null;
      const slackChanged = normalizedSlack !== (login?.notification_slack_channel_id ?? null);
      await updateLogin(selectedOrgId, id, {
        name: form.name.trim(),
        url: form.url.trim(),
        ...(scriptChanged ? { auto_login_script_id: scriptId } : {}),
        // verify_script_id is non-null here — the Save button is disabled
        // when form.verify_script_id is falsy, so we can't reach this point
        // with a null. Guard at the spread anyway to satisfy the typed
        // patch shape (LoginPatch.verify_script_id is `string | undefined`,
        // not nullable — the API rejects null).
        ...(verifyScriptChanged && form.verify_script_id
          ? { verify_script_id: form.verify_script_id }
          : {}),
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
   * The credential KEYS this login needs — the declared inputs of its
   * linked login script, minus engine-supplied reserved names ({{_mfa}}
   * comes from the 2FA enrollment, not from credentials).
   *
   * Derived rather than hand-typed so a key can't be misspelled into a
   * value that silently substitutes blank at runtime — historically the
   * single most common auto-login failure.
   */
  const linkedLoginScript = scripts.find((s) => s.id === scriptId) ?? null;

  /**
   * The login profile's `url` is no longer something operators should
   * maintain by hand — the scripts define the flow. It can't be dropped
   * outright though: the MANUAL (HITL) login path calls
   * navigateWorkerRun(logId, login.url) to open the operator's browser
   * somewhere, so an empty url means a blank window and a stuck human.
   *
   * So: derive it from the login script's first `navigate` step and keep the
   * field as a rarely-touched override. Same value, no upkeep.
   */
  const scriptStartUrl = useMemo(() => {
    const nav = (linkedLoginScript?.steps ?? []).find(
      (s: any) => s?.action === 'navigate' && typeof s?.url === 'string' && s.url.trim(),
    ) as { url?: string } | undefined;
    return nav?.url?.trim() ?? null;
  }, [linkedLoginScript]);

  /**
   * Keep the manual-login URL in step with the linked script.
   *
   * Adopts the script's start URL when the field is empty, AND whenever the
   * operator switches to a DIFFERENT script — the old value belonged to the
   * old script, so carrying it over would silently point manual logins at
   * the wrong site.
   *
   * It does NOT re-stomp on every render, so a deliberate edit sticks: a
   * script's first navigate is sometimes a deep link the automation can hit
   * but a human shouldn't start from. The "Use script's URL" action re-syncs
   * on demand after such an edit.
   */
  const lastScriptForUrlRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = lastScriptForUrlRef.current;
    const switchedScript = previous !== undefined && previous !== scriptId;
    lastScriptForUrlRef.current = scriptId;
    if (!scriptStartUrl) return;
    setForm((f) => (switchedScript || !f.url.trim() ? { ...f, url: scriptStartUrl } : f));
  }, [scriptStartUrl, scriptId]);
  /**
   * Does the login script fill a 2FA field?
   *
   * Same contract as requiredCredKeys just below: the SCRIPT declares what it
   * needs, and the form follows. The difference is where to look — reserved
   * variables are deliberately excluded from `parameters`, so {{_mfa}} only ever
   * appears inside the steps.
   *
   * Text-level match for the same reason the backend does it that way: the token
   * can sit in any string field of any step, and a structural walk would fail
   * silently the moment a step type gained a field. The pre-303 spelling counts
   * too, so an un-migrated script is not mistaken for one needing no 2FA.
   */
  const mfaRequiredByScript = useMemo(() => {
    if (!linkedLoginScript?.steps) return false;
    try {
      const text = JSON.stringify(linkedLoginScript.steps);
      return text.includes('{{_mfa}}') || text.includes('{{_totp}}');
    } catch {
      return false;
    }
  }, [linkedLoginScript]);

  const requiredCredKeys = useMemo(() => {
    const declared = Object.keys(linkedLoginScript?.parameters ?? {});
    return declared.filter((k) => !isReservedParam(k));
  }, [linkedLoginScript]);

  /**
   * Keys that are stored but no longer referenced by the script — usually
   * left behind after the script was re-recorded. Surfaced so they can be
   * removed rather than sitting encrypted and forgotten.
   */
  const orphanCredKeys = useMemo(
    () => storedCredKeys.filter((k) => !requiredCredKeys.includes(k)),
    [storedCredKeys, requiredCredKeys],
  );

  /**
   * Commit credential values. Submits ONLY the keys the operator actually
   * typed into — the backend merges, so untouched keys keep their stored
   * values. That's what makes "change just the password" possible when the
   * API can never show us the username.
   */
  const handleSaveCredentials = async () => {
    if (!selectedOrgId || !id) return;
    const credentials: Record<string, string> = {};
    for (const [k, v] of Object.entries(credDrafts)) {
      if (v.trim() === '') continue;   // blank = leave as-is (see api docs)
      credentials[k] = v;
    }
    if (Object.keys(credentials).length === 0) {
      toast.error('Enter a value for at least one credential first');
      return;
    }
    setSavingCreds(true);
    try {
      const updated = await setLoginCredentials(selectedOrgId, id, credentials);
      setLogin(updated);
      setCredDrafts({});      // values are encrypted server-side now
      setRevealedCred({});
      setStoredCredKeys(await getLoginCredentialKeys(selectedOrgId, id).catch(() => storedCredKeys));
      toast.success(`Saved ${Object.keys(credentials).length} credential(s)`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  };

  /** Remove a single stored credential (blank-means-unchanged on save, so
   *  clearing one needs its own explicit action). */
  const handleRemoveCredentialKey = async (key: string) => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: `Remove "${key}"?`,
      description: 'The stored value is deleted. Any script step using it will fill blank until you set it again.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setSavingCreds(true);
    try {
      const updated = await deleteLoginCredentialKey(selectedOrgId, id, key);
      setLogin(updated);
      setCredDrafts((p) => { const n = { ...p }; delete n[key]; return n; });
      setStoredCredKeys(await getLoginCredentialKeys(selectedOrgId, id).catch(() => storedCredKeys.filter((k) => k !== key)));
      toast.success(`Removed "${key}"`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove credential');
    } finally {
      setSavingCreds(false);
    }
  };

  /**
   * Standalone test of the auto-login chain — same code path the agent
   * uses (verify → script → re-verify) but with no HITL fallback.
   *
   * UX: no browser viewer. The button shows an optimistic "Verifying
   * login…" at start; the terminal outcome arrives via the testRunId
   * status poll (below), which sets `testResult` rendered inline under
   * the button row. (The per-phase label rotation that SSE used to
   * drive was dropped in the versioned-polling migration — start +
   * terminal states are what matter.)
   */
  const handleTestAutoLogin = async () => {
    if (!selectedOrgId) return;
    setTestResult(null);
    // Optimistic phase — shows immediately while the request is in flight; the
    // moment but it avoids a flash of "Test auto-login" while the
    // request is still in flight.
    setTestPhase('verifying_initial');
    setTestRunId(null);
    try {
      const result = await testAutoLogin(selectedOrgId, id);
      // Capture the runId so the polling fallback (below) can reconcile
      // testPhase if the terminal SSE event never arrives. Without this,
      // a backgrounded tab or dropped SSE leaves the button stuck.
      setTestRunId(result.executionLogId);
    } catch (err: any) {
      setTestPhase('idle');
      setTestRunId(null);
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
      setCredDrafts({});
      setRevealedCred({});
      setStoredCredKeys([]);
      toast.success('Credentials removed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove credentials');
    } finally {
      setSavingCreds(false);
    }
  };

  /**
   * Fetch the current code from the server. Deliberately server-computed so
   * the seed never reaches the browser. Silent on failure — this is polled
   * on a timer, and a toast per tick would be unusable.
   */
  const refreshTotpPreview = useCallback(async (opts?: { silent?: boolean }) => {
    if (!selectedOrgId || !id) return;
    if (!opts?.silent) setTotpPreviewLoading(true);
    try {
      setTotpPreview(await previewLoginTotp(selectedOrgId, id));
    } catch {
      setTotpPreview(null);
    } finally {
      if (!opts?.silent) setTotpPreviewLoading(false);
    }
  }, [selectedOrgId, id]);

  /**
   * Local countdown. Ticks the displayed seconds down once a second and
   * re-fetches from the server when the window rolls, so the operator sees
   * the code change in step with their authenticator app rather than a
   * frozen number that silently goes wrong.
   */
  // Depends only on "is 2FA enrolled", NOT on totpPreview — the functional
  // updater reads the latest value, so the interval is created once and left
  // alone. Including totpPreview would tear down and recreate the timer on
  // every tick, letting the countdown drift.
  useEffect(() => {
    if (!login?.totp_secret_id) return;
    const timer = setInterval(() => {
      setTotpPreview((prev) => {
        if (!prev) return prev;
        const next = prev.seconds_remaining - 1;
        // Window rolled — pull the new code. Kicked off from inside the
        // updater but harmless: refreshTotpPreview is async and only sets
        // state once it resolves.
        if (next <= 0) { void refreshTotpPreview({ silent: true }); return prev; }
        return { ...prev, seconds_remaining: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [login?.totp_secret_id, refreshTotpPreview]);

  /** Load a preview whenever the login has 2FA enrolled. */
  useEffect(() => {
    if (login?.totp_secret_id) void refreshTotpPreview({ silent: true });
    else setTotpPreview(null);
  }, [login?.totp_secret_id, refreshTotpPreview]);

  /**
   * Enroll straight from a decoded QR, bypassing the text box.
   *
   * Deliberately does NOT round-trip the seed through `totpInput`: putting a
   * scanned secret into React state leaves it sitting in a DOM input (and in
   * any devtools inspection of the tree) long after it's been stored. Decode
   * → submit → forget.
   */
  const enrollFromQrText = async (text: string) => {
    if (!selectedOrgId || !id) return;
    setSavingTotp(true);
    try {
      const updated = await setLoginTotp(selectedOrgId, id, text);
      setLogin(updated);
      setTotpInput('');
      await refreshTotpPreview();
      toast.success('2FA enrolled from QR — check the last 3 digits match your authenticator app');
    } catch (err: any) {
      // Most likely cause of a failure here: the QR decoded fine but wasn't
      // an otpauth:// code (a WiFi QR, a link). The backend message says so.
      toast.error(err.response?.data?.error || 'That QR code is not a 2FA setup code');
    } finally {
      setSavingTotp(false);
    }
  };

  /** Decode an image (pasted, dropped, or picked) and enroll from it. */
  const handleQrImage = async (file: Blob) => {
    setDecodingQr(true);
    try {
      const text = await decodeQrFromFile(file);
      if (!text) {
        toast.error('No QR code found in that image — try a tighter crop or a larger screenshot');
        return;
      }
      await enrollFromQrText(text);
    } catch {
      toast.error('Could not read that image');
    } finally {
      setDecodingQr(false);
    }
  };

  const handleSaveTotp = async () => {
    if (!selectedOrgId || !id) return;
    const input = totpInput.trim();
    if (!input) {
      toast.error('Paste the setup key, or scan the QR code');
      return;
    }
    setSavingTotp(true);
    try {
      const updated = await setLoginTotp(selectedOrgId, id, input);
      setLogin(updated);
      // Clear immediately — leaving a seed sitting in a DOM input after
      // it's been stored is a needless exposure.
      setTotpInput('');
      await refreshTotpPreview();
      toast.success('2FA enrolled — check the last 3 digits match your authenticator app');
    } catch (err: any) {
      // The backend returns a 400 whose message names the actual problem
      // (bad base32 char, HOTP URI, missing secret). Surface it verbatim —
      // it's the actionable part.
      toast.error(err.response?.data?.error || 'Failed to store the 2FA secret');
    } finally {
      setSavingTotp(false);
    }
  };

  const handleClearTotp = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Remove 2FA enrollment?',
      description: 'Scripts using {{_mfa}} will fill blank and 2FA-protected logins will fall back to manual login until you re-enroll.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    setSavingTotp(true);
    try {
      const updated = await clearLoginTotp(selectedOrgId, id);
      setLogin(updated);
      setTotpPreview(null);
      setTotpInput('');
      toast.success('2FA enrollment removed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove 2FA enrollment');
    } finally {
      setSavingTotp(false);
    }
  };


  /**
   * Delete the login script from the login that owns it.
   *
   * Order matters: agent_logins holds an FK to the script, so the delete is
   * REFUSED while this login still points at it. Unlink first, persist that,
   * then delete — the other order produces a confusing FK error on a button
   * that looks like it should just work.
   *
   * Only the LOGIN slot gets this. verify_script_id is a required column
   * (the API rejects null), so a linked verify script genuinely cannot be
   * removed — record or pick a replacement first, then delete the orphan
   * from the Scripts list with "Show login scripts" enabled.
   */
  const handleDeleteScript = async (target: BrowserScript) => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: `Delete "${target.name}"?`,
      description: 'This login falls back to manual sign-in until you set another. The script is deleted permanently.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await updateLogin(selectedOrgId, id, { auto_login_script_id: null });
      await deleteScript(selectedOrgId, target.id);
      setScriptId(null);
      setScripts((prev) => prev.filter((x) => x.id !== target.id));
      toast.success(`Deleted "${target.name}"`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete the script');
    }
  };

  /**
   * Swap the login onto a different verify script, then delete the old one.
   *
   * Order is forced by the schema: verify_script_id is required and its FK is
   * ON DELETE RESTRICT, so the replacement must be persisted BEFORE the old
   * script can go. Doing it the other way round just earns a 409.
   */
  const handleReplaceAndDeleteVerify = async () => {
    if (!selectedOrgId || !id || !verifyToDelete || !verifyReplacementId) return;
    const doomed = verifyToDelete;
    try {
      await updateLogin(selectedOrgId, id, { verify_script_id: verifyReplacementId });
      await deleteScript(selectedOrgId, doomed.id);
      setForm((f) => ({ ...f, verify_script_id: verifyReplacementId }));
      setVerifyScripts((prev) => prev.filter((x) => x.id !== doomed.id));
      setVerifyToDelete(null);
      setVerifyReplacementId(null);
      toast.success(`Replaced and deleted "${doomed.name}"`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to replace the verify script');
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
    setStartingAction('verify');
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
      setStartingAction(null);
    }
  };

  const handleLogin = async () => {
    if (!selectedOrgId) return;
    setStartingAction('login');
    // Centralized via useStartManualLogin — same flow as the
    // Interactions page and the logins list. CRITICALLY, this used
    // to skip the pre-clear step that the other two pages already
    // had, which left stale cookies in the session row and made
    // repeated Log In clicks on a broken profile silently inherit
    // the bad state. The hook now ensures all three entry points
    // behave identically.
    const result = await startManualLogin(selectedOrgId, id, `Log in: ${login?.name}`);
    setStartingAction(null);
    if (result) setDialogOpen(true);
  };

  // Manual logout — fully automated server-side. Backend's
  // startLoginLogout closes every Chrome window for this profile,
  // deletes the profile dir, and stamps status='needs_login'. There
  // is no HITL step for the operator anymore — used to be an
  // "interactive" session where they manually clicked log-out in the
  // app and confirmed Done, but the persistent-profile rm-the-dir
  // model made all of that redundant. We just kick off the run and
  // let the polling effect track it to terminal; the button shows a
  // spinner + "Logging out..." while active and the toast in that
  // effect surfaces any failure.
  /**
   * Wipe the saved browser state for this login — cookies + localStorage in
   * the profile Chrome actually runs against, plus the stored storage_state.
   *
   * NOT the same as Log Out. Logging out uses the site's own sign-out UI,
   * and a "trust this device / remember me for 30 days" cookie is designed
   * to SURVIVE that — so a logout leaves 2FA suppressed on the next sign-in.
   * This clears the jar outright, so the site treats the next visit as a
   * brand-new device and challenges for 2FA again.
   *
   * Destructive and rarely needed, hence a confirm: the next run has to do a
   * full sign-in, which for a 2FA site means either an enrolled secret or a
   * human.
   */
  const handleClearSession = async () => {
    if (!selectedOrgId || !id) return;
    const ok = await confirm({
      title: 'Clear saved browser session?',
      description:
        'Deletes the cookies and local storage this login has saved, including any '
        + '"remember this device" cookie that suppresses 2FA. The next run must sign in '
        + 'from scratch. Use this when you need the site to challenge for 2FA again.',
      confirmText: 'Clear session',
      variant: 'destructive',
    });
    if (!ok) return;
    setStartingAction('clear_session');
    try {
      await clearLoginSession(selectedOrgId, id);
      toast.success('Saved session cleared — the next sign-in starts clean');
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to clear the session');
    } finally {
      setStartingAction(null);
    }
  };

  const handleLogout = async () => {
    if (!selectedOrgId) return;

    // Destructive confirmation — logout closes every Chrome window
    // bound to this profile (closeAllRunsForProfile) and wipes the
    // user-data-dir. Any agent run currently using this login —
    // mid-step, awaiting HITL, parked in the login queue — gets
    // rug-pulled and will surface as failed in execution history.
    // The operator may not realize this when they click the button on
    // a quiet-looking page, so we make the impact explicit.
    const confirmed = await confirm({
      title:       'Log Out of this Profile?',
      description: (
        <div className="space-y-2">
          <p>
            This will close every Chrome window using{' '}
            <span className="font-medium text-foreground">{login?.name ?? 'this login'}</span>{' '}
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

    setStartingAction('logout');
    try {
      const result = await startLogout(selectedOrgId, id);
      setActiveVerifySession({
        entityId: id,
        kind: 'login_logout',
        logId: result.executionLogId,
        label: `Log out: ${login?.name}`,
        // 'observe' so the existing dialog-open paths (e.g. clicking
        // the row's "Watch" button) wouldn't open it in interactive
        // mode — but the dialog itself isn't auto-opened here at all.
        mode: 'observe',
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start logout');
    } finally {
      setStartingAction(null);
    }
  };

  if (!allowed) return <NoPermissionContent />;

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!login) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
        <p className="text-sm text-muted-foreground">Login not found.</p>
      </div>
    );
  }

  const needsLogin = login.status === 'needs_login';

  return (
    // Radix tooltips need a Provider in scope; there isn't a global one, so
    // it's scoped to this page. delayDuration 200 — these are ⓘ affordances
    // the operator points at deliberately, not accidental hovers.
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header — the name is edited here rather than in a form field below.
          It's the page's title, so a separate "Name" input just duplicated
          it. Renders as plain heading text with an edit button; the input
          chrome only appears once you're actually editing, so the page
          isn't carrying a permanent box around its own title. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <LogIn className="h-5 w-5 text-brand shrink-0" />
          {editingName ? (
            <Input
              autoFocus
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); setEditingName(false); }
                // Escape abandons the edit and restores the saved name.
                if (e.key === 'Escape') {
                  setForm((f) => ({ ...f, name: login.name }));
                  setEditingName(false);
                }
              }}
              placeholder="Login name"
              aria-label="Login name"
              className={cn(
                'text-2xl font-bold tracking-tight h-auto py-0.5 px-2 min-w-0',
                !form.name.trim() && 'border-destructive focus-visible:ring-destructive/30',
              )}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group flex items-center gap-2 min-w-0 text-left rounded px-1 -mx-1 hover:bg-muted/40 transition-colors"
              title="Rename this login"
            >
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {form.name || <span className="text-muted-foreground font-normal italic">Unnamed login</span>}
              </h1>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim() || !form.verify_script_id}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      {/* Status + actions card */}
      <Card>
        <CardContent className="py-2 px-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusPill status={login.status} />
              <span className="text-xs text-muted-foreground">
                Checked {formatRelative(login.last_checked_at)}
              </span>
              {login.last_logged_in_at && (
                <span className="text-xs text-muted-foreground">
                  · Logged in {formatRelative(login.last_logged_in_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {needsLogin ? (
                // Two distinct in-flight states share this button:
                //   startingAction === 'login' → request to /startLogin is
                //     in flight (brief, pre-dialog)
                //   activeSession.kind === 'login_verify' → user clicked
                //     Done in the HITL dialog and the post-Done verify is
                //     running in the background. The login row's status
                //     is mid-flip from 'needs_login' → 'verifying' (SSE
                //     hasn't arrived yet), so we'd otherwise still render
                //     the "Log In" affordance even though there's nothing
                //     to click. Show "Verifying..." so the operator knows
                //     it's working.
                // Once SSE / poll updates login.status to 'verifying',
                // needsLogin flips false and the else branch (Verify +
                // Log Out) takes over — its Verify button has the same
                // login_verify-aware label, so the transition reads as
                // a continuous "Verifying..." state across button swaps.
                <Button size="sm" onClick={handleLogin} disabled={isStarting || !!activeSession}
                  className="bg-warning hover:bg-warning/90 text-white text-xs">
                  {startingAction === 'login' || (activeSession && activeSession.kind === 'login_verify')
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <LogIn className="h-3 w-3" />}
                  <span className="ml-1">
                    {activeSession && activeSession.kind === 'login_verify' ? 'Verifying...' : 'Log In'}
                  </span>
                </Button>
              ) : (
                <>
                  {/* Verify button intentionally hidden from operators.
                      Agent runs and the post-manual-login flow already
                      verify automatically, and an operator-driven verify
                      kicks off a fresh slot whose first navigation can
                      transiently land on a not-yet-loaded page and
                      flip the row to needs_login — confusing for a
                      session that's actually fine.
                      handleVerify is still exported (kept for super-
                      admin/debug use later) but no button surface it. */}
                  {/* Spinner-only state when a verify is running in
                      the background (e.g. fired by an agent or by the
                      post-manual-login chain) so the operator knows
                      activity is happening without giving them a
                      button to trigger it manually. */}
                  {activeSession && activeSession.kind === 'login_verify' && (
                    <Button variant="outline" size="sm" disabled className="text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="ml-1">Verifying...</span>
                    </Button>
                  )}
                  {/* Logout — fully automated. Backend closes Chrome,
                      rm-rf's the profile dir, marks needs_login. The
                      button just shows a spinner + "Logging out..." while
                      the run is in flight; no HITL dialog opens. Only
                      meaningful when the profile is currently valid;
                      hidden in needs_login. */}
                  <Button variant="outline" size="sm" onClick={handleLogout} disabled={isStarting || !!activeSession} className="text-xs">
                    {startingAction === 'logout' || (activeSession && activeSession.kind === 'login_logout')
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <LogOut className="h-3 w-3" />}
                    <span className="ml-1">
                      {activeSession && activeSession.kind === 'login_logout' ? 'Logging out...' : 'Log Out'}
                    </span>
                  </Button>
                  {/* Clear session — the only way to drop a "remember this
                      device" cookie, which a site-side logout deliberately
                      keeps. Sits next to Log Out because that's where people
                      look for it, styled quieter since it's rarely right. */}
                  <Button
                    variant="ghost" size="sm"
                    onClick={handleClearSession}
                    disabled={isStarting || !!activeSession}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    title="Delete saved cookies for this login, including any 2FA 'remember this device' cookie"
                  >
                    {startingAction === 'clear_session'
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Eraser className="h-3 w-3" />}
                    <span className="ml-1">Clear session</span>
                  </Button>
                </>
              )}
              {/* Watch button for in-flight verify / manual login sessions —
                  re-opens the HITL dialog so the operator can monitor or
                  interact. Logout has no HITL step (fully automated), so
                  there's nothing to watch — hide the button for that kind. */}
              {activeSession && activeSession.kind !== 'login_logout' && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setDialogOpen(true)}>
                  Watch
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-3">
        {/* Equal min-width on every trigger so the pill group doesn't
            resize as labels change length — a ragged tab bar is the first
            thing that makes a page look unfinished. */}
        <TabsList className="h-10">
          <TabsTrigger value="setup" className="min-w-[128px] gap-1.5">
            <Settings2 className="h-3.5 w-3.5" /> Setup
          </TabsTrigger>
          <TabsTrigger value="runs" className="min-w-[128px] gap-1.5">
            <History className="h-3.5 w-3.5" /> Runs
          </TabsTrigger>
          {/* Both things on this tab answer "who handles it when this login
              needs a human" — the groups allowed to act, and where the ping
              goes. "Handoff" names that rather than listing the two widgets. */}
          <TabsTrigger value="access" className="min-w-[128px] gap-1.5">
            <Users className="h-3.5 w-3.5" /> Handoff
          </TabsTrigger>
          {/* 2FA is its own tab because it is a mode, not a field: the form
              you need depends entirely on which source is chosen, and mixing
              that into Setup meant three save buttons competing on one
              screen. */}
          <TabsTrigger value="2fa" className="min-w-[128px] gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Two-factor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="space-y-3 mt-0">

      {/* Login */}
      <Card>
        <CardContent className="py-3 px-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand" />
                Login
              </Label>
              <p className="text-xs text-muted-foreground max-w-2xl">
Agents sign in unattended when the script and its values are set.
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
              {/* Only shown once enrolled — an explicit "No 2FA" badge would
                  read as a warning on the overwhelming majority of logins
                  that legitimately don't have 2FA at all. */}
              {login.totp_secret_id && (
                <Badge variant="success" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-2.5 w-2.5" /> 2FA enrolled
                </Badge>
              )}
              {/* Test Auto-Login button intentionally hidden from
                  operators. Runs a synthetic verify → auto-login →
                  re-verify chain that allocates a browser slot, which
                  competes with real agent runs for the worker. Operators
                  asked to surface this only when an auto-login is
                  actively failing in production, which they can already
                  diagnose by triggering an actual agent run against the
                  login. Keeping handleTestAutoLogin + testAutoLogin
                  imports in place so we can re-introduce a debug-only
                  surface later without rebuilding the wiring.
                  Live-test progress (when something else has triggered
                  one) is still shown via the testPhase-driven banner
                  below this header row. */}
              {testPhase !== 'idle' && (
                <Button type="button" variant="outline" size="sm" disabled className="text-xs min-w-[170px]">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {testPhase === 'verifying_initial'        ? 'Verifying login…'
                   : testPhase === 'running_script'          ? 'Auto-login proceeding…'
                   : testPhase === 'verifying_after_script'  ? 'Verifying auto-login…'
                   : 'Testing…'}
                </Button>
              )}
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

          {/* Manual login URL — first field. Auto-filled from the login
              script's first navigate step, so it's normally untouched, but
              it can't be dropped: the manual (HITL) path navigates the
              operator's browser here and an empty value means a blank
              window and a stuck human. */}
          <Field
            label="Login URL"
            action={scriptStartUrl && form.url !== scriptStartUrl ? (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, url: scriptStartUrl }))}
                className="text-[10px] text-brand hover:underline"
              >
                Use script&apos;s URL
              </button>
            ) : undefined}
            info="Where a manual login opens in the browser. Agents never use this — they follow the login script. Auto-filled from the script's first navigate step."
          >
            <Input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://app.example.com/login"
              className={cn('font-mono text-xs', CONTROL_W)}
            />
          </Field>

          {/* Script slot. With no login scripts in the org there's nothing
              to choose from, so the dropdown is suppressed entirely and
              recording is the only offered action — an empty select reads
              as "something is broken" rather than "nothing exists yet". */}
          <ScriptSlot
            label="Login script"
            info={<>Fills the sign-in form and submits. Every <code className="font-mono">{'{{variable}}'}</code> it declares becomes a credential below, stored encrypted.</>}
            scripts={scripts}
            value={scriptId}
            onChange={setScriptId}
            onRecord={() => setRecordModalOpen(true)}
            onEdit={(s) => setEditScript(s)}
            onDelete={handleDeleteScript}
            recordLabel="Record login script"
            emptyHint="Record the sign-in once; agents replay it."
            allowNone
            noneLabel="— None (manual login only) —"
          />

          {/* Credentials — rows derived from the login script's inputs.
              Keys are no longer typed by hand: a misspelled key used to
              substitute blank at runtime with no visible cause, which was
              the most common auto-login failure. The script declares what
              it needs; this just fills in the values. */}
          {/* Nested under the script row, with a left accent, because these
              keys ARE the script's variables — the relationship is shown
              rather than explained. */}
          {scriptId && (
          <FieldNest>
            <div className="rounded-md border border-l-2 border-l-brand/40 bg-muted/20 px-3 py-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {requiredCredKeys.length > 0
                    ? <>Variables from <span className="font-mono">{linkedLoginScript?.name}</span> — encrypted, never shown again</>
                    : <><span className="font-mono">{linkedLoginScript?.name}</span> declares no <code className="font-mono">{'{{variables}}'}</code> yet</>}
                </span>
                {login.credentials_secret_id && (
                  <button
                    type="button"
                    onClick={handleClearCredentials}
                    disabled={savingCreds}
                    className="text-[10px] text-destructive hover:underline disabled:opacity-50 shrink-0"
                  >
                    Remove all
                  </button>
                )}
              </div>

              {requiredCredKeys.map((key) => {
                const isSet = storedCredKeys.includes(key);
                const draft = credDrafts[key] ?? '';
                return (
                  <div key={key} className="flex items-center gap-2">
                    {/* Key is fixed — it comes from the script. */}
                    <code
                      className="font-mono text-xs w-36 shrink-0 truncate text-purple-500 dark:text-purple-400"
                      title={`{{${key}}}`}
                    >
                      {key}
                    </code>
                    <Input
                      type={revealedCred[key] ? 'text' : 'password'}
                      placeholder={isSet ? '•••••••• (unchanged)' : 'Enter value'}
                      value={draft}
                      onChange={(ev) => setCredDrafts((p) => ({ ...p, [key]: ev.target.value }))}
                      className={cn('flex-1 min-w-0 font-mono text-xs h-8', CONTROL_W)}
                      autoComplete="off"
                    />
                    <Badge
                      variant={isSet ? 'success' : 'neutral'}
                      className="gap-1 text-[9px] shrink-0"
                    >
                      {isSet ? <CheckCircle2 className="h-2 w-2" /> : null}
                      {isSet ? 'Set' : 'Not set'}
                    </Badge>
                    {/* No per-key delete. These keys are declared by the login
                        script, so clearing one doesn't remove a field — it
                        leaves the script filling BLANK at that step, which
                        fails the login with no visible cause. Values can be
                        overwritten; the key set belongs to the script. */}
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setRevealedCred((p) => ({ ...p, [key]: !p[key] }))}
                      title={revealedCred[key] ? 'Hide' : 'Show what you typed'}
                    >
                      {revealedCred[key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                );
              })}

              {/* Stored keys the script no longer references — usually left
                  over from a re-record. Read-only: the only useful action is
                  to delete them. */}
              {orphanCredKeys.length > 0 && (
                <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 px-2.5 py-2 space-y-1.5">
                  <p className="text-[10px] text-amber-700 dark:text-amber-400">
                    Stored but no longer used by{' '}
                    <span className="font-mono">{linkedLoginScript?.name ?? 'the linked script'}</span>:
                  </p>
                  {orphanCredKeys.map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <code className="font-mono text-xs flex-1 truncate">{key}</code>
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-6 text-[10px]"
                        onClick={() => handleRemoveCredentialKey(key)}
                        disabled={savingCreds}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {requiredCredKeys.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveCredentials}
                    disabled={savingCreds || Object.values(credDrafts).every((v) => !v.trim())}
                  >
                    {savingCreds ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <KeyRound className="h-3.5 w-3.5 mr-1" />}
                    Save
                  </Button>
                  {requiredCredKeys.some((k) => !storedCredKeys.includes(k)) && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-500">
                      {requiredCredKeys.filter((k) => !storedCredKeys.includes(k)).length} unset — those
                      fields will fill blank.
                    </span>
                  )}
                </div>
              )}
            </div>
          </FieldNest>
          )}

        </CardContent>
      </Card>

      {/* Verify Login */}
      <Card>
        <CardContent className="py-3 px-5 space-y-3">
          <Label className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
            Verify Login
          </Label>
          <ScriptSlot
            label="Verify script"
            required
            info={<>Runs before every action to confirm the session is still signed in. Completing = signed in; any step failure or timeout = not signed in.<br /><br />Every login must have one, so this script can&apos;t be deleted while it&apos;s selected. To remove it, pick or record a replacement first, then delete the old one from <strong>Scripts</strong> with &ldquo;Show login scripts&rdquo; enabled.</>}
            scripts={verifyScripts}
            value={form.verify_script_id}
            onChange={(v) => setForm((f) => ({ ...f, verify_script_id: v }))}
            onRecord={() => setRecordVerifyModalOpen(true)}
            onEdit={(s) => setEditScript(s)}
            // "Delete" opens a replace-then-delete flow rather than a plain
            // confirm: verify_script_id is NOT NULL with an ON DELETE
            // RESTRICT FK, so the login must be pointed at a replacement
            // before the old script can go.
            onDelete={(s) => { setVerifyReplacementId(null); setVerifyToDelete(s); }}
            recordLabel="Record verify script"
            emptyHint="Open a page only a signed-in user can see."
          />
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="2fa" className="space-y-3 mt-0">

      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Which source supplies {{_mfa}}. Above the enrolment UI because it
              decides whether that UI is relevant at all — an authenticator
              secret is meaningless on a login that reads its codes from Slack. */}
          <MfaSourceSection
            orgId={selectedOrgId}
            login={login}
            requiredByScript={mfaRequiredByScript}
            scriptName={linkedLoginScript?.name ?? null}
            onSaved={() => { void load(true); }}
          />

          {/* Authenticator enrolment — only for the totp source. A login with no
              second factor, or one reading codes from Slack, has nothing to
              enrol, and showing the seed capture anyway invited storing a
              secret that would never be used. */}
          {(login.mfa_source ?? (login.totp_secret_id ? 'totp' : 'none')) === 'totp' && (
          <div className="border-t pt-3">
          <Field
            label="Authenticator secret"
            action={login.totp_secret_id ? (
              <button
                type="button"
                onClick={handleClearTotp}
                disabled={savingTotp}
                className="text-[10px] text-destructive hover:underline disabled:opacity-50 shrink-0"
              >
                Remove
              </button>
            ) : undefined}
            info={<>Paste the setup key from the site&apos;s 2FA screen (use its &ldquo;can&apos;t scan the QR code?&rdquo; option), scan the QR, or import from your authenticator app&apos;s export QR. The login script then references <code className="font-mono">{'{{_mfa}}'}</code>.</>}
          >
            {/* ENROLLED and NOT-ENROLLED are mutually exclusive states, not a
                form with extra bits shown. Once a secret is on file the only
                sensible action is Remove — leaving the input, the scan/upload
                buttons and the security warning on screen made a solved
                problem look unsolved. Removing brings the capture UI back. */}
            {!login.totp_secret_id && (
              <>
                {/* Storing the seed alongside the password means this account
                    is effectively single-factor for automation. That is the
                    point, but the operator should make the call knowingly
                    rather than discover it in a post-incident review. Shown
                    only here — it's a decision prompt, not a standing notice. */}
                <p className="text-[10px] text-amber-600 dark:text-amber-500 leading-snug pb-1">
                  Storing the secret lets this login run unattended, but the second factor no longer
                  protects this account. Prefer a service account over a personal one.
                </p>

                {/* The field accepts a pasted or dropped QR IMAGE as well as
                    text. Screenshot-and-paste is the fastest path in practice:
                    the operator is already on the 2FA setup page, on the same
                    screen, so pointing a webcam at their own monitor is the
                    worse route. Camera is there for a QR on another device. */}
                <div
                  className={cn('flex items-center gap-2', CONTROL_W)}
                  onDrop={(ev) => {
                    const img = imageFromTransfer(ev.dataTransfer);
                    if (!img) return;          // let a text drop behave normally
                    ev.preventDefault();
                    void handleQrImage(img);
                  }}
                  onDragOver={(ev) => {
                    if (imageFromTransfer(ev.dataTransfer)) ev.preventDefault();
                  }}
                >
                  <Input
                    type="password"
                    placeholder="Setup key, otpauth:// URI, or paste a QR screenshot"
                    value={totpInput}
                    onChange={(ev) => setTotpInput(ev.target.value)}
                    className="flex-1 min-w-0 font-mono text-xs"
                    autoComplete="off"
                    spellCheck={false}
                    onPaste={(ev) => {
                      // An image on the clipboard is a QR screenshot; plain
                      // text falls through to normal paste-the-key behaviour.
                      const img = imageFromTransfer(ev.clipboardData);
                      if (!img) return;
                      ev.preventDefault();
                      void handleQrImage(img);
                    }}
                    onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void handleSaveTotp(); } }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveTotp}
                    disabled={savingTotp || decodingQr || !totpInput.trim()}
                    className="shrink-0"
                  >
                    {savingTotp ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                    Enroll
                  </Button>
                </div>

                {/* QR capture row. Hidden file input rather than a visible one
                    so the two affordances read as equals. */}
                <div className="flex items-center gap-2 flex-wrap">
                  {canUseCamera && (
                    <Button
                      type="button" variant="outline" size="sm" className="text-xs"
                      onClick={() => setScannerOpen(true)}
                      disabled={savingTotp || decodingQr}
                    >
                      <Camera className="h-3.5 w-3.5 mr-1" /> Scan with camera
                    </Button>
                  )}
                  <Button
                    type="button" variant="outline" size="sm" className="text-xs"
                    onClick={() => totpFileInputRef.current?.click()}
                    disabled={savingTotp || decodingQr}
                  >
                    {decodingQr
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <ImageIcon className="h-3.5 w-3.5 mr-1" />}
                    {decodingQr ? 'Reading QR…' : 'Upload QR image'}
                  </Button>
                  <input
                    ref={totpFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      // Reset first so picking the SAME file twice re-fires.
                      ev.target.value = '';
                      if (file) void handleQrImage(file);
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    …or paste / drop a screenshot of the QR into the field above.
                  </span>
                </div>
              </>
            )}

            {/* Enrolled: variable name + a masked liveness check. Nothing to
                configure, so nothing to configure is shown. */}
            {login.totp_secret_id && (
              <div className={cn('rounded-md border bg-muted/40 px-3 py-2 space-y-1.5', CONTROL_W)}>
                {/* Lead with the VARIABLE NAME, mirroring how credentials
                    show their key and how the script editor renders
                    variables. The code below is proof the secret is right;
                    this line is what you actually type into a script. */}
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-purple-500 dark:text-purple-400">
                    {'{{_mfa}}'}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText('{{_mfa}}')
                        .then(() => toast.success('Copied {{_mfa}}'))
                        .catch(() => toast.error('Could not copy'));
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy the variable name"
                  >
                    Copy
                  </button>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Use in the login script&apos;s 2FA step
                  </span>
                </div>

                <div className="flex items-center gap-3 border-t pt-1.5">
                  {totpPreview ? (
                    <>
                      {/* Masked to the last 3 digits, and masked on the SERVER
                          — the full code never reaches this browser. Enough to
                          confirm the secret is right, not enough to sign in
                          with. The code is for the script, not for a human. */}
                      <code className="font-mono text-lg tracking-[0.25em] tabular-nums">
                        <span className="text-muted-foreground/50" aria-hidden="true">
                          {'•'.repeat(Math.max(0, (totpPreview.digits || 6) - totpPreview.code_suffix.length))}
                        </span>
                        <span>{totpPreview.code_suffix}</span>
                        <span className="sr-only">
                          Code ending in {totpPreview.code_suffix.split('').join(' ')}
                        </span>
                      </code>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="tabular-nums">{totpPreview.seconds_remaining}s</span>
                        {/* Countdown bar — cheap visual that the code is live
                            rather than a stale render. */}
                        <span className="h-1 w-16 rounded-full bg-muted-foreground/20 overflow-hidden">
                          <span
                            className="block h-full bg-brand transition-[width] duration-1000 ease-linear"
                            style={{ width: `${Math.max(0, Math.min(100, (totpPreview.seconds_remaining / (totpPreview.period || 30)) * 100))}%` }}
                          />
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-auto text-right">
                        Last 3 match your app
                        {totpPreview.account ? <> for <span className="font-mono">{totpPreview.account}</span></> : null}
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {totpPreviewLoading
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking…</>
                        : <>
                            <AlertCircle className="h-3 w-3 text-destructive" />
                            Bad stored secret — re-enroll.
                          </>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Field>
          </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="access" className="space-y-3 mt-0">

      {/* Access groups */}
      <Card>
        <CardContent className="py-3 px-5">
          <Field
            label="Access groups"
            info="Who gets notified and who can complete this login when an agent pauses for a human. Shared across every agent that uses this login profile."
          >
          <div className={cn('space-y-2', CONTROL_W)}>
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
          </div>
          </Field>
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

        </TabsContent>

        <TabsContent value="runs" className="space-y-3 mt-0">

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

        </TabsContent>
      </Tabs>

      {/* Browser HITL dialog */}
      {activeSession && (
        <BrowserHITLDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          runId={activeSession.logId}
          agentName={activeSession.label}
          mode={activeSession.mode}
          // Drives "Awaiting Login" vs "Awaiting Logout" copy in the
          // dialog's pill and banner. Matches the list-page mapping —
          // 'login_logout' is the only kind that flips this to logout
          // wording; login_verify and login_manual both stay 'login'.
          purpose={activeSession.kind === 'login_logout' ? 'logout' : 'login'}
          // After Done on a manual login, the backend kicks off an
          // independent verify run. Swap the activeSession to track THAT
          // run's id so the existing polling effect drives the
          // "Verifying..." pill back to a settled state ('valid' or
          // 'needs_login') when it completes. Without this, the post-Done
          // verify was invisible to the UI and the spinner stayed stuck.
          onVerifyStarted={(verifyRunId) => {
            setActiveVerifySession({
              entityId: id,
              kind: 'login_verify',
              logId: verifyRunId,
              label: `Verifying: ${login?.name}`,
              mode: 'observe',
            });
          }}
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
        // Stamp it as a login script so it appears in this login's picker.
        // Without this it would save as 'regular' and be invisible here.
        recordKind="login"
        ownerLoginId={id}
        onSaved={async () => {
          // Re-fetch scripts; pick the newest one (it was just created)
          // and auto-select it for this login. The operator can confirm
          // the selection and hit the main Save button to persist the
          // linkage to the login profile.
          if (!selectedOrgId) return;
          try {
            // Same 'login' pool the picker draws from — refetching unfiltered
            // here would repopulate it with every script in the org.
            const data = await listScripts(selectedOrgId, { kinds: ['login'] });
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

      {/* Replace-and-delete for the verify script.
          A login must always have a verify script (verify_script_id is NOT
          NULL, FK ON DELETE RESTRICT), so "delete" here really means
          "swap, then delete". Confirm stays disabled until a replacement is
          chosen — there is no valid state where the old one simply goes. */}
      <Dialog
        open={!!verifyToDelete}
        onOpenChange={(v) => { if (!v) { setVerifyToDelete(null); setVerifyReplacementId(null); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Replace &ldquo;{verifyToDelete?.name}&rdquo;?</DialogTitle>
            <DialogDescription className="text-xs">
              Every login needs a verify script, so pick the one that takes over. The old script is
              then deleted permanently.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const alternatives = verifyScripts.filter((sc) => sc.id !== verifyToDelete?.id);
            if (alternatives.length === 0) {
              return (
                <div className="space-y-2">
                  <p className="text-[11px] text-amber-600 dark:text-amber-500 leading-snug">
                    There&apos;s no other verify script to switch to. Record one first, then delete this.
                  </p>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => { setVerifyToDelete(null); setRecordVerifyModalOpen(true); }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> Record verify script
                  </Button>
                </div>
              );
            }
            return (
              <div className="space-y-1.5">
                <Label className="text-xs">Use this one instead</Label>
                <Select
                  value={verifyReplacementId ?? '__none__'}
                  onValueChange={(v) => setVerifyReplacementId(v === '__none__' ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select a replacement…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>Select a replacement…</SelectItem>
                    {alternatives.map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>{sc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          <DialogFooter>
            <Button
              type="button" variant="outline" size="sm"
              onClick={() => { setVerifyToDelete(null); setVerifyReplacementId(null); }}
            >
              Cancel
            </Button>
            <Button
              type="button" size="sm" variant="destructive"
              onClick={handleReplaceAndDeleteVerify}
              disabled={!verifyReplacementId}
              title={!verifyReplacementId ? 'Choose a replacement first' : undefined}
            >
              Replace and delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera QR scan. Closes itself on a hit; the decoded otpauth:// URI
          goes straight to enrollment without touching the text field. */}
      <QrScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(text) => {
          setScannerOpen(false);
          void enrollFromQrText(text);
        }}
      />

      {/* Record a VERIFY script. Separate instance from the login recorder
          purely so recordKind differs — without it the new script saves as
          'regular' and never appears in the verify picker. */}
      <RunScriptModal
        script={null}
        orgId={selectedOrgId}
        open={recordVerifyModalOpen}
        onClose={() => setRecordVerifyModalOpen(false)}
        mode="record"
        recordKind="login_verify"
        ownerLoginId={id}
        onSaved={async () => {
          if (!selectedOrgId) return;
          try {
            const data = await listScripts(selectedOrgId, { kinds: ['login_verify'] });
            const all = data.scripts ?? [];
            setVerifyScripts(all);
            const newest = [...all].sort((a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            if (newest) {
              setForm((f) => ({ ...f, verify_script_id: newest.id }));
              toast.success(`Recorded "${newest.name}" — click Save to link it to this login`);
            }
          } catch {
            toast.error('Recording saved, but failed to refresh the verify script list');
          }
        }}
      />

      {/* Edit an existing login script. Same modal as the Scripts page —
          this login page is simply the entry point, since login scripts no
          longer appear in the general list. */}
      <RunScriptModal
        script={editScript}
        orgId={selectedOrgId}
        open={!!editScript}
        onClose={() => setEditScript(null)}
        mode="test"
        // This editor was opened from THIS login, so {{_mfa}} can resolve
        // even before the link has been saved on the page.
        ownerLoginId={id}
        onSaved={async () => {
          if (!selectedOrgId) return;
          // Refresh so the picker reflects a renamed script.
          try {
            const data = await listScripts(selectedOrgId, { kinds: ['login'] });
            setScripts(data.scripts ?? []);
          } catch {
            /* non-fatal — the link is unchanged, only the cached name */
          }
        }}
      />
    </div>
    </TooltipProvider>
  );
}
