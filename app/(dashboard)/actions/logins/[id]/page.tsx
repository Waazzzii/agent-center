'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getLogin, listLogins, updateLogin, deleteLogin, startLogout, setPoolSize, setPoolCredentialMode, previewPoolCredentialMode,
  setLoginCredentials, clearLoginCredentials, testAutoLogin,
  getLoginCredentialKeys, deleteLoginCredentialKey,
  setLoginTotp, clearLoginTotp, previewLoginTotp,
  type Login, type TotpPreview,
} from '@/lib/api/logins';
import { isReservedParam } from '@/lib/script-params';
import { getBrowserRunStatus } from '@/lib/api/agents';
import { listScripts, type BrowserScript } from '@/lib/api/scripts';
import {
  getAgentAccessGroups,
  getLoginAccessGroups,
  setLoginAccessGroups,
  type AgentAccessGroup,
} from '@/lib/api/agent-access-groups';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import {
  getActiveVerifySession,
  setActiveVerifySession,
  clearActiveVerifySession,
  subscribeActiveVerifySessions,
  type ActiveVerifySession,
} from '@/lib/hooks/use-active-verify-sessions';
import { useStartManualLogin } from '@/lib/hooks/use-start-manual-login';
import { PoolStepper, PoolSizeControl, poolParentOf, poolOf } from '@/components/logins/PoolSelector';
import { ProxyCard } from '@/components/logins/ProxyCard';
import { Checkbox } from '@/components/ui/checkbox';
import { InfoBubble } from '@/components/actions/login-fields';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsPanel, TabsCount } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MultiSelectTags } from '@/components/ui/multi-select-tags';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Loader2, LogIn, LogOut, Save, Trash2,
  CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Globe, Users,
  Sparkles, X as XIcon, Eye, EyeOff, KeyRound, Pencil,
  Settings2, Camera, Lock, Image as ImageIcon,
} from 'lucide-react';
import { decodeQrFromFile, imageFromTransfer, cameraSupported } from '@/lib/qr-decode';
import { QrScannerDialog } from '@/components/actions/QrScannerDialog';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
// LoginFormBody is no longer rendered here — the name moved into the page
// header and the URL into a disclosure under Login. The type is still the
// shape of this page's form state, and the component itself is still used by
// the create page and LoginChip.
import { type LoginFormData } from '@/components/actions/LoginFormBody';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';
import { SlackChannelInput } from '@/components/notifications/SlackChannelInput';
import { cn } from '@/lib/utils';
import {
  Field, FieldNest, ScriptSlot, CONTROL_W,
} from '@/components/actions/login-fields';
import { MfaSourceSection } from '@/components/actions/MfaSourceSection';

const TERMINAL = new Set(['completed', 'failed', 'aborted']);

function StatusPill({ status }: { status: Login['status'] }) {
  if (status === 'valid') return <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Logged In</Badge>;
  if (status === 'needs_login') return <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" />Not Logged In</Badge>;
  // 'verifying' is gone. It described the gap between a manual-login Done
  // click and a background verify settling the result — and that verify was
  // removed: Done marks the login valid in the same request. No row in dev or
  // prod carries the status, and nothing can write it any more.
  // Spinner + "Verifying..." makes it visually obvious that we're
  // mid-check, so operators don't read it as a settled outcome.
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
 * The login script slot — picker, edit, and record.
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

/**
 * Body padding for every card inside the Setup and Access tabs.
 *
 * One value, because the tabs used three: the two Setup cards did not match
 * each other (py-3 vs p-5) and Access matched neither, so switching tabs made
 * the content jump and Access read as cramped next to the roomy credentials
 * card. A constant rather than a convention because the convention is what
 * drifted.
 */
/** The API's own error message off an axios rejection, without reaching for `any`. */
function apiError(err: unknown): string | undefined {
  return (err as { response?: { data?: { error?: string } } } | null)?.response?.data?.error;
}

const TAB_CARD_BODY = 'p-5 space-y-4';

/**
 * A card that sits INSIDE the tab panel.
 *
 * The panel is the tab's own surface (bg-card, the same colour the active tab
 * is cut from), so a stock Card — also bg-card — vanished into it, leaving only
 * a border. The tint is the app's in-panel shade (the one ConfigRow uses), so
 * it reads as a section of the tab in both themes: recessed on light, raised on
 * dark.
 *
 * py-0 because Card's own py-6 stacked on top of the body padding: the
 * constant above should be the one place a card's padding is decided.
 */
const TAB_CARD = 'bg-muted/40 shadow-none py-0';

/**
 * What this page last showed, kept across remounts.
 *
 * Stepping to another browser navigates to another [id], and Next mounts a
 * fresh page for it. Starting that page empty put a full-page spinner in place
 * of everything for the length of seven requests, so the whole page vanished
 * and came back on every step — for a view that differs only in the one
 * browser's status and credentials.
 *
 * Seeded from here, the next browser renders at once from the pool the page
 * already had, and the fetch refreshes it quietly behind. Only seeded within
 * the SAME pool: arriving at an unrelated login from the list must not flash
 * the previous login's groups and scripts.
 */
type PageSnapshot = {
  orgId: string;
  poolId: string;
  allLogins: Login[];
  groups: AgentAccessGroup[];
  loginGroupIds: string[];
  scripts: BrowserScript[];
  /** Credential names on file, by browser — fetched for the whole pool. */
  credKeys: Record<string, string[]>;
};
let lastSnapshot: PageSnapshot | null = null;

function seedFor(orgId: string | null | undefined, id: string) {
  const s = lastSnapshot;
  if (!s || !orgId || s.orgId !== orgId) return null;
  const login = s.allLogins.find((l) => l.id === id);
  if (!login || poolParentOf(login, s.allLogins).id !== s.poolId) return null;
  return { ...s, login };
}

/**
 * The read-only view of a browser that borrows Browser 1's credentials.
 *
 * In a shared pool every browser points at Browser 1's secret rows, so on
 * Browser 2..N the credentials and 2FA are shown but cannot be edited here.
 * That used to be a line of text inserted above the cards plus a disabled
 * attribute on each field. The line pushed everything down whenever it
 * appeared (stepping from Browser 1 to 2), and a page of individually greyed
 * fields read as half-broken rather than deliberately locked.
 *
 * Now the whole block dims as one — no brightness, no colour, no pointer, and
 * `inert` so nothing inside can be focused or tabbed to — and the explanation
 * floats OVER it. Nothing is added to the flow, so nothing moves.
 */
function SharedCredentialsMask({
  locked, editHref, children,
}: {
  locked: boolean;
  editHref: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div
        inert={locked}
        className={cn(
          'space-y-3 transition-[opacity,filter] duration-200',
          locked && 'pointer-events-none select-none opacity-40 grayscale',
        )}
      >
        {children}
      </div>
      {locked && (
        // Spans the block so the notice can stay in view (sticky) while the
        // dimmed cards scroll beneath it. mt-32 sets it over the credential
        // rows — the part that is actually locked — rather than over the card
        // title and login script, which stay readable above it.
        <div className="pointer-events-none absolute inset-0 z-10 flex justify-center">
          <div className="pointer-events-auto sticky top-24 mt-32 flex h-fit max-w-md items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-snug text-muted-foreground">
              <span className="block text-sm font-medium text-foreground">Read-only on this browser</span>
              Every browser in this pool signs in with Browser 1&apos;s credentials and two-factor.
            </p>
            {editHref && (
              <Button asChild size="sm" variant="outline" className="shrink-0 text-xs">
                <Link href={editHref}>Edit on Browser 1</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditLoginPage() {
  const { id } = useParams() as { id: string };
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  // Read once, at mount — see PageSnapshot.
  const [seed] = useState(() => seedFor(selectedOrgId, id));

  const [login, setLogin] = useState<Login | null>(seed?.login ?? null);
  // Every login in the org, so the pool panel can find this one's siblings.
  // Members are ordinary rows linked by pool_parent_id; there is no
  // "get the pool" endpoint and one list call is cheaper than adding one.
  const [allLogins, setAllLogins] = useState<Login[]>(seed?.allLogins ?? []);
  // The login this page represents to the operator. On Browser 2's page it is
  // still the pool's parent — name, script, Slack override and access groups
  // all live there, because to the operator it is one login with N browsers.
  const poolParent = login ? poolParentOf(login, allLogins) : null;
  const loginLevelId = poolParent?.id ?? id;
  const pooled = !!login && poolOf(login, allLogins).length > 1;
  const sharedCreds = poolParent?.pool_shared_credentials ?? true;
  // Read-only here, editable on Browser 1. In a shared pool every browser
  // points at ONE secret row, so an edit from Browser 2 would rewrite it for
  // all of them — the backend refuses that with a 409 (see assertOwnsCredentials),
  // and this makes the page say so up front instead of failing on Save.
  const identityLocked = pooled && sharedCreds && !!login?.pool_parent_id;
  // The full-page spinner is for a page with NOTHING to show yet. Once a
  // login is on screen a reload — a mode change, a save, stepping to another
  // browser — refreshes it in place instead of blanking it.
  const [loading, setLoading] = useState(!seed);
  const hasShown = useRef(!!seed);
  const [saving, setSaving] = useState(false);
  const [allGroups, setAllGroups] = useState<AgentAccessGroup[]>(seed?.groups ?? []);
  const [loginGroupIds, setLoginGroupIds] = useState<string[]>(seed?.loginGroupIds ?? []);

  const [form, setForm] = useState<LoginFormData>({
    name: seed ? poolParentOf(seed.login, seed.allLogins).name : '',
  });

  // Login session state. `startingAction` tracks WHICH button was just
  // clicked so we only spin the one that's actually starting up — a single
  // `isStarting` boolean would spin every button in the row. All buttons
  // remain disabled while any action is in flight to prevent the operator
  // from kicking off two browser-slot sessions at once.
  type StartingAction = 'login' | 'logout' | 'clear_session' | null;
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
  // `scripts` = the 'login' pool (auto-login slot). There is no second slot:
  // the verify script is gone, and proving the session is a step of the
  // business script now ("Proves we are signed in", in the script editor).
  const [scripts, setScripts] = useState<BrowserScript[]>(seed?.scripts ?? []);
  const [scriptId, setScriptId] = useState<string | null>(seed?.login.auto_login_script_id ?? null);
  // Credential KEYS are no longer typed by hand — they're the login script's
  // declared inputs. `storedCredKeys` is what's actually on file (names only,
  // never values) so each row can show Set / Not set. `credDrafts` holds
  // values the operator has typed but not yet submitted.
  const [storedCredKeys, setStoredCredKeys] = useState<string[]>(seed?.credKeys[id] ?? []);
  const [credDrafts, setCredDrafts] = useState<Record<string, string>>({});
  const [revealedCred, setRevealedCred] = useState<Record<string, boolean>>({});
  const [savingCreds, setSavingCreds] = useState(false);
  // Login scripts are no longer listed on the general Scripts page — this
  // login IS their home, so the page has to be able to open one for editing.
  // '2fa' is gone — two-factor lives inside Setup now.
  // The tab lives in the URL (?tab=credentials). That tab holds the Log In button,
  // so a "needs login" link from Slack has to be able to land on it, and
  // stepping between browsers has to keep you there rather than dropping you
  // back on Setup at every step.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  // 'pool' is the tab's old name. Slack messages already sent link to it, so
  // it stays an alias for good.
  const credsParam = tabParam === 'credentials' || tabParam === 'pool';
  const [tab, setTab] = useState<'setup' | 'credentials'>(credsParam ? 'credentials' : 'setup');
  const tabChosen = useRef(credsParam || tabParam === 'setup');
  const changeTab = (v: 'setup' | 'credentials') => {
    tabChosen.current = true;
    setTab(v);
    router.replace(`/actions/logins/${id}?tab=${v}`, { scroll: false });
  };
  // Nothing asked for, and this login needs signing in: open where Log In is,
  // not on Setup with the button one tab away.
  useEffect(() => {
    if (!tabChosen.current && login?.status === 'needs_login') {
      tabChosen.current = true;
      setTab('credentials');
    }
  }, [login?.status]);
  const [editingName, setEditingName] = useState(false);

  // ── TOTP (authenticator 2FA) state ───────────────────────────────
  // Same write-only model as credentials: the seed goes up once and is
  // never echoed back. `totpPreview` holds a CURRENT code fetched from the
  // server (never the seed) so the operator can compare it against their
  // phone and know immediately that enrollment worked — otherwise the
  // first signal of a mistyped key is a failed agent run hours later.
  const [totpInput, setTotpInput] = useState('');
  /**
   * The 2FA source currently SELECTED in MfaSourceSection, saved or not.
   *
   * The enrolment form below is gated on this rather than on login.mfa_source.
   * Gating on the persisted value meant picking "Authenticator" showed nothing
   * until the source had been saved — a round trip nobody knew to make, which
   * read as a missing form. Seeded from the login so the first render is right.
   */
  const [selectedMfaSource, setSelectedMfaSource] = useState<Login['mfa_source'] | null>(null);
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
  const [slackChannelId, setSlackChannelId] = useState<string>(seed?.login.notification_slack_channel_id ?? '');

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
          if (selectedOrgId) { load(true); }
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
            if (selectedOrgId) { load(true); }
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
    if (!silent && !hasShown.current) setLoading(true);
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
        //
        // Compared by VALUE, not by a hand-picked list of fields. The list this
        // replaced (status, name, url and five more) went stale every time a
        // column was added: proxy_enabled, proxy_ip_id, pool_shared_credentials
        // and every MFA field were missing, so a save that changed only those
        // left the page showing the old value until a hard refresh.
        //
        // The pool is refreshed too. The stepper shows every browser's status,
        // and the silent path used to leave the siblings as they were at first
        // load — Browser 2 signing in behind you never showed.
        const [loginData, everyLogin] = await Promise.all([
          getLogin(selectedOrgId, id),
          listLogins(selectedOrgId).catch(() => null),
        ]);
        const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        setLogin((prev) => (prev && same(prev, loginData) ? prev : loginData));
        if (everyLogin) setAllLogins((prev) => (same(prev, everyLogin) ? prev : everyLogin));
        return;
      }
      // The auto-login picker offers only 'login' scripts (migration 283),
      // so the kind filter is the server's definition rather than a
      // client-side guess.
      const [loginData, groups, loginGroups, loginScriptsData, credKeys, everyLogin] = await Promise.all([
        getLogin(selectedOrgId, id),
        getAgentAccessGroups(selectedOrgId),
        getLoginAccessGroups(selectedOrgId, id),
        listScripts(selectedOrgId, { kinds: ['login'] }).catch(() => ({ scripts: [] as BrowserScript[] })),
        getLoginCredentialKeys(selectedOrgId, id).catch(() => [] as string[]),
        // Non-fatal: the pool panel simply does not render without it.
        listLogins(selectedOrgId).catch(() => [] as Login[]),
      ]);
      setLogin(loginData);
      setAllLogins(everyLogin);
      // The title is the LOGIN's name, never the browser's. Members are stored
      // as "<login> #2", "#3", but to the operator this is one login with N
      // browsers, so the header must not change as they step between them.
      setForm({ name: poolParentOf(loginData, everyLogin).name });
      setAllGroups(groups);
      setLoginGroupIds(loginGroups.map((g) => g.id));
      setScripts(loginScriptsData.scripts ?? []);
      setStoredCredKeys(credKeys);
      setScriptId(loginData.auto_login_script_id ?? null);
      setSlackChannelId(loginData.notification_slack_channel_id ?? '');
      // Reset the credential drafts on initial / explicit reload — we never
      // display existing values (encrypted), so every field starts blank.
      // SSE-driven silent refreshes skip this so half-typed entries aren't
      // wiped mid-edit.
      setCredDrafts({});
      setRevealedCred({});
      hasShown.current = true;

      // Remember it for the next browser's page, and fetch every sibling's
      // credential names now, so stepping to one does not flash "Not set" on
      // credentials it has. A pool is at most ten small requests.
      const poolId = poolParentOf(loginData, everyLogin).id;
      const prevKeys = lastSnapshot?.poolId === poolId ? lastSnapshot.credKeys : {};
      const snap: PageSnapshot = {
        orgId: selectedOrgId,
        poolId,
        allLogins: everyLogin,
        groups,
        loginGroupIds: loginGroups.map((g) => g.id),
        scripts: loginScriptsData.scripts ?? [],
        credKeys: { ...prevKeys, [id]: credKeys },
      };
      lastSnapshot = snap;
      for (const m of poolOf(loginData, everyLogin)) {
        if (m.id === id) continue;
        getLoginCredentialKeys(selectedOrgId, m.id)
          .then((keys) => { snap.credKeys[m.id] = keys; })
          .catch(() => { /* the page fetches its own on arrival anyway */ });
      }
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
  // and the reference-stable setLogin update means a
  // refetch with unchanged data re-renders nothing.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionTopics = useMemo(
    () => (selectedOrgId
      ? [`login:${id}`, ...(activeSession ? [`run:${activeSession.logId}`] : [])]
      : []),
    [selectedOrgId, id, activeSession?.logId]
  );
  // Poll only when there is something that can change.
  //
  // This used to run every 5s for the whole time the page was open, including
  // while somebody sat on the Setup tab editing a name. Three things publish to
  // `login:<id>`: the auto-login test's phase events, login-run create/update
  // (manual login, logout, test), and markLoginChecked/markLoginLoggedIn. The
  // first two only happen because the operator started them here — and both set
  // activeSession. So with no session and the Runs tab closed, the only reachable
  // event is another agent run flipping this login's status, which nothing on
  // the Setup form is showing.
  //
  // What that costs: the status badge can sit stale while you edit if an agent
  // signs in behind you. It refreshes the moment you open Runs, start anything,
  // or reload — and it was never the reason this page was open.
  const watchable = !!activeSession;
  useTopicVersions({
    topics: versionTopics,
    enabled: !!selectedOrgId && watchable,
    onChange: () => {
      // Debounce so a burst of near-simultaneous changes (login_run
      // completed + login status flip) coalesces into a single fetch.
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => { load(true); }, 300);
    },
  });



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
      // Name, login script and the Slack override belong to the LOGIN, so they
      // go to the pool parent even from Browser 2's page. Writing them to the
      // member would rename just that browser — and the pool trigger rejects a
      // script change on a member outright, since every browser in a pool has
      // to sign in the same way.
      await updateLogin(selectedOrgId, loginLevelId, {
        name: form.name.trim(),

        ...(scriptChanged ? { auto_login_script_id: scriptId } : {}),
        ...(slackChanged ? { notification_slack_channel_id: normalizedSlack } : {}),
      });
      await setLoginAccessGroups(selectedOrgId, loginLevelId, loginGroupIds).catch(() => {});
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

  /**
   * The keys this login must supply: what the script DECLARES, plus what its
   * steps actually reference.
   *
   * It used to read `parameters` alone, and `parameters` can be empty on a
   * script whose steps are full of {{vars}} — it is derived at save time, and a
   * script saved by a path that skipped that derivation carries an empty one
   * forever. Four login scripts in dev are in exactly that state, referencing
   * {{email}}, {{password}}, {{login}} and so on while declaring nothing.
   *
   * The cost was invisible: no rows rendered, so the page said the script
   * "declares no {{variables}} yet" and offered nowhere to put the password.
   * The credentials were simply unenterable, and the sign-in filled blanks and
   * failed as a wrong password. It stayed hidden only because these logins had
   * their credentials stored before the rows disappeared — duplicating one is
   * what made it visible, since the copy has none.
   *
   * Scanning the steps is what the {{_mfa}} check above already does, and for
   * the same reason: the step text is the only place that cannot drift from
   * what will actually run.
   */
  const requiredCredKeys = useMemo(() => {
    const declared = Object.keys(linkedLoginScript?.parameters ?? {});
    let referenced: string[] = [];
    try {
      const text = JSON.stringify(linkedLoginScript?.steps ?? []);
      referenced = [...(text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? [])]
        .map((m) => m.replace(/[{}\s]/g, ''));
    } catch { /* unserialisable steps — fall back to what is declared */ }
    // Underscore prefix, not just the RESERVED_PARAMS table: `_totp` is the
    // pre-303 spelling of `_mfa` and still appears in un-migrated scripts, and
    // offering it as a credential field would invite someone to paste a seed
    // into a box that stores it beside the password.
    return [...new Set([...declared, ...referenced])]
      .filter((k) => !k.startsWith('_') && !isReservedParam(k));
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


  // On Browser 2..N this removes THAT BROWSER (the pool gets one smaller);
  // on Browser 1 it deletes the login and every browser in its pool.
  const browserPosition = login && pooled
    ? poolOf(login, allLogins).findIndex((m) => m.id === login.id) + 1
    : 1;
  const removesBrowser = !!login?.pool_parent_id;

  const handleDelete = async () => {
    if (!selectedOrgId || !id) return;
    const poolSize = login ? poolOf(login, allLogins).length : 1;
    const ok = await confirm(removesBrowser
      ? {
          title: `Remove Browser ${browserPosition}?`,
          description:
            'It is removed from the pool with its saved sign-in, and the pool size drops by one. '
            + 'If a run is using it, that run finishes first. Credentials Browser 1 still uses are kept.',
          confirmText: 'Remove browser',
          variant: 'destructive',
        }
      : {
          title: 'Delete login?',
          description:
            `"${form.name || login?.name}"${poolSize > 1 ? ` and all ${poolSize} of its browsers` : ''} will be removed. `
            + 'Any agent actions referencing it will break.',
          confirmText: 'Delete',
          variant: 'destructive',
        });
    if (!ok) return;
    try {
      await deleteLogin(selectedOrgId, id);
      if (removesBrowser && poolParent) {
        toast.success(`Browser ${browserPosition} removed`);
        router.push(`/actions/logins/${poolParent.id}?tab=credentials`);
      } else {
        toast.success('Deleted');
        router.push('/actions/logins');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
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
   * One set of credentials for the whole pool, or one per browser.
   *
   * Browser 1's credentials are never touched in either direction, so
   * unchecking and rechecking is always a clean round trip.
   *
   * Going SEPARATE loses nothing — each browser gets its own copy of Browser
   * 1's — so it gets a light confirm. Going SHARED deletes each browser's own
   * credentials, but that only loses anything if they DIFFER from Browser 1's.
   * The backend checks (the page never sees secret values): when nothing
   * differs — undoing an accidental uncheck, say — it just applies, because a
   * "this can't be undone" warning there would be false and would land on
   * exactly the person trying to undo a mistake.
   */
  const handleCredentialMode = async (shared: boolean) => {
    if (!selectedOrgId || !id) return;
    let ok = true;
    if (shared) {
      const { wouldDiscard } = await previewPoolCredentialMode(selectedOrgId, id)
        .catch(() => ({ wouldDiscard: -1 }));       // unknown → assume the worst
      if (wouldDiscard !== 0) {
        const n = wouldDiscard > 0 ? wouldDiscard : null;
        ok = await confirm({
          title: 'Use the same credentials for every browser?',
          description:
            (n
              ? `${n} browser${n === 1 ? ' has' : 's have'} credentials of ${n === 1 ? 'its' : 'their'} own, `
                + "different from Browser 1's. They will be deleted"
              : "Every browser's own credentials and authenticator setup will be deleted")
            + ", and all browsers will sign in with Browser 1's. This can't be undone — you would "
            + 'have to enter them again.',
          confirmText: "Use Browser 1's for all",
          variant: 'destructive',
        });
      }
    } else {
      ok = await confirm({
        title: 'Give each browser its own credentials?',
        description:
          "Each browser starts with a copy of Browser 1's, so nothing stops working. Then change each "
          + 'one to its own account. Browsers added later start blank and need theirs entered. '
          + "Browser 1's credentials stay as they are, so re-checking this later loses nothing.",
        confirmText: 'Separate credentials',
      });
    }
    if (!ok) return;
    try {
      await setPoolCredentialMode(selectedOrgId, id, shared);
      await load();
      toast.success(shared
        ? 'Every browser now uses the same credentials'
        : 'Each browser now has its own credentials');
    } catch (err) {
      toast.error(apiError(err) || 'Failed to change how this pool shares credentials');
    }
  };

  /**
   * Change how many browsers this login may use at once.
   *
   * Lowering it removes the highest-numbered browsers, so it asks first — their
   * saved sign-ins go with them. Nothing is interrupted: a browser in use
   * finishes its current run and is removed after.
   */
  const handlePoolSize = async (n: number) => {
    if (!selectedOrgId || !id || !login) return;
    const inService = poolOf(login, allLogins).filter((m) => !m.pool_removing_at).length;
    if (n < inService) {
      const going = Array.from({ length: inService - n }, (_, i) => n + i + 1);
      const names = going.length === 1 ? `Browser ${going[0]}` : `Browsers ${going.join(', ')}`;
      const ok = await confirm({
        title: `Lower the pool to ${n}?`,
        description:
          `${names} ${going.length === 1 ? 'is' : 'are'} removed, with ${going.length === 1 ? 'its' : 'their'} saved sign-in. `
          + 'A browser in use finishes its current run first. Credentials Browser 1 still uses are kept.',
        confirmText: `Remove ${going.length === 1 ? 'it' : 'them'}`,
        variant: 'destructive',
      });
      if (!ok) return;
    }
    try {
      const r = await setPoolSize(selectedOrgId, id, n);
      const list = (xs: number[]) => xs.map((x) => `Browser ${x}`).join(', ');
      const parts = [
        r.removed.length ? `${list(r.removed)} removed` : '',
        r.draining.length ? `${list(r.draining)} will be removed when its run finishes` : '',
        r.restored.length ? `${list(r.restored)} kept — its removal was cancelled` : '',
      ].filter(Boolean);
      toast.success(parts.length
        ? `Pool size ${n}. ${parts.join('. ')}.`
        : n === 1
          ? 'One browser — runs on this login now take turns'
          : `Up to ${n} browsers — added as concurrent runs need them`);
      // This page's browser may be the one that just went.
      const everyLogin = await listLogins(selectedOrgId);
      setAllLogins(everyLogin);
      if (!everyLogin.some((l) => l.id === id) && poolParent) {
        router.push(`/actions/logins/${poolParent.id}?tab=credentials`);
      } else {
        await load(true);
      }
    } catch (err) {
      toast.error(apiError(err) || 'Failed to update the number of browsers');
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

      // Watch it closely for a few seconds instead of waiting out the shared
      // completion poll.
      //
      // The work itself is fast — take the login queue, close Chrome for the
      // profile, delete the user-data-dir, flip the row to needs_login — and
      // the backend measures it in milliseconds once this run reaches the head
      // of the queue. Nearly all of the spinner people see is the gap until
      // the next 4s poll tick, i.e. the UI inventing a wait the system does
      // not have.
      //
      // It is still a real wait, not an assumption: a logout CAN sit behind an
      // agent run holding the same login, so this polls for the actual
      // terminal status rather than declaring success. If it is still going
      // after the budget, the shared poll takes over exactly as before.
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 400));
        const st = await getBrowserRunStatus(result.executionLogId).catch(() => null);
        if (!st) break;
        if (['completed', 'failed', 'aborted'].includes(st.status)) {
          clearActiveVerifySession(id);
          await load(true);
          if (st.status !== 'completed') {
            toast.error(st.error ? `Logout failed: ${st.error}` : 'Logout failed.');
          }
          break;
        }
      }
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
          <Button
            variant="outline" size="sm" onClick={handleDelete}
            disabled={!!login.pool_removing_at}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {removesBrowser ? 'Remove browser' : 'Delete'}
          </Button>
          {/* A login script is required, not optional.
              Nothing works without one: the agent path signs in by running it,
              and the manual path derives the URL to open from its first
              navigate step. A login with no script is a row that can only ever
              park a run for a human who then has nowhere to be sent. */}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !scriptId}
            title={!scriptId ? 'Choose a login script first — a login cannot sign in without one.' : undefined}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as typeof tab)}>
        {/* Two tabs, split by WHO a setting belongs to.

            Setup — the LOGIN: who can complete it, how many browsers it may
            use, whether they share one set of credentials, and whether it goes
            out through the proxy. Identical from every browser's page.

            Credentials — ONE BROWSER: which one you are on, its sign-in state and
            Log In, and its credentials, 2FA and (in a separate-credentials
            pool) its own proxy IP.

            To the operator this is one login with a pool of credentials, so
            the login-wide things are never repeated per browser. */}
        <TabsList>
          <TabsTrigger value="setup">
            <Settings2 className="h-3.5 w-3.5" /> Setup
          </TabsTrigger>
          <TabsTrigger value="credentials">
            <KeyRound className="h-3.5 w-3.5" /> Credentials
            {pooled && login && <TabsCount>{poolOf(login, allLogins).length}</TabsCount>}
          </TabsTrigger>
        </TabsList>

        {/* The body the active tab opens into — same surface and border, so
            the tab reads as the lid of this panel rather than a label floating
            above loose cards. Same pattern as the agent page. */}
        <TabsPanel className="p-4">
        <TabsContent value="setup" className="space-y-3 mt-0">

      {/* The pool, as the login sees it: how big, and one account or many. */}
      {login && (
        <Card className={TAB_CARD}>
          <CardContent className={TAB_CARD_BODY}>
            <PoolSizeControl
              maxBrowsers={poolParent?.max_browsers ?? 1}
              onChange={handlePoolSize}
            />
            {pooled && (
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                <label className="flex cursor-pointer items-center gap-3">
                  <Checkbox
                    checked={sharedCreds}
                    onCheckedChange={(v) => handleCredentialMode(v === true)}
                  />
                  <span>
                    <span className="block text-sm font-medium">Same credentials for every browser</span>
                    <span className="block text-xs text-muted-foreground">
                      {sharedCreds
                        ? 'One account for the whole pool. Browsers sign in one at a time.'
                        : 'Each browser signs in with its own account, in parallel.'}
                    </span>
                  </span>
                </label>
                <InfoBubble>
                  Shared: every browser uses Browser 1&apos;s credentials, authenticator and 2FA
                  settings, edited on Browser 1&apos;s Credentials tab. Separate: each browser has its own —
                  use this for sites that allow only one session per account. Switching to shared
                  deletes each browser&apos;s own credentials.
                </InfoBubble>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Whether the login goes out through the proxy, and — when the IP is the
          login's rather than each browser's — which IP. */}
      {login && selectedOrgId && (
        <ProxyCard
          mode="login"
          className={TAB_CARD}
          orgId={selectedOrgId}
          login={login}
          pooled={pooled}
          sharedCredentials={sharedCreds}
          onSaved={() => load(true)}
        />
      )}

      {/* Groups and channel in ONE card, because they are one decision.
          The channel is not general-purpose notification: it is resolved for
          exactly two events, notifyHitlPause ("this login needs a human") and
          notifyLoginAutoResolved ("it recovered, stand down"). Both are
          addressed to the same people the groups authorise, so splitting them
          across two cards asked the same question twice. */}
      <Card className={TAB_CARD}>
        <CardContent className={TAB_CARD_BODY}>
          <Field
            label="Who can complete this login"
            info="The groups allowed to finish a sign-in when an agent pauses for a human. Shared across every agent that uses this login profile."
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

          {/* Where those people are told.
              Blank DOES mean silent. There is no org-default channel — it was
              retired in migration 200 — so the cascade is: this field, then the
              run's program channel if it is a submissions run, then nothing.
              SlackChannelInput says so itself; this description only covers
              what the channel is used for. */}
          <div className="border-t pt-4">
            <SlackChannelInput
              scope="login"
              label="Slack alert when a person needs to sign in"
              purpose="If an agent can't sign in on its own — the login script fails, or the site asks for something only a person can give — it pauses and posts here asking someone to finish the sign-in. A follow-up is posted if the login recovers by itself before anyone does."
              value={slackChannelId}
              onChange={setSlackChannelId}
              description="Click Save at the top of the page to keep a change."
            />
          </div>
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="credentials" className="space-y-3 mt-0">

      {/* Which browser, then everything about it below — so it is explicit that
          the status, Log In and credentials that follow belong to THIS browser. */}
      {login && <PoolStepper login={login} all={allLogins} />}

      {/* Status + actions card */}
      <Card className={TAB_CARD}>
        <CardContent className="py-3 px-4">
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
              {login.pool_removing_at ? (
                // Taking no new runs or sign-ins; the backend refuses both.
                <span className="text-xs text-muted-foreground">
                  Being removed — finishes its current run, then goes
                </span>
              ) : needsLogin ? (
                // Spinner while the request to /startLogin is in flight —
                // brief, and before the dialog opens.
                <Button size="sm" onClick={handleLogin} disabled={isStarting || !!activeSession}
                  className="bg-warning hover:bg-warning/90 text-white text-xs">
                  {startingAction === 'login'
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <LogIn className="h-3 w-3" />}
                  <span className="ml-1">Log In</span>
                </Button>
              ) : (
                <>
                  {/* No Verify button, and nothing hidden behind one: there
                      is no verify to run. Whether the session works is
                      answered by the next script that uses it, at its
                      login_indicator step. */}
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

      <SharedCredentialsMask
        locked={identityLocked}
        editHref={poolParent ? `/actions/logins/${poolParent.id}?tab=credentials` : null}
      >
      {/* Login */}
      <Card className={TAB_CARD}>
        <CardContent className={TAB_CARD_BODY}>
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

          {/* Selection only. Recording, editing and deleting moved to the
              Login Scripts page — they are script operations, and doing them
              from here meant selecting a script just to delete it, which
              silently repointed this login on the way past. */}
          <ScriptSlot
            label="Login script"
            info={<>Fills the sign-in form and submits. Every <code className="font-mono">{'{{variable}}'}</code> it declares becomes a credential below, stored encrypted.</>}
            scripts={scripts}
            value={scriptId}
            onChange={setScriptId}
            manageHref="/actions/logins/scripts"
            manageLabel="Manage login scripts"
            emptyHint="No login scripts yet — record one to sign this login in."
            required
          />

          {/* Says why Save is disabled. A login lands here straight from the
              New Login dialog with nothing attached, so this is the first
              state most logins are in — leaving the button dead with no
              explanation reads as a broken page. */}
          {!scriptId && scripts.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-500 -mt-1">
              Choose a login script before saving — it is how this login signs in,
              and where a manual sign-in opens.
            </p>
          )}

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

      {/* Two-factor — was its own tab.
          It moved here because Setup had shrunk to a script picker and a
          credentials list, and because the split was misleading: a 2FA source
          is part of HOW this login signs in, which is the question this tab
          answers. It was separated when it owned three competing save buttons;
          it no longer does.

          Self-gating, so it costs nothing when unused: the source dropdown
          defaults to None, and the enrolment form for a source only renders
          once that source is chosen. A login with no second factor sees one
          dropdown. */}

      <Card className={TAB_CARD}>
        <CardContent className={TAB_CARD_BODY}>
          {/* Which source supplies {{_mfa}}. Above the enrolment UI because it
              decides whether that UI is relevant at all — an authenticator
              secret is meaningless on a login that reads its codes from Slack. */}
          <MfaSourceSection
            orgId={selectedOrgId}
            login={login}
            requiredByScript={mfaRequiredByScript}
            scriptName={linkedLoginScript?.name ?? null}
            onSaved={() => { void load(true); }}
            onSourceChange={setSelectedMfaSource}
          />

          {/* Authenticator enrolment — only for the totp source. A login with no
              second factor, or one reading codes from Slack, has nothing to
              enrol, and showing the seed capture anyway invited storing a
              secret that would never be used. */}
          {(selectedMfaSource ?? login.mfa_source ?? (login.totp_secret_id ? 'totp' : 'none')) === 'totp' && (
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
      </SharedCredentialsMask>

      {/* This browser's own proxy IP — separate-credentials pools only. Renders
          nothing otherwise: the IP is then the login's, and lives in Setup. */}
      {login && selectedOrgId && (
        <ProxyCard
          mode="browser"
          className={TAB_CARD}
          orgId={selectedOrgId}
          login={login}
          pooled={pooled}
          sharedCredentials={sharedCreds}
          onSaved={() => load(true)}
        />
      )}

        </TabsContent>
        </TabsPanel>
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
          // Drop the session and refetch the row immediately. The server has
          // already marked the login valid inside the Done request, so waiting
          // for the completion poll only kept "Watch" on screen and Log In
          // disabled for a few more seconds after the job was finished.
          onCompleted={() => { clearActiveVerifySession(id); void load(true); }}
        />
      )}

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


    </div>
    </TooltipProvider>
  );
}
