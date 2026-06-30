'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, ChevronRight, ChevronLeft, Play, AlertCircle, AlertTriangle, Loader2,
  CircleDot, X, XCircle, Save, RotateCcw, Trash2, Plus, Server, Clock, Hourglass, GripVertical, PanelRightClose, PanelRightOpen,
  Variable, MousePointer2, Link2, Clipboard, Pencil, Copy, LogIn, KeyRound, Zap, Square,
  Scissors, Sparkles, ShieldAlert, Wand2,
} from 'lucide-react';
import { useBrowserClientId } from '@/lib/hooks/use-browser-client-id';
import { useProvisioningPoll } from '@/lib/hooks/use-provisioning-poll';
import {
  getActiveBrowserSession,
  setActiveBrowserSession,
  clearActiveBrowserSession,
  type ActiveBrowserSession,
} from '@/lib/hooks/use-active-browser-session';
import {
  createScript,
  updateScript,
  startStepRun,
  getStepRun,
  executeStepRunStep,
  runRemainingStepsAgentMode,
  interruptStepRun,
  jumpStepRunToIndex,
  abortStepRun,
  startStepRunRecording,
  stopStepRunRecording,
  updateStepRunStep,
  deleteStepRunStep,
  syncStepRunSteps,
  captureStepRunWaitFor,
  cancelStepRunWaitForCapture,
  captureStepRunExtract,
  cancelStepRunExtractCapture,
  runLinkedLoginInStepRun,
  getScriptAgentUsage,
  propagateScriptLogin,
  refineScript,
  improveWalk,
  tidyScript,
  type BrowserScript,
  type RecordedStep,
  type RefineReport,
} from '@/lib/api/scripts';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { listLogins, type Login } from '@/lib/api/logins';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { VariablesPanel } from './panels/VariablesPanel';
import { StepEditModal } from './StepEditModal';
import { ProvisioningNotice } from '@/components/hitl/ProvisioningNotice';
import { AGENT_BACKEND_URL as agentApiUrl } from '@/lib/config';

interface RunScriptModalProps {
  script: BrowserScript | null;
  orgId: string | null;
  open: boolean;
  onClose: () => void;
  /** 'test' — step-run an existing script. 'record' — start a fresh recording. */
  mode?: 'test' | 'record';
  /** If set, the step-run will share this browser session's slot instead of allocating a new one. */
  sessionId?: string;
  /** Called when the test session ends so the caller can open the script in the editor. */
  onOpenScript?: (script: BrowserScript) => void;
  /** Called when a recording session is stopped, with the captured steps. */
  onRecordingStop?: (steps: RecordedStep[]) => void;
  /** Called after a script is successfully saved (record mode). */
  onSaved?: () => void;
}

/**
 * Display label for a step. Prefers the operator-supplied `step.name`
 * when set, otherwise falls back to the auto-generated description.
 * The auto label still gets returned by autoStepLabel — handy for
 * showing both ("Open contract form" with "Click: button.submit" as a
 * tooltip / subtitle).
 */
/**
 * Parse step numbers out of a free-text Improve instruction so "just step 7",
 * "fix steps 2 and 3", or "step 2-4" target only those steps. Only treats the
 * text as targeting when it mentions "step"/"steps"; pulls numbers + ranges
 * from the cluster right after that word (so "set quantity to 5" isn't grabbed).
 * Returns 0-based indices, clamped to [0, count). `raw` is whether a step was
 * mentioned at all (to distinguish "no targeting" from "out-of-range step").
 */
function parseStepTargets(text: string, count: number): { indices: number[]; mentioned: boolean } {
  if (!text || !/\bsteps?\b/i.test(text)) return { indices: [], mentioned: false };
  const nums = new Set<number>();
  const clusterRe = /\bsteps?\b\s*#?\s*(\d[\d\s,&#–-]*(?:(?:and|to|through)\s*#?\s*\d[\d\s,&#–-]*)*)/gi;
  let c: RegExpExecArray | null;
  while ((c = clusterRe.exec(text)) !== null) {
    const cluster = c[1];
    const rangeRe = /(\d+)\s*(?:-|–|to|through)\s*(\d+)/gi;
    let r: RegExpExecArray | null;
    while ((r = rangeRe.exec(cluster)) !== null) {
      const a = +r[1], b = +r[2];
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) nums.add(k);
    }
    const numRe = /\d+/g;
    let n: RegExpExecArray | null;
    while ((n = numRe.exec(cluster)) !== null) nums.add(+n[0]);
  }
  const indices = [...nums].map((n) => n - 1).filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
  return { indices, mentioned: true };
}

function autoStepLabel(step: RecordedStep): string {
  switch (step.action) {
    case 'navigate':   return `Navigate → ${step.url ?? ''}`;
    case 'click':      return `Click: ${step.text || step.selector || ''}`;
    case 'fill':       return `Fill: ${step.selector ?? ''} = ${step.value ?? ''}`;
    case 'select':     return `Select: ${step.value ?? ''} in ${step.selector ?? ''}`;
    case 'press_key':  return `Press: ${step.key ?? ''}`;
    case 'extract':    return step.selector === '__url__'
      ? `Extract URL ${step.url_extraction?.method === 'query_param' ? `?${step.url_extraction.param_name}` : step.url_extraction?.method === 'path_segment' ? `path[${step.url_extraction.path_index}]` : 'match'} → {{${step.field_name ?? '?'}}}${step._defaultValue ? ` = "${step._defaultValue}"` : ''}`
      : `Extract → {{${step.field_name ?? '?'}}}${step._defaultValue ? ` = "${step._defaultValue}"` : ''}`;
    case 'switch_tab': return `Switch to tab ${step.tab_index ?? ''}`;
    case 'close_tab':  return 'Close tab';
    case 'wait_for':     return `Wait: ${step._waitLabel ?? step.waitFor?.description ?? step.waitFor?.selector ?? step.selector ?? 'element'}`;
    case 'wait_for_tab': return `Wait for new tab${step.selector ? `: ${step.waitFor?.description ?? step.selector}` : ''}`;
    case 'pause':        return `Pause ${typeof step.duration_ms === 'number' ? `${step.duration_ms}ms` : ''}`.trim();
    default:           return step.action;
  }
}

function stepLabel(step: RecordedStep): string {
  const custom = step.name?.trim();
  return custom && custom.length > 0 ? custom : autoStepLabel(step);
}

/** Small colored dot reflecting an AI refine reliability tier. */
function ReliabilityBadge({ tier, risks }: { tier: 'reliable' | 'review' | 'fragile'; risks: string[] }) {
  const cls =
    tier === 'reliable' ? 'bg-green-500' :
    tier === 'fragile'  ? 'bg-red-500'   :
                          'bg-amber-500';
  const title = risks.length > 0
    ? `${tier} — ${risks.join('; ')}`
    : `${tier}`;
  return (
    <span
      className={cn('h-2 w-2 rounded-full shrink-0', cls)}
      title={title}
      aria-label={`Reliability: ${title}`}
    />
  );
}

export function RunScriptModal({
  script,
  orgId,
  open,
  onClose,
  mode = 'test',
  sessionId,
  onOpenScript,
  onRecordingStop,
  onSaved,
}: RunScriptModalProps) {
  const browserClientId = useBrowserClientId();
  const router = useRouter();
  const { confirm } = useConfirmDialog();

  // ── Shared ────────────────────────────────────────────────────
  const [params, setParams]       = useState<Record<string, string>>({});
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [starting, setStarting]   = useState(false);

  // ── Record mode ───────────────────────────────────────────────
  // A blank script is created when recording starts so we reuse the same
  // startStepRun infrastructure (one agent slot, not two).
  const [tempScriptId, setTempScriptId] = useState<string | null>(null);

  // ── Unified script name (both modes) ─────────────────────────
  const [scriptName, setScriptName] = useState('');
  const [scriptDescription, setScriptDescription] = useState('');
  const [showDescription, setShowDescription] = useState(false);

  // ── Linked login (the script's auth dependency) ───────────────
  // `linkedLoginId` mirrors agent_browser_scripts.login_id. Saved on
  // every change so navigating away doesn't lose the association.
  // `availableLogins` is fetched once when the modal opens — small
  // list, doesn't need pagination.
  const [linkedLoginId, setLinkedLoginId] = useState<string | null>(null);
  const [availableLogins, setAvailableLogins] = useState<Login[]>([]);
  const [loginPickerOpen, setLoginPickerOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const linkedLogin = availableLogins.find((l) => l.id === linkedLoginId) ?? null;
  // Auto-login eligibility: the linked login must have BOTH a script and
  // credentials configured before the in-editor "Log in" button works.
  const canAutoLogin = !!(linkedLogin?.auto_login_script_id && linkedLogin?.credentials_secret_id);

  // ── Test / step-run mode ──────────────────────────────────────
  const [runId, setRunId] = useState<string | null>(null);
  const [stepRunState, setStepRunState] = useState<{
    currentIndex: number;
    totalSteps: number;
    step: RecordedStep | null;
    steps: RecordedStep[];
    screenshot: string | null;
    extracted: Record<string, string>;
    done: boolean;
    status: 'waiting' | 'running' | 'error';
    pageUrl?: string | null;
  } | null>(null);
  const [editedStep, setEditedStep]     = useState('');
  const [stepEditError, setStepEditError] = useState('');
  const [hoveredStep, setHoveredStep]   = useState<number | null>(null);
  // Inline-rename state for a step row. When set, that row renders its
  // name as a text input instead of a static label. Saving (Enter / blur)
  // updates stepRunState + syncs to the worker. Escape cancels.
  const [inlineRenameIndex, setInlineRenameIndex] = useState<number | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState('');
  const [jumpingTo, setJumpingTo]       = useState<number | null>(null);
  // Three test-execution modes:
  //   • 'step'  — Run one step at a time (client-driven, slow pacing).
  //   • 'auto'  — Client-side loop firing executeStep over HTTP (Auto
  //               Test). 50-200ms gaps between steps from network RTT.
  //   • 'agent' — Server-side loop on the worker, one HTTP call.
  //               No inter-step network latency — matches the agent
  //               runtime's pacing. Used to reproduce timing-sensitive
  //               failures that auto mode masks. UI polls /state at
  //               500ms intervals for live progress.
  // Test runs come in two flavors: 'step' (one step at a time, repeatable)
  // and 'agent' (full run with the agent runtime's timing). The old 'auto'
  // editor-paced run was removed — "run as the agent would" is the single
  // honest full-run path.
  type RunMode = 'step' | 'agent';
  const [runMode, setRunMode] = useState<RunMode>('step');
  // Which family of actions the toolbar picker is showing. New scripts open
  // in Record (you're about to capture); existing scripts open in Test.
  const [toolMode, setToolMode] = useState<'test' | 'record' | 'extract'>(mode === 'record' ? 'record' : 'test');

  // ── Hybrid record+replay (within test mode) ───────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [liveRecordedSteps, setLiveRecordedSteps] = useState<RecordedStep[]>([]);
  const [newStepIndices, setNewStepIndices]     = useState<Set<number>>(new Set());
  const recordingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepListRef      = useRef<HTMLDivElement>(null);

  // ── Wait-for capture ──────────────────────────────────────────
  const [isCapturingWaitFor, setIsCapturingWaitFor] = useState(false);
  const captureAbortRef = useRef<AbortController | null>(null);

  // ── Extract capture ───────────────────────────────────────────
  const [isCapturingExtract, setIsCapturingExtract] = useState(false);
  const captureExtractAbortRef = useRef<AbortController | null>(null);

  // ── VNC iframe ref + recording state sync ──────────────────────
  const vncIframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── URL extraction dialog ──────────────────────────────────────
  const [urlExtractOpen, setUrlExtractOpen] = useState(false);
  const [urlExtractValue, setUrlExtractValue] = useState('');
  const [urlExtractFieldName, setUrlExtractFieldName] = useState('');

  // ── VM provisioning (async slot allocation) ───────────────────
  const [provisioningRunId, setProvisioningRunId] = useState<string | null>(null);
  const provisioningModeRef = useRef<'test' | 'record'>('test');

  // ── Orphan session recovery ────────────────────────────────────
  const [orphanSession, setOrphanSession] = useState<ActiveBrowserSession | null>(null);
  const [checkingOrphan, setCheckingOrphan] = useState(false);
  const [resumingOrphan, setResumingOrphan] = useState(false);

  // ── Unsaved changes tracking ──────────────────────────────────
  const [hasChanges, setHasChanges] = useState(false);
  // Whether the current recording session has been saved at least once (record mode).
  const [hasSavedSession, setHasSavedSession] = useState(false);

  // ── Exit warning (active session: nav interception or manual exit) ───────────
  const [showExitWarning, setShowExitWarning] = useState(false);
  // href of the internal link that was blocked by the nav guard.
  // After the session tears down cleanly, we router.push() it.
  const pendingNavRef    = useRef<string | null>(null);
  // Always-current: does exiting require a warning? Read by the capture-phase click guard.
  const needsExitWarnRef = useRef(false);

  // ── Steps panel collapse ──────────────────────────────────────
  const [stepsCollapsed, setStepsCollapsed] = useState(false);

  // ── Bottom tabbed panel (right rail) ──────────────────────────
  // One fixed-height panel below the steps list hosting Variables,
  // Ask AI, and (while a run/AI action is active) Activity. Auto-
  // focuses Activity when work starts; Activity tab is hidden at rest.
  const [bottomTab, setBottomTab] = useState<'variables' | 'ai' | 'activity'>('variables');

  // ── Ask AI panel ──────────────────────────────────────────────
  // Always rendered (no mode switch). One shared instruction for the
  // unified "Ask AI" panel — read by handleImprove (the live Test &
  // Improve walk). Step rows carry an always-on selection checkbox for a
  // targeted improve.
  const [aiPrompt, setAiPrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [refineSummary, setRefineSummary] = useState<string | null>(null);
  const [refineOverall, setRefineOverall] = useState<RefineReport['overall'] | null>(null);
  // True for the lifetime of a Test & Improve walk (including while paused at an
  // approval gate), so the approve path knows to RESUME the walk rather than a
  // plain run, and editing stays locked until it finishes/stops.
  const [aiWalking, setAiWalking] = useState(false);
  // Targets frozen at the start of a walk (so resuming after a gate reuses the
  // same selection) + count of improve_reports already logged to Activity (the
  // worker returns the full accumulated list each call; only log the new tail).
  const improveTargetsRef = useRef<number[]>([]);
  const improveTargetedOnlyRef = useRef(false);
  const loggedReportsRef = useRef(0);
  // Indices selected for a targeted refine. Empty → whole-script refine.
  const [selectedStepIndices, setSelectedStepIndices] = useState<Set<number>>(new Set());
  // Step indices to highlight while hovering/editing a variable in the
  // Variables panel (reverse of the step→variable hover highlight).
  const [highlightVarSteps, setHighlightVarSteps] = useState<Set<number> | null>(null);

  // ── Activity feed ─────────────────────────────────────────────
  // A lightweight, client-side log of what's happening (replay progress,
  // extracted values, gates, AI actions). Driven entirely from data we
  // already have — no backend changes. Newest at the bottom; capped so a
  // long session doesn't grow unbounded.
  type ActivityKind = 'step' | 'done' | 'error' | 'gate' | 'ai';
  type ActivityEntry = { id: string; ts: number; kind: ActivityKind; text: string };
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const activityScrollRef = useRef<HTMLDivElement>(null);
  const pushActivity = useCallback((kind: ActivityKind, text: string) => {
    setActivity((prev) => {
      const next = [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), kind, text },
      ];
      // Cap at ~200 entries; keep the newest.
      return next.length > 200 ? next.slice(next.length - 200) : next;
    });
  }, []);
  // Replay-progress tracking. lastLoggedIndexRef = highest step index we've
  // already logged a "done" for; lastExtractedRef = the extracted keys we've
  // already surfaced; runningLoggedRef = the index we last logged a "▶" for.
  // All reset whenever a fresh run/replay starts.
  const lastLoggedIndexRef = useRef(0);
  const lastExtractedRef = useRef<Record<string, string>>({});
  const runningLoggedRef = useRef<number | null>(null);
  const lastGateLoggedRef = useRef<number | null>(null);
  // Baseline the replay-progress refs to where the run is starting FROM so
  // the activity effect only logs steps completed during this run (not the
  // ones already executed before the operator hit Run / jumped). Called at
  // the top of a fresh top-level replay.
  const startReplayActivity = useCallback((fromIndex: number, extracted: Record<string, string>) => {
    lastLoggedIndexRef.current = fromIndex;
    lastExtractedRef.current = { ...extracted };
    runningLoggedRef.current = null;
  }, []);

  // ── Approval gates (test replay) ──────────────────────────────
  // Indices the operator has approved this run. Sent as approved_gates so
  // the worker can run past a gated step. Reset whenever a fresh run starts.
  const [approvedGates, setApprovedGates] = useState<Set<number>>(new Set());
  // When replay pauses at a requires_approval step, this holds the gated
  // step's index so we can render an inline Approve / Deny prompt.
  const [pendingGateIndex, setPendingGateIndex] = useState<number | null>(null);

  // ── Step edit modal ───────────────────────────────────────────
  // Set to the index of the step the operator clicked the pencil on.
  // Modal lets them rename, tweak the selector, and edit raw JSON in
  // one place — the bottom panel only carries Variables now.
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

  // ── Current step editor resize ────────────────────────────────
  const [stepEditorHeight, setStepEditorHeight] = useState(200);
  const [dragStepIdx, setDragStepIdx] = useState<number | null>(null);
  const [dropStepIdx, setDropStepIdx] = useState<number | null>(null);
  const cancelAutoRunRef = useRef(false);
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragRef.current = { startY: e.clientY, startH: stepEditorHeight };
    const onMove = (me: MouseEvent) => {
      if (!resizeDragRef.current) return;
      // Dragging up = larger editor
      const delta = resizeDragRef.current.startY - me.clientY;
      setStepEditorHeight(Math.max(80, Math.min(500, resizeDragRef.current.startH + delta)));
    };
    const onUp = () => {
      resizeDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Reset all state ───────────────────────────────────────────
  const reset = () => {
    if (captureAbortRef.current) { captureAbortRef.current.abort(); captureAbortRef.current = null; }
    if (recordingPollRef.current) { clearInterval(recordingPollRef.current); recordingPollRef.current = null; }
    setProvisioningRunId(null);
    setParams({});
    setViewerUrl(null);
    setError(null);
    setStarting(false);
    setTempScriptId(null);
    setScriptName('');
    setScriptDescription('');
    setShowDescription(false);
    setRunId(null);
    setStepRunState(null);
    setEditedStep('');
    setStepEditError('');
    setHoveredStep(null);
    setJumpingTo(null);
    setRunMode('step');
    setToolMode('test');
    setIsRecording(false);
    setLiveRecordedSteps([]);
    setNewStepIndices(new Set());
    setIsCapturingWaitFor(false);
    setHasChanges(false);
    setHasSavedSession(false);
    setShowExitWarning(false);
    setOrphanSession(null);
    setCheckingOrphan(false);
    setResumingOrphan(false);
    setEditingStepIndex(null);
    setAiPrompt('');
    setRefining(false);
    setRefineSummary(null);
    setRefineOverall(null);
    setSelectedStepIndices(new Set());
    setApprovedGates(new Set());
    setPendingGateIndex(null);
    setActivity([]);
    setBottomTab('variables');
    lastLoggedIndexRef.current = 0;
    lastExtractedRef.current = {};
    runningLoggedRef.current = null;
    lastGateLoggedRef.current = null;
  };

  // ── Auto-start when overlay opens (with orphan check) ────────
  useEffect(() => {
    if (!open || !orgId) return;
    // Default the toolbar mode each open: Record for a fresh recording,
    // Test for an existing script.
    setToolMode(mode === 'record' ? 'record' : 'test');

    // Check for an orphaned session before starting a new one. Only offer to
    // resume it when it belongs to the SAME script (and org) you're opening —
    // otherwise "Resume" would reconnect you to a different script's session.
    // A record-mode open (script == null) matches a record orphan (scriptId
    // null); a saved-script open matches only that script's id.
    const existing = getActiveBrowserSession();
    if (existing && existing.orgId === orgId && existing.scriptId === (script?.id ?? null)) {
      setCheckingOrphan(true);
      getStepRun(orgId, existing.runId)
        .then((run) => {
          // Session is still alive on the backend — let the user decide
          setOrphanSession(existing);
          setCheckingOrphan(false);
        })
        .catch(() => {
          // 404 or error — session is dead, clear and proceed normally
          clearActiveBrowserSession();
          setCheckingOrphan(false);
          startFresh();
        });
    } else {
      startFresh();
    }

    function startFresh() {
      if (mode === 'record') {
        handleStartRecordSession();
      } else {
        setScriptName(script?.name ?? '');
        setScriptDescription(script?.description ?? '');
        setLinkedLoginId(script?.login_id ?? null);
        // Variables start BLANK every session — the operator must enter
        // current values for the specific run they're doing. Persisting
        // values across sessions was actively dangerous: agents picked
        // them up as defaults and ran scripts against last-week's test
        // data when upstream context didn't supply the live values, which
        // looked like a success in the logs but wrote to the wrong row.
        // The schema (which variables exist) still comes from
        // script.parameters keys via the Variables Panel — we just don't
        // import the values.
        setParams({});
        // Always auto-start — variables are editable inline in the Variables Panel
        handleStartStepRun();
      }
      // Fetch the org's login profiles for the chip picker. Cheap
      // request, only fires once per modal open.
      if (orgId) {
        listLogins(orgId)
          .then(setAvailableLogins)
          .catch(() => { /* picker just shows "no logins available" */ });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Poll for live recorded steps during active recording ────────
  useEffect(() => {
    if (!isRecording || !runId || !orgId) {
      if (recordingPollRef.current) { clearInterval(recordingPollRef.current); recordingPollRef.current = null; }
      return;
    }
    recordingPollRef.current = setInterval(async () => {
      try {
        const state = await getStepRun(orgId, runId);
        if (state?.recordedSteps) setLiveRecordedSteps(state.recordedSteps);
      } catch { /* ignore poll errors */ }
    }, 2000);
    return () => {
      if (recordingPollRef.current) { clearInterval(recordingPollRef.current); recordingPollRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, runId, orgId]);

  // Full reset on close
  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Navigation guard — active while a session is live ─────────
  // Uses capture-phase click interception (more reliable than pushState patching
  // in Next.js App Router) plus beforeunload for browser close/refresh.
  // Active during session startup, provisioning, and live sessions — prevents the
  // user from navigating away (which would orphan the backend session / VM slot).
  const hasActiveSession = !!(runId || provisioningRunId || starting);

  useEffect(() => {
    if (!hasActiveSession) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') ?? '';
      // Only intercept internal SPA links (not external, hash-only, mailto, etc.)
      if (!href || href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!pendingNavRef.current) {
        pendingNavRef.current = href;
        if (needsExitWarnRef.current) {
          setShowExitWarning(true);
        } else {
          performExit();
        }
      }
    };

    document.addEventListener('click', handleLinkClick, true); // capture phase

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveSession]);

  // Cancel wait-for capture on Esc
  useEffect(() => {
    if (!isCapturingWaitFor) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        captureAbortRef.current?.abort();
        captureAbortRef.current = null;
        cancelStepRunWaitForCapture(orgId!, runId!).catch(() => {});
        setIsCapturingWaitFor(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isCapturingWaitFor, orgId, runId]);

  // ── Helpers ───────────────────────────────────────────────────

  /**
   * Analyzes all steps to build a map of variables used in the script.
   * A variable is either:
   *   - Consumed: referenced via {{name}} in value/url/field_name
   *   - Produced: set by an extract step (the field_name is the variable)
   */
  type VariableRef = { index: number; action: string };
  type VariableInfo = {
    sources: VariableRef[];   // steps that produce this variable (extract steps)
    consumers: VariableRef[]; // steps that reference {{name}}
  };
  const analyzeVariables = (steps: RecordedStep[]): Map<string, VariableInfo> => {
    const vars = new Map<string, VariableInfo>();
    const ensure = (name: string) => {
      if (!vars.has(name)) vars.set(name, { sources: [], consumers: [] });
      return vars.get(name)!;
    };
    // Read-side fields where an operator might insert a {{var}}. The runner
    // resolves templates across all of these now (see substituteStep in
    // browser-step-run-worker.service.js), so the Variables Panel needs to
    // match — otherwise operators who hand-author a templated selector get
    // a "missing variable" UX even though the runner will resolve it fine.
    // Keep this in sync with substituteStep's field list.
    const fieldsFor = (s: RecordedStep): string[] => {
      const fields: string[] = [];
      if (s.value)          fields.push(s.value);
      if (s.field_name)     fields.push(s.field_name);
      if (s.url)            fields.push(s.url);
      // Selector-like fields. Operators commonly inject {{var}} here to
      // click buttons whose IDs embed contract / year / etc.
      const sel = (s as RecordedStep & { selector?: string }).selector;
      if (sel)              fields.push(sel);
      const text = (s as RecordedStep & { text?: string }).text;
      if (text)             fields.push(text);
      const frameSel = (s as RecordedStep & { frame_selector?: string }).frame_selector;
      if (frameSel)         fields.push(frameSel);
      const wf = (s as RecordedStep & { waitFor?: { selector?: string } }).waitFor;
      if (wf?.selector)     fields.push(wf.selector);
      return fields;
    };
    steps.forEach((s, i) => {
      // Consumers: anywhere {{name}} appears in any user-editable string
      for (const src of fieldsFor(s)) {
        for (const m of (src.match(/\{\{(\w+)\}\}/g) ?? [])) {
          ensure(m.slice(2, -2)).consumers.push({ index: i, action: s.action });
        }
      }
      // Sources: extract steps set a variable named field_name
      if (s.action === 'extract' && s.field_name) {
        ensure(s.field_name).sources.push({ index: i, action: s.action });
      }
    });
    return vars;
  };

  /**
   * Build the parameters object for saving: { name: "" } for every
   * variable the script references.
   *
   * Schema only — values are always blank. We used to bake the current
   * test-input value (or the recording-time default) in here as the
   * default, which meant agents picked them up later if upstream
   * context didn't supply the variable. Wrong defaults silently filled
   * in for missing runtime data and the script "succeeded" against
   * stale/test data — invisible until someone noticed the wrong row
   * had been touched downstream.
   *
   * Now the agent-side validator (extractRequiredScriptVars +
   * findMissingScriptVars in agent-executor.service.js) fails fast when
   * a required variable isn't in context, so we don't need defaults to
   * paper over missing data. Test runs in the editor enter values
   * fresh every session (see setParams({}) on modal open).
   */
  const buildParameters = (steps: RecordedStep[]): Record<string, string> => {
    const vars = analyzeVariables(steps);
    const result: Record<string, string> = {};
    for (const name of vars.keys()) result[name] = '';
    return result;
  };

  // ── Provisioning poll (shared hook) ────────────────────────────
  // Drives the provisioning UI. Set provisioningRunId to start polling;
  // the hook calls onReady/onError when the VM finishes booting.
  const handleProvisioningReady = useCallback(async (run: { status: string; runId?: string; currentIndex?: number; totalSteps?: number; step?: RecordedStep | null; steps?: RecordedStep[] }) => {
    if (!orgId) return;
    const id = provisioningRunId!;
    setProvisioningRunId(null);

    setRunId(id);
    setViewerUrl(`/live/run/${id}`);

    if (provisioningModeRef.current === 'record') {
      await startStepRunRecording(orgId, id);
      setIsRecording(true);
      setStepRunState({
        currentIndex: 0, totalSteps: 0, step: null, steps: [],
        screenshot: null, extracted: {}, done: false, status: 'waiting',
      });
    } else {
      const runState = await getStepRun(orgId, id);
      setStepRunState({
        currentIndex: run.currentIndex ?? 0,
        totalSteps:   run.totalSteps ?? 0,
        step:         run.step ?? null,
        steps:        runState.steps ?? [],
        screenshot:   null,
        extracted:    {},
        done:         false,
        status:       'waiting',
      });
      setEditedStep(run.step ? JSON.stringify(run.step, null, 2) : '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, provisioningRunId]);

  const handleProvisioningError = useCallback((err: any) => {
    setProvisioningRunId(null);
    clearActiveBrowserSession();
    const msg = err?.response?.data?.error || err?.message || 'Browser session failed to start';
    toast.error(msg);
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const { isProvisioning, elapsedMs: provisioningElapsedMs } = useProvisioningPoll({
    runId: provisioningRunId,
    pollFn: (id) => getStepRun(orgId!, id),
    isProvisioningStatus: (s) => s === 'provisioning',
    onReady: handleProvisioningReady,
    onError: handleProvisioningError,
  });

  // ── Record mode: start ────────────────────────────────────────
  // Uses _draft as the script ID so no script is persisted until the user saves.
  const handleStartRecordSession = async () => {
    if (!orgId) return;
    setStarting(true);
    try {
      const autoName = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      });
      setScriptName(autoName);

      const res = await startStepRun(orgId, '_draft', {}, undefined, browserClientId);

      // 202: no VM slot was immediately available — provisioning in background
      if ('status' in res && res.status === 'provisioning') {
        setActiveBrowserSession({ runId: res.runId, orgId, scriptId: null, mode: 'record' });
        provisioningModeRef.current = 'record';
        setProvisioningRunId(res.runId);
        return;
      }

      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setActiveBrowserSession({ runId: res.runId, orgId, scriptId: null, mode: 'record' });
      setStepRunState({
        currentIndex: 0, totalSteps: 0, step: null, steps: [],
        screenshot: null, extracted: {}, done: false, status: 'waiting',
      });

      // Recording on immediately
      await startStepRunRecording(orgId, res.runId);
      setIsRecording(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to start recording';
      toast.error(msg);
      onClose();
    } finally {
      setStarting(false);
    }
  };

  // ── Record mode: stop recording (stays in test view with recorded steps) ──
  const handleStopRecordSession = async () => {
    if (!orgId || !runId) return;
    setStarting(true);
    try {
      const res = await stopStepRunRecording(orgId, runId);
      setIsRecording(false);
      setLiveRecordedSteps([]);
      // Update the step run state with the newly recorded steps so the user can replay immediately.
      // Never mark as done here — user decides to keep working, replay, or exit.
      setStepRunState(s => s ? {
        ...s,
        totalSteps: res.totalSteps,
        steps: res.steps ?? s.steps,
        step: res.step ?? null,
        status: 'waiting',
        done: false,
      } : s);
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      if (res.insertedCount === 0) {
        toast.info('No steps were captured');
      } else {
        setHasSavedSession(false);
        setHasChanges(true);
        if (res.insertedStart != null) {
          setNewStepIndices(new Set(Array.from({ length: res.insertedCount }, (_, k) => res.insertedStart! + k)));
        }
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to stop recording');
    } finally {
      setStarting(false);
    }
  };

  // ── Save script name on blur (test mode only; record mode saves on Save button) ──
  const handleSaveScriptName = async () => {
    if (!orgId || mode === 'record') return;
    const targetId = script?.id;
    if (!targetId || scriptName.trim() === (script?.name ?? '')) return;
    try {
      await updateScript(orgId, targetId, { name: scriptName.trim() || 'Untitled Script' });
    } catch { /* non-fatal */ }
  };

  // ── Linked-login handlers ─────────────────────────────────────
  // Save the script (creating it if this is a brand-new recording) and
  // restart the browser session so it boots with the linked login's
  // authenticated profile. The backend resolves profile_path from the
  // script's login_id at session start, so a linked login only takes
  // effect on a FRESH session — this gives the operator that fresh
  // session in one click instead of "close, reopen, start again".
  const restartSessionWithLogin = async (loginId: string) => {
    if (!orgId) return;
    setStarting(true);
    try {
      // 1. Capture current steps; stop recording so they're included.
      let steps = stepRunState?.steps ?? [];
      const wasRecording = isRecording;
      if (isRecording && runId) {
        try {
          const res = await stopStepRunRecording(orgId, runId);
          steps = res.steps ?? steps;
        } catch { /* proceed with whatever steps we have */ }
      }
      setIsRecording(false);
      setLiveRecordedSteps([]);
      setNewStepIndices(new Set());

      // 2. Persist the script + login_id (create on first save).
      const name = scriptName.trim() || 'Untitled Script';
      const parameters = buildParameters(steps);
      let targetScriptId = script?.id ?? tempScriptId;
      if (targetScriptId) {
        await updateScript(orgId, targetScriptId, { name, description: scriptDescription || undefined, steps, parameters, test_values: {}, login_id: loginId });
      } else {
        const created = await createScript(orgId, { name, steps, parameters, test_values: {}, login_id: loginId });
        targetScriptId = created.id;
        setTempScriptId(created.id);
      }
      setHasSavedSession(true);
      setHasChanges(false);
      onSaved?.();

      // 3. Tear down the current session.
      if (runId) await abortStepRun(orgId, runId).catch(() => {});
      setRunId(null);
      setStepRunState(null);

      // 4. Start a fresh session on the saved script — the backend seeds the
      //    linked login's profile at boot. Blank params (fresh session).
      const sessionMode: 'test' | 'record' = mode === 'record' ? 'record' : 'test';
      const res = await startStepRun(orgId, targetScriptId, {}, undefined, browserClientId);
      if ('status' in res && res.status === 'provisioning') {
        // No slot free this instant — hand off to the provisioning poll,
        // which re-enables recording on completion when mode === 'record'.
        provisioningModeRef.current = sessionMode;
        setActiveBrowserSession({ runId: res.runId, orgId, scriptId: targetScriptId, mode: sessionMode });
        setProvisioningRunId(res.runId);
        return;
      }
      const runState = await getStepRun(orgId, res.runId);
      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setActiveBrowserSession({ runId: res.runId, orgId, scriptId: targetScriptId, mode: sessionMode });
      setStepRunState({
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        runState.steps ?? steps,
        screenshot:   null,
        extracted:    {},
        done:         false,
        status:       'waiting',
      });
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      // Resume recording if we interrupted it (record mode).
      if (wasRecording && sessionMode === 'record') {
        await startStepRunRecording(orgId, res.runId);
        setIsRecording(true);
      }
      toast.success('Browser restarted with the linked login');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to restart with login');
    } finally {
      setStarting(false);
    }
  };

  // After a login is linked, offer to restart the browser so it picks up
  // that login's profile immediately. Only when linking (not unlinking) and
  // a session is actually live to restart. "Not now" keeps the link; it
  // applies on the next session start.
  const maybeOfferRestartWithLogin = async (loginId: string | null) => {
    if (!loginId || !orgId) return;
    if (!runId && !provisioningRunId) return;
    const name = availableLogins.find((l) => l.id === loginId)?.name ?? 'this login';
    const ok = await confirm({
      title: 'Restart browser with this login?',
      description:
        `A linked login only takes effect in a fresh browser session. Save and restart now ` +
        `with "${name}" so you can record and test against the logged-in state? Your steps so far are kept.`,
      confirmText: 'Save & restart',
      cancelText: 'Not now',
      variant: 'default',
    });
    if (!ok) return;
    await restartSessionWithLogin(loginId);
  };

  // Linking the script's login propagates the change to every agent
  // already using this script — the operator gets a confirm dialog
  // showing the count before we touch other agents. Idempotent at
  // the backend, so re-running with the same login_id is a no-op.
  const handleSetLinkedLogin = async (loginId: string | null) => {
    setLoginPickerOpen(false);
    if (!orgId || mode === 'record' || !script?.id) {
      setLinkedLoginId(loginId);
      // Record mode (or unsaved): the link lives in state until Save, but we
      // can still offer to restart the live session with the login now.
      await maybeOfferRestartWithLogin(loginId);
      return;
    }

    // Skip the confirm when the value didn't actually change. Picking
    // the currently-linked login from the dropdown is a no-op.
    if (loginId === linkedLoginId) return;

    // Count downstream agents so the operator can make an informed call.
    let agentCount = 0;
    try {
      const usage = await getScriptAgentUsage(orgId, script.id);
      agentCount = usage.count;
    } catch {
      // Best-effort count — if it fails we still let the operator
      // proceed; the propagate call below is idempotent + safe.
    }

    if (agentCount > 0) {
      const newLoginName = availableLogins.find((l) => l.id === loginId)?.name;
      const desc = loginId
        ? `This script is used by ${agentCount} agent${agentCount === 1 ? '' : 's'}. ` +
          `Linking "${newLoginName ?? 'this login'}" will replace any existing login step paired with this script in those agents.`
        : `This script is used by ${agentCount} agent${agentCount === 1 ? '' : 's'}. ` +
          `Unlinking the login will remove the paired login step from those agents.`;
      const ok = await confirm({
        title: loginId ? 'Update login on all agents?' : 'Unlink login on all agents?',
        description: desc,
        confirmText: loginId ? 'Update agents' : 'Unlink',
        cancelText: 'Cancel',
        variant: 'default',
      });
      if (!ok) return;
    }

    setLinkedLoginId(loginId);
    try {
      await updateScript(orgId, script.id, { login_id: loginId });
      // Fire-and-await the propagate so the operator's next agent
      // editor visit shows the synced state. Best-effort: a propagate
      // failure doesn't roll back the script's link change.
      const propagated = await propagateScriptLogin(orgId, script.id, loginId).catch(() => null);
      if (propagated && propagated.agents_touched > 0) {
        const adds = propagated.actions_added;
        const removes = propagated.actions_removed;
        const parts = [];
        if (adds > 0)    parts.push(`+${adds} login step${adds === 1 ? '' : 's'}`);
        if (removes > 0) parts.push(`-${removes} login step${removes === 1 ? '' : 's'}`);
        toast.success(
          `Updated ${propagated.agents_touched} agent${propagated.agents_touched === 1 ? '' : 's'}` +
          (parts.length ? ` (${parts.join(', ')})` : '')
        );
      }
      // Link persisted — offer to restart the live session so it boots with
      // the login's profile (only fires when linking, with a session live).
      await maybeOfferRestartWithLogin(loginId);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update linked login');
    }
  };

  // Run the linked login's auto-login script inside the editor's
  // current browser session. The recorded steps & current index are
  // unchanged — only cookies/localStorage update.
  const handleLogInWithLinkedLogin = async () => {
    if (!orgId || !runId || !script?.id || !linkedLoginId) return;
    if (!canAutoLogin) {
      toast.error('This login needs an auto-login script AND credentials configured first');
      return;
    }
    setLoggingIn(true);
    try {
      const result = await runLinkedLoginInStepRun(orgId, runId, script.id);
      toast.success(`Logged in via "${result.login_name}" (${result.steps_run} step${result.steps_run !== 1 ? 's' : ''})`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Auto-login failed');
    } finally {
      setLoggingIn(false);
    }
  };

  // ── Test / step-run handlers ──────────────────────────────────
  const handleStartStepRun = async () => {
    if (!script || !orgId) return;
    setStarting(true);
    setError(null);
    try {
      const res = await startStepRun(orgId, script.id, params, sessionId, browserClientId);

      // 202: no VM slot was immediately available — provisioning in background
      if ('status' in res && res.status === 'provisioning') {
        setActiveBrowserSession({ runId: res.runId, orgId, scriptId: script.id, mode: 'test' });
        provisioningModeRef.current = 'test';
        setProvisioningRunId(res.runId);
        return;
      }

      // Fetch the full run state to get the authoritative steps from the backend,
      // ensuring we display the latest saved version rather than the prop's potentially stale copy.
      const runState = await getStepRun(orgId, res.runId);
      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setActiveBrowserSession({ runId: res.runId, orgId, scriptId: script.id, mode: 'test' });
      setStepRunState({
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        runState.steps ?? script.steps ?? [],
        screenshot:   null,
        extracted:    {},
        done:         false,
        status:       'waiting',
      });
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to start step run';
      toast.error(msg);
      // Auto-started (no params form to show inline error) → close like recording does
      if (!script?.parameters?.length) {
        onClose();
      } else {
        setError(msg);
      }
    } finally {
      setStarting(false);
    }
  };

  // AbortController for the in-flight step execution request. Shared by
  // both single-step (handleExecuteStep) and auto-run (handleRunAll) —
  // they're mutually exclusive (the Stop button replaces the Run button
  // while either is running), so reusing one ref keeps the abort plumbing
  // simple. Clicking Stop aborts the in-flight HTTP request; the worker
  // keeps grinding the current Playwright action to completion (no mid-
  // action interrupt exists yet) but the UI returns immediately and the
  // backend session stays alive for the next click.
  const autoRunAbortRef = useRef<AbortController | null>(null);

  const handleExecuteStep = async (gates?: Set<number>) => {
    if (!runId || !orgId || !stepRunState) return;
    // Fresh top-level click clears prior approvals; re-invoke after an
    // Approve passes the updated set forward (gates !== undefined).
    const activeGates = gates ?? new Set<number>();
    if (gates === undefined) {
      setApprovedGates(activeGates);
      setPendingGateIndex(null);
      // Fresh top-level run — baseline activity from the current cursor.
      startReplayActivity(stepRunState.currentIndex, stepRunState.extracted ?? {});
    }
    const controller = new AbortController();
    autoRunAbortRef.current = controller;
    // Single manual step is a quick action — don't yank the bottom panel
    // off Variables. The Activity tab still surfaces while the step runs
    // (showActivityTab follows status === 'running'); the operator can
    // click into it if they want. Auto/agent runs and Improve still
    // auto-focus Activity because they stream substantial output.
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    try {
      const res = await executeStepRunStep(orgId, runId, params, controller.signal, [...activeGates]);
      // Worker returned 200 with interrupted=true — operator's Stop
      // signaled the worker BEFORE the HTTP abort raced it. The worker
      // has already flipped status back to 'waiting' and didn't
      // advance currentIndex, so we just confirm the cancel in the UI.
      if (res.interrupted) {
        setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
        toast.info('Step stopped');
        return;
      }
      // Replay paused at a gated (requires_approval) step — surface the
      // inline Approve / Deny prompt for that index instead of advancing.
      if (res.awaiting_approval) {
        setStepRunState((s) => s ? {
          ...s,
          currentIndex: res.currentIndex,
          step: res.step ?? s.step,
          status: 'waiting',
          pageUrl: res.pageUrl ?? s.pageUrl ?? null,
        } : s);
        setPendingGateIndex(res.currentIndex);
        return;
      }
      setStepRunState((s) => {
        // Merge the executed step back so auto-locked selectors are reflected
        const steps = [...(s?.steps ?? [])];
        if (res.executedStep && res.currentIndex > 0) {
          steps[res.currentIndex - 1] = res.executedStep;
        }
        return {
          currentIndex: res.currentIndex,
          totalSteps:   res.totalSteps,
          step:         res.step,
          steps,
          screenshot:   res.screenshot,
          extracted:    res.extracted,
          done:         res.done,
          status:       'waiting',
          pageUrl:      res.pageUrl ?? s?.pageUrl ?? null,
        };
      });
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      setStepEditError('');
      // Live-update test values from extracted data (extract steps set variables)
      if (res.extracted && Object.keys(res.extracted).length > 0) {
        setParams((p) => ({ ...p, ...res.extracted }));
      }
      if (res.done) toast.success('All steps completed!');
    } catch (err: any) {
      // User clicked Stop mid-request — flip the UI back to waiting
      // without painting it as an error. Same convention as the auto-run
      // loop a few lines below; both can be cancelled by the same Stop
      // button.
      if (err?.name === 'AbortError' || err?.name === 'CanceledError') {
        setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
        toast.info('Step stopped');
        return;
      }
      const screenshot = err?.response?.data?.screenshot ?? null;
      const msg = err?.response?.data?.error || err?.message || 'Step failed';
      setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
      setError(msg);
      pushActivity('error', `✗ ${msg}`);
    } finally {
      autoRunAbortRef.current = null;
    }
  };

  // (The old client-side editor-paced "Run All" was removed — the single
  // full-run path is now handleRunAgentMode, which reproduces the agent
  // runtime's true back-to-back timing.)

  /**
   * Agent-timing Run All. Sends ONE HTTP request to the backend that
   * loops every remaining step on the worker, with no editor-side
   * network latency between iterations. Polls /state every 500ms in
   * parallel so the UI shows live progress (currentIndex, step list
   * positions, last screenshot).
   *
   * Used to reproduce timing-sensitive failures the editor's Auto Test
   * masks — e.g. a button whose `disabled` flips a few seconds after a
   * prior click, where Auto Test's ~150ms inter-step gap is enough for
   * the page to settle but the agent runtime outruns the settle.
   */
  const handleRunAgentMode = async (gates?: Set<number>) => {
    if (!runId || !orgId || !stepRunState || stepRunState.done) return;
    // Fresh top-level click clears prior approvals; re-invoke after an
    // Approve passes the updated set forward (gates !== undefined).
    const activeGates = gates ?? new Set<number>();
    if (gates === undefined) {
      setApprovedGates(activeGates);
      setPendingGateIndex(null);
      // Fresh top-level run — baseline activity from the current cursor.
      startReplayActivity(stepRunState.currentIndex, stepRunState.extracted ?? {});
    }
    cancelAutoRunRef.current = false;
    const controller = new AbortController();
    autoRunAbortRef.current = controller;
    setBottomTab('activity');
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);

    // Poll /state every 500ms during the long-running request so the
    // step list advances live. Worker updates stepRuns.currentIndex
    // synchronously between steps, so this snapshot follows along.
    // Polling is best-effort — silent failures are tolerated since
    // the main call's return will overwrite the final state anyway.
    const pollId = window.setInterval(async () => {
      try {
        const snap = await getStepRun(orgId, runId);
        setStepRunState((s) => s ? {
          ...s,
          currentIndex: snap.currentIndex,
          totalSteps:   snap.totalSteps,
          step:         snap.step,
          // Don't overwrite steps[] from the snapshot — auto-locked
          // selectors are persisted on the final return, and pulling
          // them mid-run can race with edits the operator made in
          // the inspector since the run started.
          screenshot:   snap.lastScreenshot ?? s.screenshot,
          extracted:    snap.extracted ?? s.extracted,
          pageUrl:      snap.pageUrl ?? s.pageUrl ?? null,
        } : s);
      } catch { /* swallow — see comment above */ }
    }, 500);

    try {
      const res = await runRemainingStepsAgentMode(orgId, runId, params, controller.signal, [...activeGates]);
      // Replay paused at a gated (requires_approval) step — surface the
      // inline Approve / Deny prompt for that index instead of finishing.
      if (res.awaiting_approval) {
        window.clearInterval(pollId);
        setStepRunState((s) => s ? {
          ...s,
          currentIndex: res.currentIndex,
          step: res.step ?? s.step,
          status: 'waiting',
          pageUrl: res.pageUrl ?? s.pageUrl ?? null,
        } : s);
        setPendingGateIndex(res.currentIndex);
        autoRunAbortRef.current = null;
        return;
      }
      // Final state — the snapshot poll's steps[] mid-run is best-effort;
      // this is the authoritative final result with auto-locked selectors
      // already merged into the run's stepRuns state on the worker side.
      setStepRunState((s) => s ? {
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        s.steps,
        screenshot:   res.screenshot,
        extracted:    res.extracted,
        done:         res.done,
        status:       res.done ? 'waiting' : (res.interrupted ? 'waiting' : 'error'),
        pageUrl:      res.pageUrl ?? s.pageUrl ?? null,
      } : s);
      if (res.extracted && Object.keys(res.extracted).length > 0) {
        setParams((p) => ({ ...p, ...res.extracted }));
      }
      if (res.done) toast.success('All steps completed (agent timing)!');
      else if (res.interrupted) toast.info('Agent run stopped');
      else pushActivity('error', `✗ Run stopped at step ${res.currentIndex + 1}`);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || cancelAutoRunRef.current) {
        setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
        toast.info('Agent run stopped');
        return;
      }
      const screenshot = err?.response?.data?.screenshot ?? null;
      const msg = err?.response?.data?.error || err?.message || 'Run failed';
      setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
      setError(msg);
      pushActivity('error', `✗ ${msg}`);
    } finally {
      window.clearInterval(pollId);
      autoRunAbortRef.current = null;
    }
  };

  /** Stop button handler — cancels the auto-run loop AND the in-flight
   *  per-step Playwright action. Two-pronged because each side does
   *  half the work:
   *    1. autoRunAbortRef.current.abort() — drops the in-flight HTTP
   *       request so the UI's `await` returns immediately. Without
   *       this the spinner would hang until the worker responded.
   *    2. interruptStepRun(...) — tells the worker to abort the
   *       per-execute AbortController in its step-run state machine,
   *       which races the Playwright primitive to an AbortError and
   *       flips the run's status back to 'waiting'. Without this the
   *       worker keeps the orphan action running and the next step
   *       click goes nowhere because the session is still "running".
   *
   *  The backend session itself stays alive — abortStepRun is the
   *  full-teardown call we explicitly DON'T want here. */
  const handleStopAutoRun = () => {
    cancelAutoRunRef.current = true;
    // 1. Abort the HTTP request so the UI returns immediately.
    if (autoRunAbortRef.current) {
      autoRunAbortRef.current.abort();
      autoRunAbortRef.current = null;
    }
    // 2. Tell the worker to drop the Playwright primitive. Fire-and-
    // forget — if the network call fails, the local abort above still
    // protects the UI, and the worker's own timeouts will eventually
    // free the session. We don't surface errors here because clicking
    // Stop should never feel like it failed.
    if (orgId && runId) {
      void interruptStepRun(orgId, runId).catch(() => { /* silent */ });
    }
  };

  // ── AI Test & Improve (live walk) ─────────────────────────────
  // Replays the script in the run's EXISTING browser, executing each step so
  // the walk doubles as a test: it uses the current Variables (failing loudly
  // if any referenced one is empty), pauses on submit/destructive approval
  // gates, and at each TARGET step rewrites the selector/name against the LIVE
  // page before running it. Targets = the selected rows, or the whole script
  // when none are selected. Mirrors the agent-mode run loop (poll + abortable
  // + awaiting_approval) so progress shows live in-window and Stop cancels.
  //
  // `opts.gates` is passed ONLY when resuming after an approval gate — that
  // call keeps the same targets, keeps the cursor, and adds the approved index.
  const handleImprove = async (opts?: { gates?: Set<number> }) => {
    if (!orgId || !runId) return;
    if (refining && !opts?.gates) return; // re-entrancy guard (gate resume is allowed)
    const steps = stepRunState?.steps ?? [];
    if (steps.length === 0) {
      toast.error('No steps to improve yet');
      return;
    }

    const resuming = !!opts?.gates;
    const activeGates = opts?.gates ?? new Set<number>();

    // Fresh run: if the instruction names specific steps ("just step 7"), run
    // and improve ONLY those (targetedOnly) — jumping straight to them, leaving
    // the rest of the script un-run. Otherwise walk the whole script.
    let targetIndices: number[];
    let targetedOnly: boolean;
    if (resuming) {
      targetIndices = improveTargetsRef.current;
      targetedOnly = improveTargetedOnlyRef.current;
    } else {
      const parsed = parseStepTargets(aiPrompt, steps.length);
      if (parsed.mentioned && parsed.indices.length === 0) {
        toast.error(`No matching step — this script has ${steps.length} step${steps.length === 1 ? '' : 's'}.`);
        return;
      }
      targetedOnly = parsed.indices.length > 0;
      targetIndices = parsed.indices;
    }

    const firstTarget = targetIndices.length ? targetIndices[0] : 0;

    if (!resuming) {
      improveTargetsRef.current = targetIndices;
      improveTargetedOnlyRef.current = targetedOnly;
      loggedReportsRef.current = 0;
      setApprovedGates(new Set());
      setPendingGateIndex(null);
      startReplayActivity(firstTarget, {});
      // Echo the operator's typed instruction so the Activity log records what
      // was asked for this run.
      if (aiPrompt.trim()) pushActivity('ai', `💬 You asked: “${aiPrompt.trim()}”`);
      pushActivity(
        'ai',
        targetedOnly
          ? `Testing & improving step${targetIndices.length === 1 ? '' : 's'} ${targetIndices.map((i) => i + 1).join(', ')} only — running just ${targetIndices.length === 1 ? 'it' : 'them'} on the current page…`
          : 'Testing & improving the whole script — walking through live…',
      );
    }

    setRefining(true);
    setAiWalking(true);
    setBottomTab('activity');
    setError(null);
    cancelAutoRunRef.current = false;
    const controller = new AbortController();
    autoRunAbortRef.current = controller;
    setStepRunState((s) => s ? { ...s, status: 'running', ...(resuming ? {} : { currentIndex: firstTarget }) } : s);

    // Poll /state every 500ms so the step list + screenshot advance live while
    // the long-running walk request is in flight (same as agent-mode run).
    const pollId = window.setInterval(async () => {
      try {
        const snap = await getStepRun(orgId, runId);
        setStepRunState((s) => s ? {
          ...s,
          currentIndex: snap.currentIndex,
          totalSteps:   snap.totalSteps,
          step:         snap.step,
          screenshot:   snap.lastScreenshot ?? s.screenshot,
          extracted:    snap.extracted ?? s.extracted,
          pageUrl:      snap.pageUrl ?? s.pageUrl ?? null,
        } : s);
      } catch { /* best-effort — final return is authoritative */ }
    }, 500);

    try {
      const res = await improveWalk(
        orgId,
        runId,
        {
          params,
          approvedGates: resuming ? [...activeGates] : [],
          targetIndices,
          targetedOnly,
          instruction: aiPrompt.trim() || undefined,
          reset: !resuming,
        },
        controller.signal,
      );

      // Pre-flight failure: a referenced variable had no value. Nothing ran.
      if (res.ok === false) {
        window.clearInterval(pollId);
        setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
        const msg = res.error || 'Missing variable values';
        setError(msg);
        pushActivity('error', `✗ ${msg}`);
        toast.error(msg);
        setAiWalking(false);
        autoRunAbortRef.current = null;
        return;
      }

      // Adopt the (possibly rewritten) steps so the editor reflects live fixes.
      if (Array.isArray(res.steps)) {
        const improved = res.steps as RecordedStep[];
        setStepRunState((s) => s ? { ...s, steps: improved } : s);
        setHasChanges(true);
      }
      // Log only the newly-appended improve reports (worker returns the full
      // accumulated list each call, including across gate resumes).
      const reports = res.improve_reports ?? [];
      for (let k = loggedReportsRef.current; k < reports.length; k++) {
        const r = reports[k];
        pushActivity('ai', `↻ Step ${r.index + 1}${r.name ? ` “${r.name}”` : ''}: ${r.change}${r.confidence ? ` (${r.confidence})` : ''}`);
      }
      loggedReportsRef.current = reports.length;

      // Paused at an approval gate — surface inline Approve / Deny. The walk
      // stays "active" (aiWalking) so Approve resumes it from here.
      if (res.awaiting_approval) {
        window.clearInterval(pollId);
        setStepRunState((s) => s ? {
          ...s,
          currentIndex: res.currentIndex,
          step: res.step ?? s.step,
          status: 'waiting',
          pageUrl: res.pageUrl ?? s.pageUrl ?? null,
        } : s);
        setPendingGateIndex(res.currentIndex);
        autoRunAbortRef.current = null;
        return;
      }

      // Terminal: complete, interrupted, or failed mid-step.
      setStepRunState((s) => s ? {
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        (res.steps as RecordedStep[]) ?? s.steps,
        screenshot:   res.screenshot,
        extracted:    res.extracted,
        done:         res.done,
        status:       res.done ? 'waiting' : (res.interrupted ? 'waiting' : 'error'),
        pageUrl:      res.pageUrl ?? s.pageUrl ?? null,
      } : s);
      if (res.extracted && Object.keys(res.extracted).length > 0) {
        setParams((p) => ({ ...p, ...res.extracted }));
      }
      if (res.done) {
        setSelectedStepIndices(new Set());
        pushActivity('done', targetedOnly
          ? `✓ Improved step${targetIndices.length === 1 ? '' : 's'} ${targetIndices.map((i) => i + 1).join(', ')}.`
          : '✓ Test & Improve complete — steps tested and updated.');
        // Tidy pass (metadata only, page-independent): name steps, rename
        // variables, prune unused, and CREATE variables (parameterize literal
        // values) — honoring the instruction. Never touches the live-hardened
        // selectors. Scoped to the targeted steps on a targeted run, so a
        // focused run only names/parameterizes those (no whole-script churn).
        try {
          pushActivity('ai', targetedOnly ? 'Tidying the targeted step(s)…' : 'Tidying step names and variables…');
          const tidy = await tidyScript(orgId, {
            steps: (res.steps as RecordedStep[]) ?? steps,
            parameters: params,
            instruction: aiPrompt.trim() || undefined,
            ...(targetedOnly ? { scopeIndices: targetIndices } : {}),
          });
          setStepRunState((s) => s ? {
            ...s,
            steps: tidy.steps,
            totalSteps: tidy.steps.length,
            step: tidy.steps[s.currentIndex] ?? s.step,
          } : s);
          setParams(tidy.parameters ?? {});
          if (runId) await syncStepRunSteps(orgId, runId, tidy.steps).catch(() => {});
          const r = tidy.report;
          if (r?.parameterized?.length) pushActivity('ai', `Created variable${r.parameterized.length === 1 ? '' : 's'}: ${r.parameterized.map((p) => `{{${p.var_name}}} (step ${p.index + 1})`).join(', ')}`);
          if (r?.renamed?.length) pushActivity('ai', `Renamed variable${r.renamed.length === 1 ? '' : 's'}: ${r.renamed.map((x) => `${x.from} → ${x.to}`).join(', ')}`);
          if (r?.pruned?.length) pushActivity('ai', `Removed unused variable${r.pruned.length === 1 ? '' : 's'}: ${r.pruned.join(', ')}`);
          pushActivity('done', `✓ Tidied — ${r?.named ?? 0} step name${r?.named === 1 ? '' : 's'} set${r?.parameterized?.length ? `, ${r.parameterized.length} variable${r.parameterized.length === 1 ? '' : 's'} created` : ''}.`);
        } catch (e: any) {
          pushActivity('error', `Tidy skipped: ${e?.response?.data?.error || e?.message || 'failed'}`);
        }
        setAiWalking(false);
        toast.success(targetedOnly ? 'Steps improved' : 'Test & Improve complete');
      } else if (res.interrupted) {
        setAiWalking(false);
        pushActivity('error', '■ Stopped.');
        toast.info('Stopped');
      } else {
        setAiWalking(false);
        pushActivity('error', `✗ Stopped at step ${res.currentIndex + 1} — fix it and run again.`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || cancelAutoRunRef.current) {
        setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
        setAiWalking(false);
        pushActivity('error', '■ Stopped.');
        toast.info('Stopped');
        return;
      }
      const screenshot = err?.response?.data?.screenshot ?? null;
      const msg = err?.response?.data?.error || err?.message || 'Improve failed';
      setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
      setError(msg);
      pushActivity('error', `✗ ${msg}`);
      setAiWalking(false);
    } finally {
      window.clearInterval(pollId);
      autoRunAbortRef.current = null;
      setRefining(false);
    }
  };

  // ── Approval gate: Approve / Deny ─────────────────────────────
  // Approve → add the gated index to approvedGates and re-invoke the same
  // run path (step or agent) passing the updated set so the worker runs
  // past it. Deny → abort the in-flight replay via the existing Stop path.
  const handleApproveGate = async () => {
    if (pendingGateIndex === null) return;
    const next = new Set(approvedGates);
    next.add(pendingGateIndex);
    setApprovedGates(next);
    setPendingGateIndex(null);
    // Resume whichever flow paused us: a live Improve walk, an agent run, or a
    // single-step run.
    if (aiWalking) await handleImprove({ gates: next });
    else if (runMode === 'agent') await handleRunAgentMode(next);
    else await handleExecuteStep(next);
  };

  const handleDenyGate = () => {
    setPendingGateIndex(null);
    setAiWalking(false);
    handleStopAutoRun();
    setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
    toast.info('Replay stopped at approval gate');
  };

  const handleJumpToStep = async (targetIndex: number) => {
    if (!runId || !orgId || !stepRunState || jumpingTo !== null) return;
    setJumpingTo(targetIndex);
    setError(null);
    setPendingGateIndex(null);
    try {
      const res = await jumpStepRunToIndex(orgId, runId, targetIndex);
      setStepRunState((s) => s ? {
        ...s,
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        screenshot:   res.screenshot,
        extracted:    res.extracted,
        done:         false,
        status:       'waiting',
      } : s);
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      setStepEditError('');
      // Jumping is navigation, NOT a run — fast-forward the activity refs to
      // the new cursor so the replay-progress effect doesn't emit ✓ entries
      // for the steps we skipped past. A subsequent real run still logs from
      // here (startReplayActivity re-baselines on Run).
      lastLoggedIndexRef.current = res.currentIndex;
      lastExtractedRef.current = { ...(res.extracted ?? {}) };
      runningLoggedRef.current = null;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to jump to step');
    } finally {
      setJumpingTo(null);
    }
  };

  const performExit = async () => {
    // Stop provisioning poll — let the backend continue booting; the session will
    // become an orphan that the user can resume or discard next time they open the modal.
    setProvisioningRunId(null);
    if (isRecording && runId && orgId) await stopStepRunRecording(orgId, runId).catch(() => {});
    if (runId && orgId) await abortStepRun(orgId, runId).catch(() => {});
    // No temp script to clean up — script is only created on explicit Save.
    clearActiveBrowserSession();

    const pendingNav = pendingNavRef.current;
    pendingNavRef.current = null;

    reset();
    onClose();
    // Always return to the scripts list — do not auto-open the edit view

    // Resume the navigation that was blocked by the guard
    if (pendingNav) router.push(pendingNav);
  };

  const handleExit = () => {
    // Always warn if there's an active session — unsaved changes may be lost
    if (runId || provisioningRunId) {
      setShowExitWarning(true);
    } else {
      performExit();
    }
  };

  // ── Inline rename a step's display name. Triggered by double-clicking
  // the name span on a step row. Commits on Enter / blur, cancels on Esc.
  const commitInlineRename = async (idx: number, nextName: string) => {
    const trimmed = nextName.trim();
    const current = stepRunState?.steps?.[idx];
    if (!current) {
      setInlineRenameIndex(null);
      return;
    }
    // Treat empty string as "clear the operator label" — falls back to auto label.
    const updated: RecordedStep = { ...current, name: trimmed.length > 0 ? trimmed : undefined };
    // Use functional updater so we compose against latest state (avoids the
    // same stale-closure trap that bit the StepEdit save earlier).
    const newSteps = [...(stepRunState?.steps ?? [])];
    newSteps[idx] = updated;
    setStepRunState((s) => {
      if (!s) return s;
      const merged = [...s.steps];
      merged[idx] = updated;
      return { ...s, steps: merged, step: idx === s.currentIndex ? updated : s.step };
    });
    setHasChanges(true);
    setInlineRenameIndex(null);
    if (orgId && runId) {
      try {
        await syncStepRunSteps(orgId, runId, newSteps);
      } catch (err: any) {
        toast.error(err?.response?.data?.error || err?.message || 'Failed to rename step');
      }
    }
  };

  // ── Rename variable — updates all step references ───────────
  //
  // {{var}} placeholders can land in MANY fields on a step, not just
  // value/url. Missing any of them produced the "orphan + new key"
  // symptom: rename `contract_id` → `cid` and the params map flipped
  // correctly, but any step with `#button-{{contract_id}}` in its
  // selector kept the old reference, so contract_id stayed visible as
  // a referenced variable AND cid showed up as an unattached new one.
  //
  // Substitute() in the worker (browser-step-run-worker.service.js)
  // looks at: selector, text, url, value, frame_selector, waitFor.selector,
  // and elementSnapshot.candidates[].sel. Mirror that full surface
  // here so the rename is a true find-and-replace across everything
  // the runtime substitutes.
  //
  // Also matches BOTH `{var}` and `{{var}}` (recorder/substitute allow
  // either form per substitute()'s `\{+...\}+` regex).
  const handleRenameVariable = (oldName: string, newName: string) => {
    const safeName = newName.trim().replace(/\s+/g, '_').replace(/\W/g, '');
    if (!safeName || safeName === oldName) return;

    // Builds a regex that matches {oldName} or {{oldName}} (or any
    // number of surrounding braces), preserving the outer brace count
    // in the replacement.
    const ref = new RegExp(`(\\{+)${oldName}(\\}+)`, 'g');
    const swap = (s: string | null | undefined): string | null | undefined =>
      typeof s === 'string' ? s.replace(ref, (_m, open, close) => `${open}${safeName}${close}`) : s;

    const updatedSteps = (stepRunState?.steps ?? []).map((s) => {
      const updated: typeof s = { ...s };
      // String fields the worker substitutes against.
      if (typeof updated.value === 'string')          updated.value          = swap(updated.value) as string;
      if (typeof updated.url === 'string')            updated.url            = swap(updated.url) as string;
      if (typeof updated.selector === 'string')       updated.selector       = swap(updated.selector) as string;
      if (typeof updated.text === 'string')           updated.text           = swap(updated.text) as string;
      if (typeof updated.frame_selector === 'string') updated.frame_selector = swap(updated.frame_selector) as string;
      // waitFor.selector (locked-in fallback for the locator chain).
      if (updated.waitFor && typeof updated.waitFor.selector === 'string') {
        updated.waitFor = { ...updated.waitFor, selector: swap(updated.waitFor.selector) as string };
      }
      // elementSnapshot.candidates[].sel (ranked locator candidates).
      if (updated.elementSnapshot && Array.isArray(updated.elementSnapshot.candidates)) {
        updated.elementSnapshot = {
          ...updated.elementSnapshot,
          candidates: updated.elementSnapshot.candidates.map((c) =>
            typeof c?.sel === 'string' ? { ...c, sel: swap(c.sel) as string } : c
          ),
        };
      }
      // Extract step: field_name names which params key the result writes to.
      if (updated.field_name === oldName) updated.field_name = safeName;
      return updated;
    });
    setStepRunState((s) => s ? { ...s, steps: updatedSteps } : s);
    setParams((p) => {
      const { [oldName]: val, ...rest } = p;
      return { ...rest, [safeName]: val ?? '' };
    });
    setHasChanges(true);
  };

  // ── Delete variable (only when not in use) ─────────────────
  const handleDeleteVariable = (name: string) => {
    setParams((p) => {
      const { [name]: _, ...rest } = p;
      return rest;
    });
  };

  // ── Drag-and-drop step reorder ──────────────────────────────
  const handleDropStep = (targetIdx: number) => {
    if (dragStepIdx === null || dragStepIdx === targetIdx || !stepRunState) return;
    const newSteps = [...(stepRunState.steps ?? [])];
    const [dragged] = newSteps.splice(dragStepIdx, 1);
    newSteps.splice(targetIdx, 0, dragged!);
    // Shift newStepIndices to match reorder
    setNewStepIndices((prev) => {
      const arr = [...prev];
      const updated = new Set<number>();
      for (const idx of arr) {
        if (idx === dragStepIdx) {
          updated.add(targetIdx);
        } else {
          let shifted = idx;
          if (idx > dragStepIdx) shifted--;
          if (shifted >= targetIdx) shifted++;
          updated.add(shifted);
        }
      }
      return updated;
    });
    setStepRunState((s) => s ? { ...s, steps: newSteps, totalSteps: newSteps.length } : s);
    setHasChanges(true);
    setDragStepIdx(null);
    setDropStepIdx(null);
    // Sync to worker immediately so executions/jumps use the reordered list
    if (runId && orgId) syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
  };

  // ── Add explicit wait step — triggers the element picker, then inserts ──
  const handleAddWaitStep = async () => {
    if (!runId || !orgId || !stepRunState || isCapturingWaitFor) return;

    // Trigger the element picker overlay in the browser
    setIsCapturingWaitFor(true);
    const controller = new AbortController();
    captureAbortRef.current = controller;
    try {
      const result = await captureStepRunWaitFor(orgId, runId, controller.signal);

      // Build the wait_for step from the captured element
      const waitStep: RecordedStep = {
        action: 'wait_for',
        selector: result.selector,
        waitFor: { selector: result.selector, description: result.description },
        elementSnapshot: result.elementSnapshot ?? undefined,
      };

      // Insert after the current step
      const idx = stepRunState.currentIndex + 1;
      const newSteps = [...(stepRunState.steps ?? [])];
      newSteps.splice(idx, 0, waitStep);
      setStepRunState((s) => s ? {
        ...s,
        steps: newSteps,
        totalSteps: newSteps.length,
        step: waitStep,
      } : s);
      setEditedStep(JSON.stringify(waitStep, null, 2));
      setNewStepIndices((prev) => new Set([...prev, idx]));
      setHasChanges(true);
      // Sync to worker immediately so executions/jumps use the updated list
      await syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
      toast.success('Wait step added');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      toast.error(err?.response?.data?.error || err?.message || 'Wait-for capture failed');
    } finally {
      captureAbortRef.current = null;
      setIsCapturingWaitFor(false);
    }
  };

  // ── Add pause step — pure time-based delay, no element picker ──
  // Drops a `pause` step after the current cursor position. Sleeps
  // `duration_ms` on the worker before the next step runs. Useful for
  // the "next step's target needs longer to settle than wait_for can
  // reliably detect" case (e.g. a button whose `disabled` flips ~7s
  // after a prior click without a DOM mutation we can target).
  const handleAddPauseStep = async () => {
    if (!runId || !orgId || !stepRunState) return;
    // Prompt for a duration; default to 5s as a reasonable starting point
    // for "the next step's target needs a moment to settle." Worker
    // caps anything > 5min on its side, so we just validate as a
    // positive integer here.
    const raw = typeof window !== "undefined"
      ? window.prompt("Pause duration in milliseconds:", "5000")
      : null;
    if (raw === null) return; // operator cancelled
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a positive number of milliseconds");
      return;
    }
    const pauseStep: RecordedStep = {
      action: "pause",
      duration_ms: parsed,
    };
    const idx = stepRunState.currentIndex + 1;
    const newSteps = [...(stepRunState.steps ?? [])];
    newSteps.splice(idx, 0, pauseStep);
    setStepRunState((s) => s ? {
      ...s,
      steps: newSteps,
      totalSteps: newSteps.length,
      step: pauseStep,
    } : s);
    setEditedStep(JSON.stringify(pauseStep, null, 2));
    setNewStepIndices((prev) => new Set([...prev, idx]));
    setHasChanges(true);
    await syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
    toast.success(`Pause step added (${parsed}ms)`);
  };

  // ── Add extract step — triggers element picker, then inserts ──
  const handleAddExtractStep = async () => {
    if (!runId || !orgId || !stepRunState || isCapturingExtract) return;

    setIsCapturingExtract(true);
    const controller = new AbortController();
    captureExtractAbortRef.current = controller;
    try {
      const result = await captureStepRunExtract(orgId, runId, controller.signal);

      // Auto-generate a field name from the description
      const rawName = result.description
        ? result.description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'extracted_value'
        : 'extracted_value';

      const extractStep: RecordedStep = {
        action: 'extract',
        selector: result.selector,
        field_name: rawName,
        text: result.value,
        _defaultValue: result.value,
        elementSnapshot: result.elementSnapshot ?? undefined,
        waitFor: { selector: result.selector, description: result.description },
      };

      const idx = stepRunState.currentIndex + 1;
      const newSteps = [...(stepRunState.steps ?? [])];
      newSteps.splice(idx, 0, extractStep);
      setStepRunState((s) => s ? {
        ...s,
        steps: newSteps,
        totalSteps: newSteps.length,
        step: extractStep,
      } : s);
      setEditedStep(JSON.stringify(extractStep, null, 2));
      setNewStepIndices((prev) => new Set([...prev, idx]));
      setHasChanges(true);
      await syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
      toast.success(`Extract step added → {{${rawName}}} = "${result.value.slice(0, 40)}${result.value.length > 40 ? '…' : ''}"`);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      toast.error(err?.response?.data?.error || err?.message || 'Extract capture failed');
    } finally {
      captureExtractAbortRef.current = null;
      setIsCapturingExtract(false);
    }
  };

  // ── Listen for Copy events from the VNC iframe ──────────────────
  // The VNC Copy button always postMessages.  We only create an extract
  // step when a script session is active (runId set, not done).  When
  // not in a session the message is simply ignored — the clipboard copy
  // already happened inside the iframe.
  // Only create extract steps when actively recording — during plain
  // testing the Copy button just copies to the local clipboard.
  const scriptSessionRef = useRef(isRecording);
  scriptSessionRef.current = isRecording;
  const smartCopyRef = useRef<(text: string) => void>(() => {});

  // Ref is updated below after handleSmartCopyWithText is declared.

  // ── Create a DOM text-based extract step from copied text ────────
  // Used when the copied value isn't found in the URL — locates the element
  // by text content at replay time via page.getByText().
  const insertDomTextExtract = (clipText: string) => {
    const fieldName = clipText
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'extracted_value';

    const step: RecordedStep = {
      action: 'extract',
      selector: clipText,
      field_name: fieldName,
      text: clipText,
      _defaultValue: clipText,
      elementSnapshot: {
        tag: 'span',
        id: null, name: null, type: null, classes: [],
        placeholder: null, ariaLabel: null, ariaRole: null, href: null,
        innerText: clipText,
        candidates: [{ sel: clipText, type: 'text' }],
      },
    };

    const insertAt = stepRunState?.currentIndex ?? 0;
    setStepRunState((s) => {
      if (!s) return s;
      const newSteps = [...s.steps];
      newSteps.splice(insertAt, 0, step);
      return { ...s, steps: newSteps, totalSteps: newSteps.length };
    });
    setNewStepIndices((prev) => new Set([...prev, insertAt]));
    setHasChanges(true);
    if (runId && orgId) {
      const newSteps = [...(stepRunState?.steps ?? [])];
      newSteps.splice(insertAt, 0, step);
      syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
    }
    toast.success(`Extracted text → {{${fieldName}}} = "${clipText.slice(0, 40)}${clipText.length > 40 ? '…' : ''}"`);
  };

  // ── Smart Copy — core logic shared by toolbar button + VNC button ──
  const handleSmartCopyWithText = async (clipText: string) => {
    if (!runId || !orgId || !clipText) return;

    // Fetch the LIVE page URL from the backend
    let liveUrl = '';
    try {
      const freshState = await getStepRun(orgId, runId);
      liveUrl = freshState?.pageUrl ?? '';
      if (liveUrl) setStepRunState((s) => s ? { ...s, pageUrl: liveUrl } : s);
    } catch { /* fall through */ }

    if (!liveUrl) {
      insertDomTextExtract(clipText);
      return;
    }

    // Auto-detect where the value lives in the URL
    let method: 'query_param' | 'path_segment' | 'url_match' | null = null;
    let fieldName = '';
    let paramName = '';
    let pathIndex = 0;

    try {
      const parsed = new URL(liveUrl);
      for (const [key, val] of parsed.searchParams.entries()) {
        if (val === clipText) {
          method = 'query_param';
          paramName = key;
          fieldName = key;
          break;
        }
      }
      if (!method) {
        const segments = parsed.pathname.split('/').filter(Boolean);
        const idx = segments.indexOf(clipText);
        if (idx >= 0) {
          method = 'path_segment';
          pathIndex = idx;
          fieldName = idx > 0 ? `${segments[idx - 1].replace(/s$/, '')}_id` : `path_${idx}`;
        }
      }
    } catch { /* invalid URL */ }

    if (!method && liveUrl.includes(clipText)) {
      method = 'url_match';
      fieldName = 'extracted_value';
    }

    if (!method) {
      insertDomTextExtract(clipText);
      return;
    }

    const urlExtraction: RecordedStep['url_extraction'] =
      method === 'query_param'  ? { method, param_name: paramName } :
      method === 'path_segment' ? { method, path_index: pathIndex } :
                                  { method, match_value: clipText };

    const step: RecordedStep = {
      action: 'extract',
      selector: '__url__',
      field_name: fieldName,
      text: clipText,
      _defaultValue: clipText,
      url_extraction: urlExtraction,
    };

    const insertAt = stepRunState?.currentIndex ?? 0;
    setStepRunState((s) => {
      if (!s) return s;
      const newSteps = [...s.steps];
      newSteps.splice(insertAt, 0, step);
      return { ...s, steps: newSteps, totalSteps: newSteps.length };
    });
    setNewStepIndices((prev) => new Set([...prev, insertAt]));
    setHasChanges(true);
    if (runId && orgId) {
      const newSteps = [...(stepRunState?.steps ?? [])];
      newSteps.splice(insertAt, 0, step);
      syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
    }

    const label = method === 'query_param' ? `?${paramName}` : method === 'path_segment' ? `path[${pathIndex}]` : 'match';
    toast.success(`Extracted ${label} → {{${fieldName}}} = "${clipText}"`);
  };

  // Keep the ref current so the message listener always calls the latest version
  smartCopyRef.current = handleSmartCopyWithText;

  // ── postMessage listener — one-time setup, uses refs for fresh state ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'vnc-extract-copy' || !e.data?.text) return;
      if (!scriptSessionRef.current) return;
      smartCopyRef.current(e.data.text.trim());
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Request current clipboard from the VNC iframe ─────────────
  // Sends a 'vnc-request-clipboard' message and waits up to 400ms for
  // the iframe to echo back 'vnc-clipboard-response' with whatever was
  // last copied in the remote browser.  Returns '' on timeout/empty.
  const requestVncClipboard = (timeoutMs = 400): Promise<string> =>
    new Promise((resolve) => {
      const tid = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve('');
      }, timeoutMs);
      const handler = (e: MessageEvent) => {
        if (e.data?.type !== 'vnc-clipboard-response') return;
        clearTimeout(tid);
        window.removeEventListener('message', handler);
        resolve((e.data.text ?? '').trim());
      };
      window.addEventListener('message', handler);
      vncIframeRef.current?.contentWindow?.postMessage({ type: 'vnc-request-clipboard' }, '*');
    });

  // ── Extract from URL (manual dialog — fallback) ────────────────
  // `prefill` lets the smart-copy path open the dialog with the clipboard
  // value already typed in when it can't auto-detect a URL match — so the
  // operator sees their copied value, can pick the right method
  // (query/path/match), or correct the value, instead of getting silently
  // dropped into a DOM text-extract step which doesn't look like
  // anything they asked for.
  const handleExtractUrl = async (prefill?: string) => {
    setUrlExtractValue(prefill ?? '');
    setUrlExtractFieldName('');
    // Fetch live URL before opening dialog
    if (runId && orgId) {
      // Race the live-URL fetch against a short timeout so a hung
      // network/worker doesn't lock the dialog open indefinitely.
      // 2s is generous for an in-region call; on timeout we fall back
      // to whatever pageUrl is already in stepRunState.
      try {
        const freshState = await Promise.race([
          getStepRun(orgId, runId),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        if (freshState?.pageUrl) setStepRunState((s) => s ? { ...s, pageUrl: freshState.pageUrl } : s);
      } catch { /* use cached */ }
    }
    setUrlExtractOpen(true);
  };

  /**
   * URL-extract entry point used by the toolbar's Extract URL button.
   *
   * Same detection logic as handleSmartCopyWithText (query param → path
   * segment → url_match) BUT differs in the fallback:
   *
   *   • Match found    → insert URL extract step (same as smart-copy)
   *   • No match found → open the manual URL Extract dialog WITH the
   *                      clipboard value pre-filled, so the operator
   *                      can fix the value or pick a method themselves.
   *
   * Critically does NOT silently insert a DOM text-extract — that's the
   * behavior smart-copy uses when the operator just hits Ctrl+C on
   * arbitrary page text (the user's intent is "extract whatever I copied"),
   * but here the operator explicitly clicked "Extract URL" and a DOM
   * extract would never match that intent.
   */
  const handleUrlExtractFromClipboard = async (clipText: string) => {
    if (!runId || !orgId) {
      void handleExtractUrl(clipText);
      return;
    }

    // Fetch live URL — same source of truth used by the manual dialog.
    // Race against a 2s timeout so a hung worker can't lock the operator
    // out of the extract flow. On timeout the dialog opens with the
    // clipboard pre-filled — operator can paste the URL manually.
    let liveUrl = '';
    try {
      const freshState = await Promise.race([
        getStepRun(orgId, runId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      liveUrl = freshState?.pageUrl ?? '';
      if (liveUrl) setStepRunState((s) => s ? { ...s, pageUrl: liveUrl } : s);
    } catch { /* fall through */ }

    if (!liveUrl) {
      // No URL to match against (fetch failed, timeout, or worker has
      // no page yet) → manual dialog with the clipboard pre-filled so
      // the operator can paste the URL or correct the value.
      void handleExtractUrl(clipText);
      return;
    }

    let method: 'query_param' | 'path_segment' | 'url_match' | null = null;
    let fieldName = '';
    let paramName = '';
    let pathIndex = 0;

    try {
      const parsed = new URL(liveUrl);
      for (const [key, val] of parsed.searchParams.entries()) {
        if (val === clipText) {
          method = 'query_param';
          paramName = key;
          fieldName = key;
          break;
        }
      }
      if (!method) {
        const segments = parsed.pathname.split('/').filter(Boolean);
        const idx = segments.indexOf(clipText);
        if (idx >= 0) {
          method = 'path_segment';
          pathIndex = idx;
          fieldName = idx > 0 ? `${segments[idx - 1].replace(/s$/, '')}_id` : `path_${idx}`;
        }
      }
    } catch { /* invalid URL */ }

    if (!method && liveUrl.includes(clipText)) {
      method = 'url_match';
      fieldName = 'extracted_value';
    }

    if (!method) {
      // No match — open the dialog pre-filled. Operator can either
      // correct the value (URL may have been re-encoded) or hit Cancel.
      toast.info(`"${clipText.slice(0, 30)}${clipText.length > 30 ? '…' : ''}" not found in URL — open dialog to choose method`);
      void handleExtractUrl(clipText);
      return;
    }

    const urlExtraction: RecordedStep['url_extraction'] =
      method === 'query_param'  ? { method, param_name: paramName } :
      method === 'path_segment' ? { method, path_index: pathIndex } :
                                  { method, match_value: clipText };

    const step: RecordedStep = {
      action: 'extract',
      selector: '__url__',
      field_name: fieldName,
      text: clipText,
      _defaultValue: clipText,
      url_extraction: urlExtraction,
    };

    const insertAt = stepRunState?.currentIndex ?? 0;
    setStepRunState((s) => {
      if (!s) return s;
      const newSteps = [...s.steps];
      newSteps.splice(insertAt, 0, step);
      return { ...s, steps: newSteps, totalSteps: newSteps.length };
    });
    setNewStepIndices((prev) => new Set([...prev, insertAt]));
    setHasChanges(true);
    if (runId && orgId) {
      const newSteps = [...(stepRunState?.steps ?? [])];
      newSteps.splice(insertAt, 0, step);
      syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
    }

    const label = method === 'query_param' ? `?${paramName}` : method === 'path_segment' ? `path[${pathIndex}]` : 'match';
    toast.success(`Extracted ${label} → {{${fieldName}}} = "${clipText}"`);
  };

  /** Analyze where a value appears in the URL and create the appropriate extract step. */
  const handleUrlExtractConfirm = () => {
    const val = urlExtractValue.trim();
    const currentUrl = stepRunState?.pageUrl ?? '';
    let autoFieldName = '';  // auto-detected from query param key

    if (!val) { toast.error('Enter the value to extract'); return; }

    let urlExtraction: RecordedStep['url_extraction'];

    // 1. Check query parameters first (most specific)
    try {
      const parsed = new URL(currentUrl);
      for (const [key, paramVal] of parsed.searchParams.entries()) {
        if (paramVal === val) {
          urlExtraction = { method: 'query_param', param_name: key };
          autoFieldName = key;
          break;
        }
      }
    } catch { /* invalid URL — skip query param check */ }

    // 2. Check path segments
    if (!urlExtraction) {
      try {
        const parsed = new URL(currentUrl);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const idx = segments.indexOf(val);
        if (idx >= 0) {
          urlExtraction = { method: 'path_segment', path_index: idx };
          autoFieldName = idx > 0 ? `${segments[idx - 1].replace(/s$/, '')}_id` : `path_${idx}`;
        }
      } catch { /* skip */ }
    }

    // 3. Fall back to exact string match
    if (!urlExtraction) {
      if (currentUrl.includes(val)) {
        urlExtraction = { method: 'url_match', match_value: val };
        autoFieldName = 'extracted_value';
      } else {
        toast.error(`"${val}" not found in the current URL`);
        return;
      }
    }

    // Use user-provided name, or auto-detected, or generic fallback
    const fieldName = urlExtractFieldName.trim() || autoFieldName || 'extracted_value';

    const step: RecordedStep = {
      action: 'extract',
      selector: '__url__',
      field_name: fieldName,
      text: val,
      _defaultValue: val,
      url_extraction: urlExtraction,
    };

    // Insert after current step index
    const insertAt = (stepRunState?.currentIndex ?? 0);
    setStepRunState((s) => {
      if (!s) return s;
      const newSteps = [...s.steps];
      newSteps.splice(insertAt, 0, step);
      return { ...s, steps: newSteps, totalSteps: newSteps.length };
    });
    setNewStepIndices((prev) => new Set([...prev, insertAt]));
    setHasChanges(true);
    if (runId && orgId) {
      const newSteps = [...(stepRunState?.steps ?? [])];
      newSteps.splice(insertAt, 0, step);
      syncStepRunSteps(orgId, runId, newSteps).catch(() => {});
    }
    setUrlExtractOpen(false);
    toast.success(`URL extract step added: ${urlExtraction.method === 'query_param' ? `?${urlExtraction.param_name}` : urlExtraction.method === 'path_segment' ? `path[${urlExtraction.path_index}]` : 'match'} → {{${fieldName}}}`);
  };

  /**
   * Insert a copy of the step at `stepIndex + 1`. Useful when the
   * operator wants to repeat an action with tweaked values without
   * re-recording. The duplicate carries forward everything including
   * the custom name (with a "(copy)" suffix so operators can spot the
   * pair in the list). Pushes the change through syncStepRunSteps so
   * the worker sees the new list immediately.
   */
  const handleDuplicateStep = async (stepIndex: number) => {
    if (!runId || !orgId || isRecording || isExecuting) return;
    const currentSteps = stepRunState?.steps ?? [];
    const source = currentSteps[stepIndex];
    if (!source) return;
    const copy: RecordedStep = {
      ...source,
      _tested: false, // duplicate hasn't been validated yet
      name: source.name?.trim() ? `${source.name.trim()} (copy)` : undefined,
    };
    const newSteps = [
      ...currentSteps.slice(0, stepIndex + 1),
      copy,
      ...currentSteps.slice(stepIndex + 1),
    ];
    setStepRunState((s) => s ? {
      ...s,
      steps: newSteps,
      totalSteps: newSteps.length,
    } : s);
    setNewStepIndices((prev) => {
      const next = new Set<number>();
      // Shift any existing markers >= insertion point up by one, then add the new index.
      for (const idx of prev) next.add(idx > stepIndex ? idx + 1 : idx);
      next.add(stepIndex + 1);
      return next;
    });
    setHasChanges(true);
    try {
      await syncStepRunSteps(orgId, runId, newSteps);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to duplicate step');
    }
  };

  // ── Unified save (stays in the session window) ───────────────
  const handleDeleteStep = async (stepIndex: number) => {
    if (!runId || !orgId || isRecording) return;
    try {
      const updatedState = await deleteStepRunStep(orgId, runId, stepIndex);
      setStepRunState((s) => s ? {
        ...s,
        steps:        updatedState.steps ?? s.steps,
        step:         updatedState.step ?? null,
        currentIndex: updatedState.currentIndex,
        totalSteps:   updatedState.totalSteps,
        status:       'waiting',
        done:         false,
      } : s);
      setEditedStep(updatedState.step ? JSON.stringify(updatedState.step, null, 2) : '');
      setStepEditError('');
      setHasChanges(true);
      // Clean up new-step indicators: remove the deleted index and shift higher ones down
      setNewStepIndices((prev) => {
        const next = new Set<number>();
        for (const idx of prev) {
          if (idx < stepIndex) next.add(idx);
          else if (idx > stepIndex) next.add(idx - 1);
          // idx === stepIndex is dropped
        }
        return next;
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete step');
    }
  };

  const handleSave = async () => {
    if (!orgId) return;

    // NOTE: there used to be an "auto-apply pending JSON edits" block here
    // that read `editedStep` (the legacy bottom-panel JSON editor's text),
    // parsed it, and overwrote stepRunState.steps[currentIndex] with the
    // result before saving. That editor moved into StepEditModal a while
    // back, but `editedStep` is still written-to by many callbacks (without
    // anyone reading it as a live edit source). The auto-apply was reading
    // a stale snapshot from BEFORE the StepEdit modal save and writing it
    // BACK over the user's edit — visible as the URL/value reverting the
    // moment the operator hit the main Save button. Removed.

    if (mode === 'record') {
      let steps = stepRunState?.steps ?? [];

      // Stop active recording first so the captured steps are included.
      if (isRecording && runId) {
        try {
          const res = await stopStepRunRecording(orgId, runId);
          setIsRecording(false);
          setLiveRecordedSteps([]);
          setNewStepIndices(new Set());
          steps = res.steps ?? steps;
          setStepRunState(s => s ? {
            ...s, totalSteps: res.totalSteps, steps,
            step: res.step ?? null, status: 'waiting', done: res.totalSteps === 0,
          } : s);
          setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
        } catch { /* proceed with whatever steps we have */ }
      }

      try {
        const name = scriptName.trim() || 'Untitled Script';
        const parameters = buildParameters(steps);

        if (tempScriptId) {
          // Already saved once — update in place. Persist the linked login
          // too (picked from the in-record-mode chip; held in linkedLoginId).
          await updateScript(orgId, tempScriptId, { name, description: scriptDescription || undefined, steps, parameters, test_values: {}, login_id: linkedLoginId });
        } else {
          // First save — create the script now, carrying any login linked
          // during recording so it sticks without a second round-trip.
          const created = await createScript(orgId, { name, steps, parameters, test_values: {}, login_id: linkedLoginId });
          setTempScriptId(created.id);
        }
        // Sync steps to the worker so jumps/executions use the saved version
        if (runId) await syncStepRunSteps(orgId, runId, steps).catch(() => {});
        toast.success('Script saved!');
        setHasSavedSession(true);
        setNewStepIndices(new Set()); // clear "new" indicators after save
        onSaved?.();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save');
      }
    } else {
      // Test mode — save edits to the original script.
      if (!script) return;
      const steps = stepRunState?.steps ?? [];
      try {
        await updateScript(orgId, script.id, { steps, parameters: buildParameters(steps), test_values: {}, description: scriptDescription || undefined });
        // Sync steps to the worker so jumps/executions use the saved version
        if (runId) await syncStepRunSteps(orgId, runId, steps).catch(() => {});
        setHasChanges(false);
        setNewStepIndices(new Set());
        toast.success('Changes saved!');
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save');
      }
    }
  };

  // ── Orphan session handlers ───────────────────────────────────
  const handleResumeOrphan = async () => {
    if (!orphanSession || !orgId) return;
    setResumingOrphan(true);
    try {
      const run = await getStepRun(orgId, orphanSession.runId);

      // Orphan is still provisioning — re-attach the poll and show the banner
      if (run.status === 'provisioning') {
        setOrphanSession(null);
        setResumingOrphan(false);
        provisioningModeRef.current = orphanSession.mode ?? 'test';
        setProvisioningRunId(orphanSession.runId);
        return;
      }

      setRunId(orphanSession.runId);
      setViewerUrl(`/live/run/${orphanSession.runId}`);
      setScriptName(scriptName || script?.name || '');
      setStepRunState({
        currentIndex: run.currentIndex ?? 0,
        totalSteps:   run.totalSteps ?? 0,
        step:         run.step ?? null,
        steps:        run.steps ?? [],
        screenshot:   run.lastScreenshot ?? null,
        extracted:    run.extracted ?? {},
        done:         run.status === 'done',
        status:       (run.status as 'waiting' | 'running' | 'error') ?? 'waiting',
      });
      if (run.recordingActive) setIsRecording(true);
      setOrphanSession(null);
    } catch {
      toast.error('Session is no longer available — starting fresh');
      clearActiveBrowserSession();
      setOrphanSession(null);
      if (mode === 'record') handleStartRecordSession();
      else if (script) {
        // Blank params every session — see startFresh() for rationale.
        setParams({});
        handleStartStepRun();
      }
    } finally {
      setResumingOrphan(false);
    }
  };

  const handleDiscardOrphan = async () => {
    if (!orphanSession || !orgId) return;
    setResumingOrphan(true);
    try {
      await abortStepRun(orgId, orphanSession.runId);
    } catch { /* already dead — fine */ }
    clearActiveBrowserSession();
    setOrphanSession(null);
    setResumingOrphan(false);
    // Now start fresh
    if (mode === 'record') handleStartRecordSession();
    else {
      setScriptName(script?.name ?? '');
      if (script) {
        // Blank params every session — see startFresh() for rationale.
        setParams({});
        handleStartStepRun();
      }
    }
  };

  const handleToggleRecording = async () => {
    if (!runId || !orgId) return;
    try {
      if (isRecording) {
        const res = await stopStepRunRecording(orgId, runId);
        setIsRecording(false);
        setLiveRecordedSteps([]);
        setStepRunState((s) => s ? { ...s, totalSteps: res.totalSteps, steps: res.steps ?? s.steps } : s);
        if (res.insertedCount > 0) {
          setHasSavedSession(false);
          setHasChanges(true);
          if (res.insertedStart != null) {
            setNewStepIndices(new Set(Array.from({ length: res.insertedCount }, (_, k) => res.insertedStart! + k)));
          }
        } else {
          toast.info('No new steps captured');
        }
      } else {
        setNewStepIndices(new Set());
        await startStepRunRecording(orgId, runId);
        setIsRecording(true);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Recording toggle failed');
    }
  };

  const handleApplyStepEdit = async () => {
    if (!runId || !orgId) return;
    let parsed: RecordedStep;
    try {
      parsed = JSON.parse(editedStep);
    } catch {
      setStepEditError('Invalid JSON');
      return;
    }
    try {
      const updatedState = await updateStepRunStep(orgId, runId, parsed);
      setStepRunState((s) => s ? { ...s, steps: updatedState.steps ?? s.steps, step: updatedState.step ?? s.step } : s);
      setEditedStep(updatedState.step ? JSON.stringify(updatedState.step, null, 2) : editedStep);
      setStepEditError('');
      setHasChanges(true);
    } catch (err: any) {
      setStepEditError(err?.response?.data?.error || err?.message || 'Failed to apply');
    }
  };

  // Auto-seed test values from _defaultValue on newly-recorded steps.
  // Must be before early returns to satisfy Rules of Hooks.
  const allVisibleSteps = [...(stepRunState?.steps ?? []), ...liveRecordedSteps];
  // Build a fingerprint of all _defaultValue entries so the effect fires when
  // new defaults appear (not just when step count changes).
  const defaultsFingerprint = allVisibleSteps
    .filter((s) => s._defaultValue)
    .map((s) => `${s.action}:${s.field_name ?? s.value ?? ''}:${s._defaultValue}`)
    .join('|');
  useEffect(() => {
    const newDefaults: Record<string, string> = {};
    for (const s of allVisibleSteps) {
      if (!s._defaultValue) continue;
      if (s.action === 'fill' && s.value) {
        const match = s.value.match(/^\{\{(\w+)\}\}$/);
        if (match && !params[match[1]]) newDefaults[match[1]] = s._defaultValue;
      }
      if (s.action === 'extract' && s.field_name && !params[s.field_name]) {
        newDefaults[s.field_name] = s._defaultValue;
      }
    }
    if (Object.keys(newDefaults).length > 0) {
      setParams((p) => ({ ...newDefaults, ...p }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsFingerprint]);

  // ── Derive Activity entries from replay progress ──────────────
  // Compares the latest stepRunState against the refs to emit one entry
  // per newly-completed step (with any new extracted keys), a "▶" entry
  // when a step starts running, and an error entry on failure. Recording
  // never produces replay activity. Refs are reset by startReplayActivity()
  // at the top of each run/replay so a re-run logs from the top again.
  useEffect(() => {
    if (!stepRunState || isRecording) return;
    const steps = stepRunState.steps ?? [];
    const labelFor = (idx: number) => {
      const s = steps[idx];
      return s ? stepLabel(s) : `Step ${idx + 1}`;
    };

    // Newly-completed steps: log a ✓ for every index between the last
    // logged one and the current cursor.
    if (stepRunState.currentIndex > lastLoggedIndexRef.current) {
      for (let idx = lastLoggedIndexRef.current; idx < stepRunState.currentIndex; idx++) {
        pushActivity('done', `✓ Step ${idx + 1}: ${labelFor(idx)}`);
      }
      lastLoggedIndexRef.current = stepRunState.currentIndex;
      // Surface any extracted keys that appeared since we last looked.
      const extracted = stepRunState.extracted ?? {};
      for (const [k, v] of Object.entries(extracted)) {
        if (lastExtractedRef.current[k] !== v) {
          pushActivity('done', `→ ${k} = ${v}`);
        }
      }
      lastExtractedRef.current = { ...extracted };
    }

    // Step currently running — log "▶" once per index.
    if (
      stepRunState.status === 'running' &&
      !stepRunState.done &&
      runningLoggedRef.current !== stepRunState.currentIndex
    ) {
      runningLoggedRef.current = stepRunState.currentIndex;
      pushActivity('step', `▶ Step ${stepRunState.currentIndex + 1}: ${labelFor(stepRunState.currentIndex)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepRunState?.currentIndex, stepRunState?.status, stepRunState?.done, stepRunState?.extracted, isRecording]);

  // ── Gate-pause activity ────────────────────────────────────────
  useEffect(() => {
    if (pendingGateIndex === null) { lastGateLoggedRef.current = null; return; }
    if (lastGateLoggedRef.current === pendingGateIndex) return;
    lastGateLoggedRef.current = pendingGateIndex;
    const s = stepRunState?.steps?.[pendingGateIndex];
    pushActivity('gate', `⏸ Awaiting approval: ${s ? stepLabel(s) : `Step ${pendingGateIndex + 1}`}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingGateIndex]);

  // ── Auto-scroll the Activity feed to the newest entry ──────────
  useEffect(() => {
    const el = activityScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const isExecuting = stepRunState?.status === 'running' || starting;
  // ── Bottom-tab derivations ────────────────────────────────────
  // aiBusy: an Improve (refine) call is in flight. replayRunning: the
  // step-run worker is actively executing (single-step or agent run).
  // The Activity tab only appears in the strip while one of these is
  // true; if the user is parked on Activity when it disappears we fall
  // back to Variables for rendering so a hidden tab never shows blank.
  const aiBusy = refining;
  const replayRunning = stepRunState?.status === 'running';
  // The Activity tab is present while work is live AND once there's a log to
  // review — so a quick single step (which we no longer auto-focus) still
  // leaves the tab reachable instead of flashing and vanishing. It's cleared
  // on session reset, so a fresh session shows no Activity tab.
  const showActivityTab = aiBusy || replayRunning || activity.length > 0;
  // Fall back to Variables when parked on a now-hidden Activity tab so a
  // hidden tab never renders blank content.
  const effectiveBottomTab =
    bottomTab === 'activity' && !showActivityTab ? 'variables' : bottomTab;
  const isRecordMode = mode === 'record';
  // No separate params form — variables are always edited inline in the Variables Panel
  const hasSteps = (stepRunState?.totalSteps ?? 0) > 0 || (stepRunState?.steps?.length ?? 0) > 0;

  // ── Derived: does exit need a warning? ────────────────────────
  const needsExitWarning =
    (isRecording && liveRecordedSteps.length > 0) ||
    (isRecordMode && !hasSavedSession && (stepRunState?.steps?.length ?? 0) > 0) ||
    (!isRecordMode && hasChanges);
  // Keep in sync with a ref so the capture-phase nav guard (inside useEffect) always
  // sees the latest value without a stale closure.
  needsExitWarnRef.current = needsExitWarning;

  // ── Unified step list source ───────────────────────────────────
  // base = already-committed steps (finalized); live = captured during active recording
  const baseSteps = stepRunState?.steps ?? (isRecordMode ? [] : script?.steps ?? []);
  // When recording with no base steps yet (first recording session), show live steps directly
  const showLiveDirectly = isRecording && baseSteps.length === 0;
  const stepsToShow = showLiveDirectly ? liveRecordedSteps : baseSteps;
  const stepCount = showLiveDirectly
    ? liveRecordedSteps.length
    : (stepRunState?.totalSteps ?? script?.steps?.length ?? 0);

  // A step needs selector review if it has multiple candidates (untested) or
  // has a selector but no candidates (picker-added wait_for, untested).
  // A step needs selector review if it targets an element and hasn't been
  // tested yet. The _tested flag is set by the worker after successful execution.
  const needsSelectorReview = (s: RecordedStep) => {
    if (s.action === 'navigate' || s.action === 'press_key') return false;
    const sel = s.selector ?? s.waitFor?.selector;
    if (!sel || sel === 'body') return false;
    return !s._tested;
  };

  const portal = createPortal(
    <div className="fixed z-50 inset-0 md:left-64 bg-background flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 h-12 border-b bg-background shrink-0">

        {/* Left: status dot + editable name + progress */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Status dot */}
          {starting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : isProvisioning ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          ) : stepRunState?.done ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          ) : stepRunState?.status === 'error' ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          ) : isRecording ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          ) : isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-brand shrink-0" />
          ) : (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
            </span>
          )}

          {/* Editable name + description toggle */}
          <div className="flex flex-col min-w-0">
            <input
              className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-border rounded px-1 min-w-0 w-52"
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              onBlur={handleSaveScriptName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="Script name…"
              disabled={starting}
            />
            {showDescription ? (
              <input
                className="text-[10px] text-muted-foreground bg-transparent border-none outline-none focus:ring-1 focus:ring-border rounded px-1 min-w-0 w-52"
                value={scriptDescription}
                onChange={(e) => setScriptDescription(e.target.value)}
                onBlur={() => { if (!scriptDescription.trim()) setShowDescription(false); }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                placeholder="Add a description…"
                autoFocus
              />
            ) : (
              <button
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground px-1 text-left transition-colors"
                onClick={() => setShowDescription(true)}
              >
                {scriptDescription || '+ Add description'}
              </button>
            )}
          </div>

          {/* Linked login — chip + Log in button. Available in BOTH record
              and test mode: in record mode the choice is held in
              linkedLoginId and persisted on Save (createScript carries
              login_id); in test mode it's persisted immediately. Linking
              also offers to restart the browser with the login's profile —
              see handleSetLinkedLogin. */}
          {(mode === 'record' || script?.id) && (
            <div className="flex items-center gap-1.5 shrink-0">
              <DropdownMenu open={loginPickerOpen} onOpenChange={setLoginPickerOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border transition-colors',
                      linkedLogin
                        ? 'border-brand/30 bg-brand/5 text-brand hover:bg-brand/10'
                        : 'border-dashed border-border text-muted-foreground hover:bg-muted/40'
                    )}
                    title={linkedLogin ? `Linked to: ${linkedLogin.name}` : 'No login linked — click to link one'}
                  >
                    <KeyRound className="h-3 w-3" />
                    <span className="max-w-[140px] truncate">
                      {linkedLogin?.name ?? 'Link login'}
                    </span>
                    {linkedLogin && <ChevronRight className="h-3 w-3 rotate-90 opacity-60" />}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {availableLogins.length === 0 ? (
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      No logins configured for this org
                    </DropdownMenuItem>
                  ) : (
                    <>
                      {availableLogins.map((l) => (
                        <DropdownMenuItem
                          key={l.id}
                          onSelect={() => handleSetLinkedLogin(l.id)}
                          className="text-xs"
                        >
                          {l.id === linkedLoginId && <CheckCircle2 className="h-3 w-3 mr-1.5 text-brand" />}
                          <span className="truncate">{l.name}</span>
                        </DropdownMenuItem>
                      ))}
                      {linkedLoginId && (
                        <DropdownMenuItem
                          onSelect={() => handleSetLinkedLogin(null)}
                          className="text-xs text-destructive border-t mt-1 pt-1.5"
                        >
                          <X className="h-3 w-3 mr-1.5" /> Unlink
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Only render the Log in button when the linked login
                  actually has auto-login configured (both an
                  auto_login_script_id AND credentials_secret_id). A
                  disabled-but-visible button was confusing — operators
                  thought it should work and clicked it. If the linked
                  login isn't auto-loginable, the chip alone signals the
                  association and the operator can either configure
                  auto-login on the Logins page or just manually
                  authenticate inside the browser preview. */}
              {linkedLogin && canAutoLogin && (
                <button
                  type="button"
                  onClick={handleLogInWithLinkedLogin}
                  disabled={loggingIn || !runId || !!isRecording}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-border hover:bg-muted/40 text-foreground transition-colors',
                    loggingIn && 'opacity-60 cursor-wait',
                  )}
                  title="Run the linked login's auto-login flow in this browser"
                >
                  {loggingIn
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <LogIn className="h-3 w-3" />}
                  Log in
                </button>
              )}
            </div>
          )}

          {/* Recording indicator stays so operators see when capture is
              live; the N/M step counter is gone (the inline step list
              already shows current position more usefully). */}
          {isRecording && (
            <span className="text-xs text-red-500/70 shrink-0">Recording…</span>
          )}
        </div>

        {/* Right: actions ─────────────────────────────────────────
            "Mode" + "Action" labeled dropdowns. Mode picks Test / Record /
            Extract; Action lists that mode's actions. The Run trigger lives
            in the Steps header (below) so this toolbar never shifts, and the
            Action control becomes a Stop / Cancel button while an action
            runs. */}
        <div className="flex items-center gap-1.5 shrink-0">

          {runId && (
            <ModeActionPicker
              toolMode={toolMode}
              setToolMode={setToolMode}
              runMode={runMode}
              isRecording={isRecording}
              isCapturingWaitFor={isCapturingWaitFor}
              isCapturingExtract={isCapturingExtract}
              isExecuting={isExecuting}
              disabled={starting}
              onSelectStep={() => setRunMode('step')}
              onSelectAgent={() => setRunMode('agent')}
              onStartRecording={handleToggleRecording}
              onStopRecording={isRecordMode ? handleStopRecordSession : handleToggleRecording}
              onSelectRecordWait={handleAddWaitStep}
              onCancelWait={() => {
                captureAbortRef.current?.abort();
                captureAbortRef.current = null;
                cancelStepRunWaitForCapture(orgId!, runId!).catch(() => {});
                setIsCapturingWaitFor(false);
              }}
              onSelectAddPause={handleAddPauseStep}
              onSelectExtractElement={handleAddExtractStep}
              onCancelExtract={() => {
                captureExtractAbortRef.current?.abort();
                captureExtractAbortRef.current = null;
                cancelStepRunExtractCapture(orgId!, runId!).catch(() => {});
                setIsCapturingExtract(false);
              }}
              onSelectExtractUrl={async () => {
                const clip = await requestVncClipboard();
                if (clip) await handleUrlExtractFromClipboard(clip);
                else await handleExtractUrl();
              }}
              onSelectCopyPage={async () => {
                const clip = await requestVncClipboard();
                if (clip) {
                  handleSmartCopyWithText(clip);
                } else {
                  toast.info(isRecording
                    ? 'Nothing copied yet — select and copy text on the page first'
                    : 'Start recording, then copy any text on the page to extract it'
                  );
                }
              }}
            />
          )}

          {/* Save — always visible, but gated until the session is actually
              ready. Saving while the VM is still provisioning (or before
              the step-run has been initialised on the worker) hits the
              backend with whatever local steps state happens to be loaded,
              which can wipe the script's persisted steps when the operator
              has a pre-existing script open and the VM hasn't connected yet.
              The hook to "is there a real session backing this UI?" is
              `runId` — if it's null we're either pre-allocation or still
              provisioning. */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={isExecuting || isRecording || isProvisioning || starting || !runId}
            title={
              !runId || isProvisioning || starting
                ? 'Waiting for the browser session to start — save unlocks once it is ready'
                : 'Save'
            }
          >
            <Save className="h-3.5 w-3.5" />
          </Button>

          {/* Exit — always (X icon); enabled even during provisioning so user can leave */}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleExit} disabled={starting && !isProvisioning} title="Exit">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Main area: VNC + right panel ────────────────────── */}
      <div className="flex-1 min-h-0 flex">

        {/* VNC (or orphan recovery prompt) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {isProvisioning ? (
            <ProvisioningNotice elapsedMs={provisioningElapsedMs} />
          ) : (checkingOrphan || orphanSession) ? (
            <div className="w-full h-full flex items-center justify-center">
              {checkingOrphan ? (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">Checking for existing session…</p>
                </div>
              ) : orphanSession ? (
                <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
                  <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Active browser session found</p>
                    <p className="text-xs text-muted-foreground">
                      A previous session is still running. You can resume where you left off or close it and start fresh.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDiscardOrphan}
                      disabled={resumingOrphan}
                    >
                      {resumingOrphan ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Close & start fresh
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleResumeOrphan}
                      disabled={resumingOrphan}
                    >
                      {resumingOrphan ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Resume session
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : viewerUrl ? (
            <iframe
              ref={vncIframeRef}
              src={`${agentApiUrl}${viewerUrl}`}
              className="w-full h-full border-0 block"
              scrolling="no"
              title="Browser"
              allow="clipboard-read; clipboard-write"
            />
          ) : isProvisioning ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin opacity-50" />
              <p className="text-sm">Starting browser{provisioningElapsedMs > 60_000 ? ' — taking a little longer than usual' : ' — typically 10–60 seconds'}…</p>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
        </div>

        {/* Right panel — collapsible */}
        <div className={`relative flex shrink-0 transition-[width] duration-200 ease-in-out ${stepsCollapsed ? 'w-0' : 'w-[480px]'}`}>
          {/* Collapse/expand tab on left edge */}
          <button
            onClick={() => setStepsCollapsed((c) => !c)}
            className="absolute -left-6 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-12 rounded-l-md border border-r-0 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
            title={stepsCollapsed ? 'Show steps' : 'Hide steps'}
          >
            {stepsCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
          </button>

          <div className={`flex flex-col overflow-hidden bg-background w-[480px] shrink-0 border-l transition-opacity duration-150 ${stepsCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>

          {/* ── Unified step list (record + test + review) ── */}
          {(
            <>
              <div className="px-3 py-2 border-b shrink-0">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                      {`Steps (${stepCount})`}
                    </p>
                    {(() => {
                      const unresolvedCount = stepsToShow.filter(needsSelectorReview).length;
                      if (unresolvedCount === 0) return null;
                      return (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" title={`${unresolvedCount} step${unresolvedCount !== 1 ? 's' : ''} with multiple selector candidates. Run each step to auto-select the best selector.`}>
                          <AlertTriangle className="h-3 w-3" />
                          {unresolvedCount} unresolved
                        </span>
                      );
                    })()}
                  </div>

                  {/* Run controls live HERE (not the top toolbar) so the
                      toolbar's Mode/Action dropdowns never shift when the
                      run button appears or swaps to Stop. Test mode only —
                      Record / Extract fire + cancel from the Action picker. */}
                  {runId && toolMode === 'test' && (
                    isExecuting ? (
                      // Bright red Stop — matches the active-mode stop button in
                      // the toolbar (green start ↔ red stop convention).
                      <Button size="sm" className="h-7 w-28 shrink-0 justify-center bg-red-600 text-white hover:bg-red-700" onClick={handleStopAutoRun}>
                        <X className="mr-1.5 h-3 w-3" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 w-28 shrink-0 justify-center bg-green-600 text-white hover:bg-green-700"
                        onClick={() => runMode === 'agent' ? handleRunAgentMode() : handleExecuteStep()}
                        disabled={isRecording || isCapturingWaitFor || isCapturingExtract || !hasSteps || !!stepRunState?.done}
                        title={stepRunState?.done ? 'Run complete — click any step to re-run from there.' : undefined}
                      >
                        {runMode === 'agent'
                          ? <Zap className="mr-1.5 h-3.5 w-3.5" />
                          : <Play className="mr-1.5 h-3 w-3 fill-current" />}
                        {runMode === 'agent' ? 'Run' : 'Run Step'}
                      </Button>
                    )
                  )}
                </div>
              </div>

              <div
                ref={stepListRef}
                className="flex-1 overflow-y-auto divide-y text-xs min-h-0"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (isExecuting || isRecording || !stepRunState || stepRunState.done) return;
                  const max = (stepRunState.steps?.length ?? 0) - 1;
                  if (max < 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = Math.min(stepRunState.currentIndex + 1, max);
                    if (next !== stepRunState.currentIndex) handleJumpToStep(next);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = Math.max(stepRunState.currentIndex - 1, 0);
                    if (prev !== stepRunState.currentIndex) handleJumpToStep(prev);
                  }
                }}
              >

                {/* Empty-state while recording hasn't captured anything yet (or still connecting) */}
                {isRecordMode && stepsToShow.length === 0 && (starting || isRecording) && (
                  <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground text-center px-4 py-16">
                    {starting ? (
                      <Loader2 className="h-6 w-6 animate-spin opacity-40" />
                    ) : (
                      <>
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                        <span className="text-sm">Recording — interact with the browser</span>
                        <span className="text-xs opacity-60">Steps appear as you act</span>
                      </>
                    )}
                  </div>
                )}


                {/* Unified step list — same display logic for both record and test modes */}
                {stepsToShow.map((s, i) => {
                  // Current/completed highlighting only applies when NOT actively recording
                  const isCurrent   = !isRecording && stepRunState ? (i === stepRunState.currentIndex && !stepRunState.done) : false;
                  const isCompleted = !isRecording && stepRunState ? i < stepRunState.currentIndex : false;
                  // ── Live per-step replay status ──────────────────────
                  // Derived purely from stepRunState (currentIndex/status) +
                  // pendingGateIndex so the rows visibly track a running
                  // replay. Recording mode never shows replay status.
                  //   done  → i < currentIndex
                  //   running → i === currentIndex && status==='running'
                  //   awaiting → i === pendingGateIndex (or current+awaiting)
                  //   failed → i === currentIndex && status==='error'
                  //   pending → otherwise
                  const rowStatus: 'done' | 'running' | 'awaiting' | 'failed' | 'pending' =
                    isRecording || !stepRunState ? 'pending' :
                    pendingGateIndex === i ? 'awaiting' :
                    i < stepRunState.currentIndex ? 'done' :
                    (i === stepRunState.currentIndex && !stepRunState.done && stepRunState.status === 'running') ? 'running' :
                    (i === stepRunState.currentIndex && !stepRunState.done && stepRunState.status === 'error') ? 'failed' :
                    'pending';
                  // Show recording position + live steps BEFORE the current step (after last executed).
                  // currentIndex > 0: show after the last executed step (i === currentIndex - 1).
                  // currentIndex === 0: handled by the header element above the map.
                  // Show recording insertion indicator AFTER the current step
                  const showLiveInsert = isRecording && !showLiveDirectly && stepRunState &&
                    i === stepRunState.currentIndex;
                  const isJumping   = jumpingTo === i;
                  const isHovered   = hoveredStep === i && !isExecuting && !isRecording;
                  // Steps impacted by the variable being hovered/edited in the
                  // Variables panel (reverse of the step→variable hover).
                  const isVarHighlighted = highlightVarSteps?.has(i) ?? false;
                  return (
                    <div key={i}>
                      <div
                        className={cn(
                          'min-h-7 py-1 flex items-center gap-1.5 group relative',
                          isRecording ? 'px-3' : 'px-1.5 cursor-pointer',
                          isCurrent  ? 'bg-brand/10 font-medium' : 'text-muted-foreground',
                          isVarHighlighted && 'bg-purple-500/10 ring-1 ring-inset ring-purple-400/40',
                          isHovered && !isCurrent && !isVarHighlighted && 'bg-muted/40',
                          // Live replay status accents — subtle left border +
                          // tinted background so the running/failed/awaiting row
                          // stands out while a test replay walks the list.
                          rowStatus === 'running' && 'bg-brand/5 border-l-2 border-brand',
                          rowStatus === 'failed' && 'bg-danger/5 border-l-2 border-danger',
                          rowStatus === 'awaiting' && 'border-l-2 border-amber-500',
                          !isRecording && dropStepIdx === i && dragStepIdx !== i && 'border-t-2 border-brand',
                        )}
                        draggable={!isExecuting && !isRecording}
                        onDragStart={isRecording ? undefined : () => setDragStepIdx(i)}
                        onDragEnd={isRecording ? undefined : () => { setDragStepIdx(null); setDropStepIdx(null); }}
                        onDragOver={isRecording ? undefined : (e) => { e.preventDefault(); setDropStepIdx(i); }}
                        onDrop={isRecording ? undefined : () => handleDropStep(i)}
                        onMouseEnter={() => setHoveredStep(i)}
                        onMouseLeave={() => setHoveredStep(null)}
                        onClick={() => {
                          if (inlineRenameIndex === i) return; // mid-rename, ignore
                          // Click jumps to that step. When the run is
                          // complete, clicking effectively rewinds and
                          // re-runs from there (handleJumpToStep clears
                          // the done flag and replays from the target).
                          // Selection is handled exclusively by the row's
                          // always-on checkbox (which stops propagation).
                          if (!isCurrent && !isExecuting && !isRecording) handleJumpToStep(i);
                        }}
                        onDoubleClick={(e) => {
                          // Double-click anywhere on the row (except the name —
                          // that double-click starts inline rename instead) opens
                          // the full step-edit modal. Convenience shortcut for the
                          // pencil button, which is hidden until hover.
                          if (isExecuting || isRecording) return;
                          e.stopPropagation();
                          setEditingStepIndex(i);
                        }}
                      >
                        {/* Drag handle — only in test mode (hidden while recording),
                            revealed on row hover so default rows stay clean. The drag
                            listeners live on the row container, so hiding the handle
                            visually doesn't affect reorder. */}
                        {!isRecording && (
                          <div className={cn(
                            'cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                            isExecuting && 'invisible'
                          )}>
                            <GripVertical className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {/* Step number — the index is ALWAYS shown (variables
                            reference step numbers, so they must stay visible).
                            A live replay status icon (running / failed /
                            awaiting) overlays it transiently during a test run;
                            otherwise the number, with a small green check tucked
                            beside completed steps. */}
                        <span className="w-5 shrink-0 text-right tabular-nums flex items-center justify-end">
                          {rowStatus === 'running' ? (
                            <Loader2 className="h-3.5 w-3.5 text-brand animate-spin" />
                          ) : rowStatus === 'failed' ? (
                            <XCircle className="h-3.5 w-3.5 text-danger" />
                          ) : rowStatus === 'awaiting' ? (
                            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                          ) : (isCompleted || rowStatus === 'done') ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <>{i + 1}</>
                          )}
                        </span>
                        {inlineRenameIndex === i ? (
                          <input
                            autoFocus
                            value={inlineRenameValue}
                            onChange={(e) => setInlineRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitInlineRename(i, inlineRenameValue);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setInlineRenameIndex(null);
                              }
                            }}
                            onBlur={() => commitInlineRename(i, inlineRenameValue)}
                            placeholder={autoStepLabel(s)}
                            className="flex-1 min-w-0 bg-transparent border-b border-brand/60 outline-none px-0 py-0 text-xs"
                          />
                        ) : (
                          <span
                            className="truncate flex-1 cursor-text"
                            title="Double-click to rename"
                            onDoubleClick={(e) => {
                              // Double-click on the name span starts inline
                              // rename. stopPropagation prevents the row's
                              // own onDoubleClick from opening the edit modal.
                              if (isExecuting || isRecording) return;
                              e.stopPropagation();
                              setInlineRenameValue(s.name ?? '');
                              setInlineRenameIndex(i);
                            }}
                          >
                            {stepLabel(s)}
                          </span>
                        )}
                        {/* iframe badge — flags steps that run inside an
                            iframe so operators can tell at a glance. The
                            actual frame_selector is visible in the JSON tab. */}
                        {s.frame_selector && (
                          <span
                            className="shrink-0 px-1 py-0 rounded text-[8px] uppercase tracking-wide font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30"
                            title={`Runs inside iframe: ${s.frame_selector}`}
                          >
                            iframe
                          </span>
                        )}
                        {/* Approval-gate marker — step pauses for human approval. */}
                        {s.requires_approval && (
                          <span
                            className="shrink-0 inline-flex items-center"
                            title="Needs approval — replay pauses here for a human to approve before running"
                          >
                            <ShieldAlert className="h-3 w-3 text-amber-500" />
                          </span>
                        )}
                        {/* Reliability dot from the AI refine pass (display-only). */}
                        {s._reliability && (
                          <ReliabilityBadge tier={s._reliability.tier} risks={s._reliability.risks} />
                        )}
                        {/* Actions: edit / duplicate / delete collapsed into an
                            always-visible ⋮ menu + selector warning (persistent). */}
                        <div className="ml-auto shrink-0 flex items-center gap-1">
                          {needsSelectorReview(s) && (
                            <span title="Selector needs review — run this step to auto-select"><AlertTriangle className="h-3 w-3 text-amber-500" /></span>
                          )}
                          <RowActionsMenu
                            title="Step actions"
                            triggerClassName="h-6 w-6 p-0"
                            actions={[
                              {
                                label: 'Edit',
                                icon: <Pencil className="h-4 w-4" />,
                                onSelect: () => setEditingStepIndex(i),
                              },
                              {
                                label: 'Duplicate',
                                icon: <Copy className="h-4 w-4" />,
                                onSelect: () => handleDuplicateStep(i),
                              },
                              {
                                label: 'Delete',
                                icon: <Trash2 className="h-4 w-4" />,
                                onSelect: () => handleDeleteStep(i),
                                destructive: true,
                              },
                            ]}
                          />
                        </div>
                      </div>
                      {/* Approval-gate prompt — replay paused at this gated step. */}
                      {pendingGateIndex === i && (
                        <div className="px-3 py-2 flex items-center gap-2 bg-amber-500/10 border-y border-amber-500/30">
                          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Approval required</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              “{stepLabel(s)}” needs approval before it runs.
                            </p>
                          </div>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); handleDenyGate(); }}>
                            Deny
                          </Button>
                          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={(e) => { e.stopPropagation(); handleApproveGate(); }}>
                            Approve
                          </Button>
                        </div>
                      )}
                      {/* Recording insertion point — shown after the current step */}
                      {showLiveInsert && (
                        <>
                          <div className="px-3 py-1 flex items-center gap-2 bg-red-500/5 border-y border-red-500/15">
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                            </span>
                            <span className="text-xs text-red-400">Recording — steps insert here</span>
                          </div>
                          {liveRecordedSteps.map((r, ri) => (
                            <div key={`rec-${ri}`} className="min-h-7 px-3 py-1 flex items-center gap-2 text-muted-foreground bg-red-500/5">
                              <Plus className="h-3 w-3 shrink-0 text-green-500" />
                              <span className="truncate flex-1">{stepLabel(r)}</span>
                              {r.frame_selector && (
                                <span
                                  className="shrink-0 px-1 py-0 rounded text-[8px] uppercase tracking-wide font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                  title={`Runs inside iframe: ${r.frame_selector}`}
                                >
                                  iframe
                                </span>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Test mode starting placeholder */}
                {!isRecordMode && !stepRunState && starting && (
                  <div className="flex items-center justify-center h-16 text-xs text-muted-foreground gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />Starting…
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="border-t px-3 py-2 shrink-0">
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}
                  </p>
                </div>
              )}

              {/* ── Single tabbed bottom panel ──────────────────────
                  One compact strip (Variables / Ask AI / Activity) over a
                  fixed-height scroll area showing the active tab. Activity
                  only appears in the strip while a run or AI action is in
                  flight; the effective tab falls back to Variables if the
                  user was parked on a now-hidden Activity tab. ── */}
              {/* Bottom panel — visually separated from the steps above with a
                  distinct surface + a soft top shadow so the divide is clear. */}
              <div className="shrink-0 flex flex-col border-t border-border bg-muted/30 shadow-[0_-10px_24px_-16px_rgba(0,0,0,0.4)]">
                <div className="h-72 overflow-y-auto bg-background">
                  {/* Variables tab */}
                  {effectiveBottomTab === 'variables' && (() => {
                    const vars = analyzeVariables(stepsToShow);
                    return (
                      <VariablesPanel
                        variables={vars}
                        params={params}
                        onParamsChange={setParams}
                        onRenameVariable={handleRenameVariable}
                        onDeleteVariable={handleDeleteVariable}
                        hoveredStep={hoveredStep}
                        onHoverVariable={setHighlightVarSteps}
                      />
                    );
                  })()}

                  {/* Ask AI tab — one instruction (aiPrompt) steering a single
                      Improve action that cleans up the recorded steps offline. */}
                  {effectiveBottomTab === 'ai' && (
                    <div className="px-3 py-3 bg-brand/[0.03] space-y-2.5">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-brand mt-1 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium">Ask AI · Test &amp; Improve</p>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            <span className="text-foreground">Test &amp; Improve</span> walks the whole script live in this browser — running each step with your Variables so it doubles as a test, pausing for approval before any submit, and rewriting selectors against the real page. If a referenced Variable has no value, it stops before running. When it finishes it tidies up — naming steps, renaming variables, dropping unused ones, and creating variables from values when you ask (e.g. “create a variable for step 4’s value”). <span className="text-foreground">Name a step</span> in the box (e.g. “just step 7”) to run &amp; improve only that step on the current page.
                          </p>
                        </div>
                      </div>
                      {aiWalking && (
                        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-300">
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          <span>Walking the script live — editing is locked. Use <span className="font-medium">Stop</span> to cancel.</span>
                        </div>
                      )}
                      <Input
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !refining && !aiWalking && hasSteps) handleImprove(); }}
                        placeholder='Steer it — e.g. “just step 7”, “the date field moved”, “don’t rename variables”'
                        className="h-8 text-xs"
                        disabled={refining || aiWalking}
                      />
                      <div className="flex items-center gap-1.5">
                        {/* Primary: Test & Improve — live walk in the run's browser. */}
                        <Button
                          size="sm"
                          className="h-7 flex-1 justify-center"
                          onClick={() => handleImprove()}
                          disabled={refining || aiWalking || !hasSteps}
                        >
                          {refining || aiWalking
                            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                          Test &amp; Improve
                        </Button>
                      </div>
                      {/* Reliability summary from the last improve pass. */}
                      {refineSummary && !refining && (
                        <div className="flex items-start gap-1.5 rounded-md border bg-background px-2 py-1.5">
                          {refineOverall && (
                            <Badge
                              variant={refineOverall === 'reliable' ? 'success' : refineOverall === 'fragile' ? 'danger' : 'warning'}
                              className="shrink-0 text-[9px] px-1.5 py-0 uppercase"
                            >
                              {refineOverall}
                            </Badge>
                          )}
                          <p className="text-[10px] text-muted-foreground leading-snug">{refineSummary}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Activity tab — live log of replay / AI progress. Only
                      reachable while work is in flight (showActivityTab).
                      Auto-scrolls via activityScrollRef. */}
                  {effectiveBottomTab === 'activity' && (
                    <div className="px-3 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</span>
                        {activity.length > 0 && (
                          <button
                            type="button"
                            className="text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors"
                            onClick={() => setActivity([])}
                            title="Clear activity"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div
                        ref={activityScrollRef}
                        className="overflow-y-auto font-mono text-[10px] leading-relaxed space-y-0.5"
                      >
                        {activity.map((a) => (
                          <div
                            key={a.id}
                            className={cn(
                              'whitespace-pre-wrap break-words',
                              a.kind === 'done'  && 'text-green-600 dark:text-green-400',
                              a.kind === 'error' && 'text-destructive',
                              a.kind === 'gate'  && 'text-amber-600 dark:text-amber-400',
                              a.kind === 'ai'    && 'text-brand',
                              a.kind === 'step'  && 'text-muted-foreground',
                            )}
                          >
                            {a.text}
                          </div>
                        ))}
                        {activity.length === 0 && (
                          <p className="text-muted-foreground/50 italic">Running…</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* Tab strip at the BOTTOM of the panel — the active tab
                    connects upward to the content above it. */}
                <div className="flex items-center gap-0.5 px-2 py-1 border-t border-border">
                  {([
                    { id: 'variables' as const, label: 'Variables' },
                    { id: 'ai' as const, label: 'Ask AI' },
                    ...(showActivityTab ? [{ id: 'activity' as const, label: 'Activity' }] : []),
                  ]).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setBottomTab(t.id)}
                      className={cn(
                        'flex items-center gap-1 rounded-b px-2.5 py-1 text-[11px] font-medium transition-colors',
                        effectiveBottomTab === t.id
                          ? 'bg-background text-foreground border border-t-0'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t.id === 'ai' && <Sparkles className="h-3 w-3 text-brand" />}
                      {t.label}
                      {t.id === 'activity' && (aiBusy || replayRunning) && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

  // Variable name set for the step-edit modal's JSON tab.
  const editModalVarNames = (() => {
    const v = analyzeVariables(stepRunState?.steps ?? []);
    return [...new Set([...v.keys(), ...Object.keys(params).filter((k) => !v.has(k))])];
  })();

  return (
    <>
      {portal}

      {/* Step edit modal — opened by the pencil button on a step row.
          Consolidates name, selector, and JSON editing in one place so
          the right-rail bottom panel can stay pinned to Variables. */}
      <StepEditModal
        step={editingStepIndex != null ? (stepRunState?.steps?.[editingStepIndex] ?? null) : null}
        stepIndex={editingStepIndex ?? 0}
        open={editingStepIndex != null}
        onClose={() => setEditingStepIndex(null)}
        variableNames={editModalVarNames}
        onSave={async (updated) => {
          if (editingStepIndex == null) return;
          const idx = editingStepIndex;
          // Compute the new step list once, in a regular variable — used for
          // the React state update, the worker sync, AND the persistent DB
          // update below. Avoid mutating anything inside setStepRunState's
          // updater: React requires the updater to be pure (it may run
          // multiple times under StrictMode or be skipped under bail-out),
          // so capturing values via side effects inside it is unreliable.
          const newSteps = [...(stepRunState?.steps ?? [])];
          newSteps[idx] = updated;
          // Functional updater so we compose against the latest s — if any
          // concurrent state change touched OTHER steps, they're preserved.
          // For the step being edited we always win (operator's intent).
          setStepRunState((s) => {
            if (!s) return s;
            const merged = [...s.steps];
            merged[idx] = updated;
            return {
              ...s,
              steps: merged,
              step: idx === s.currentIndex ? updated : s.step,
            };
          });
          setHasChanges(true);
          if (!orgId) return;
          // Two-tier persist:
          //   1. syncStepRunSteps — pushes the new step list into the
          //      worker's in-memory run state so the next Run Step picks it
          //      up immediately. Fast, low-latency, but only lives as long
          //      as the test session.
          //   2. updateScript — writes the full steps array (plus derived
          //      parameters + current test values) to agent_browser_scripts
          //      so the edit survives a session teardown, page reload, or
          //      another operator opening the script. Per operator
          //      direction this now fires on EVERY modal save so there's no
          //      gap between "the operator saw their edit committed" and
          //      "the row in Postgres reflects it" — the previous behavior
          //      (only the session-level Save button wrote to the DB)
          //      meant a crashed tab could lose every per-step edit.
          //
          // The DB write needs an existing script row to update. In test
          // mode the `script` prop carries the row id. In record mode the
          // row is created by the session-level Save button and its id is
          // stashed in `tempScriptId`. If neither is set yet (a brand-new
          // recording before its first save) we skip the DB write — the
          // session-level Save still handles persisting + name capture for
          // that first-save case.
          const targetScriptId = script?.id ?? tempScriptId ?? null;
          try {
            if (runId) {
              await syncStepRunSteps(orgId, runId, newSteps);
            }
            if (targetScriptId) {
              await updateScript(orgId, targetScriptId, {
                steps: newSteps,
                parameters: buildParameters(newSteps),
                test_values: {},
              });
              // Clear the dirty flag — what was in memory now matches the
              // DB row. The session-level Save button visibly hides itself
              // when hasChanges is false; without this clear it would
              // misleadingly stay lit after a modal save persisted things.
              setHasChanges(false);
            }
          } catch (err: any) {
            toast.error(err?.response?.data?.error || err?.message || 'Failed to save step');
          }
        }}
      />

      {/* Exit-session warning — shown on explicit exit AND on nav interception */}
      <Dialog open={showExitWarning} onOpenChange={(o) => {
        if (!o) { pendingNavRef.current = null; setShowExitWarning(false); }
      }}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exit session?</DialogTitle>
            <DialogDescription>
              Any unsaved changes will be lost. Use Save before exiting to keep your work.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => {
              pendingNavRef.current = null;
              setShowExitWarning(false);
            }}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setShowExitWarning(false); performExit(); }}>
              Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Extract from URL dialog ───────────────────────────── */}
      <Dialog open={urlExtractOpen} onOpenChange={setUrlExtractOpen}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Extract from URL</DialogTitle>
            <DialogDescription>
              Paste or type the value you see in the URL.  The system auto-detects whether it&apos;s a query parameter, path segment, or exact match.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {stepRunState?.pageUrl && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Current URL</p>
                <p className="text-xs font-mono bg-muted rounded px-2 py-1.5 break-all select-all">
                  {stepRunState.pageUrl}
                </p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1">Value to extract <span className="text-destructive">*</span></label>
              <input
                className="w-full border rounded-md px-2.5 py-1.5 text-sm font-mono bg-background"
                placeholder="e.g. 12345 or contract_id"
                value={urlExtractValue}
                onChange={(e) => setUrlExtractValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlExtractConfirm()}
                autoFocus
              />
              {urlExtractValue.trim() && stepRunState?.pageUrl && (() => {
                const val = urlExtractValue.trim();
                const url = stepRunState.pageUrl!;
                // Quick preview of detection
                try {
                  const parsed = new URL(url);
                  for (const [key, pv] of parsed.searchParams.entries()) {
                    if (pv === val) return <p className="text-xs text-emerald-600 mt-1">✓ Detected as query parameter: <strong>?{key}</strong></p>;
                  }
                  const segs = parsed.pathname.split('/').filter(Boolean);
                  const idx = segs.indexOf(val);
                  if (idx >= 0) return <p className="text-xs text-emerald-600 mt-1">✓ Detected as path segment at position <strong>{idx}</strong></p>;
                } catch { /* skip */ }
                if (url.includes(val)) return <p className="text-xs text-blue-600 mt-1">✓ Found as exact string match in URL</p>;
                return <p className="text-xs text-red-500 mt-1">✗ Value not found in the current URL</p>;
              })()}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Variable name</label>
              <input
                className="w-full border rounded-md px-2.5 py-1.5 text-sm font-mono bg-background"
                placeholder="e.g. contract_id"
                value={urlExtractFieldName}
                onChange={(e) => setUrlExtractFieldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlExtractConfirm()}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use as {'{{' + (urlExtractFieldName.trim() || 'variable_name') + '}}'} in later steps
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setUrlExtractOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleUrlExtractConfirm} disabled={!urlExtractValue.trim()}>
              Add Extract Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Mode + action picker ───────────────────────────────────────────────
//
// Left: a read-only info box (styled like a field, never a button) showing
// the CURRENT action (e.g. "Manual", "Record Interactions") or the live
// status while one runs. Right: three icon-only mode buttons (Test / Record
// / Extract); clicking one switches to that mode AND opens its action menu
// (the mode name is the menu heading), and picking an action updates the
// box. While an action is running, a small icon-only Stop / Cancel button
// appears to the LEFT of the box. Test actions set the run style (Manual =
// step, Auto = full agent-timed run); the actual Run button lives in the
// Steps panel header. Fixed widths so nothing shifts.

type ToolMode = 'test' | 'record' | 'extract';

interface ModeActionPickerProps {
  toolMode: ToolMode;
  setToolMode: (m: ToolMode) => void;
  runMode: 'step' | 'agent';
  isRecording: boolean;
  isCapturingWaitFor: boolean;
  isCapturingExtract: boolean;
  isExecuting: boolean;
  disabled: boolean;
  onSelectStep: () => void;
  onSelectAgent: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSelectRecordWait: () => void;
  onCancelWait: () => void;
  onSelectAddPause: () => void;
  onSelectExtractElement: () => void;
  onCancelExtract: () => void;
  onSelectExtractUrl: () => void | Promise<void>;
  onSelectCopyPage: () => void | Promise<void>;
}

type PickerAction = {
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void | Promise<void>;
};

const MODE_META: { key: ToolMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'test',    label: 'Test',    icon: Play },
  { key: 'record',  label: 'Record',  icon: CircleDot },
  { key: 'extract', label: 'Extract', icon: Scissors },
];

function ModeActionPicker({
  toolMode, setToolMode, runMode, isRecording, isCapturingWaitFor, isCapturingExtract, isExecuting, disabled,
  onSelectStep, onSelectAgent, onStartRecording, onStopRecording, onSelectRecordWait, onCancelWait,
  onSelectAddPause, onSelectExtractElement, onCancelExtract, onSelectExtractUrl, onSelectCopyPage,
}: ModeActionPickerProps) {
  // Remember the action last chosen per mode so the left chip can show it.
  // Test derives from runMode (Manual=step, Auto=agent); Record / Extract
  // remember the picked index.
  const [recordIdx, setRecordIdx] = useState(0);
  const [extractIdx, setExtractIdx] = useState(0);

  // While an action is in progress: the info box shows the live status,
  // a small icon-only Stop / Cancel button appears to its left, and Mode
  // locks so the operator can't strand a live recording / capture in
  // another mode. The box itself is NEVER a button — it stays purely
  // informational.
  const activeStatus =
    isRecording        ? { label: 'Recording…',       stopIcon: Square, stopTitle: 'Stop recording', onStop: onStopRecording, mode: 'record' as ToolMode } :
    isCapturingWaitFor ? { label: 'Waiting for click', stopIcon: X,      stopTitle: 'Cancel wait',     onStop: onCancelWait,     mode: 'record' as ToolMode } :
    isCapturingExtract ? { label: 'Click to extract',  stopIcon: X,      stopTitle: 'Cancel extract',  onStop: onCancelExtract,  mode: 'extract' as ToolMode } :
    null;
  const locked = disabled || !!activeStatus || isExecuting;

  const actionsByMode: Record<ToolMode, PickerAction[]> = {
    test: [
      { label: 'Manual', desc: 'Step through one action at a time (use the Run button)', icon: Play, onClick: onSelectStep },
      { label: 'Auto', desc: 'Run the whole script end-to-end with the agent runtime timing', icon: Zap, onClick: onSelectAgent },
    ],
    record: [
      { label: 'Record Interactions', desc: 'Capture clicks, fills, and navigations on the page', icon: CircleDot, onClick: onStartRecording },
      { label: 'Record Wait', desc: 'Click an element to insert a wait-for step', icon: Clock, onClick: onSelectRecordWait },
      { label: 'Add Pause', desc: 'Fixed-duration delay before the next step (no element required)', icon: Hourglass, onClick: onSelectAddPause },
    ],
    extract: [
      { label: 'Extract From Element', desc: 'Click any element on the page', icon: MousePointer2, onClick: onSelectExtractElement },
      { label: 'Extract From URL', desc: 'Uses selected value, or enter manually', icon: Link2, onClick: onSelectExtractUrl },
      { label: 'Copy From Page', desc: 'Uses last copied text (Ctrl+C)', icon: Clipboard, onClick: onSelectCopyPage },
    ],
  };

  // The selected index for a given mode (Test follows runMode).
  const selectedIdxFor = (m: ToolMode) =>
    m === 'test' ? (runMode === 'agent' ? 1 : 0) : m === 'record' ? recordIdx : extractIdx;

  const currentActions = actionsByMode[toolMode];
  const selectedAction = currentActions[Math.min(selectedIdxFor(toolMode), currentActions.length - 1)] ?? currentActions[0]!;

  // The status text shows live status while active, else "Mode : Action"
  // (e.g. "Test : Manual") so both the mode and the chosen action are clear.
  const modeLabel = MODE_META.find((m) => m.key === toolMode)?.label ?? toolMode;
  const boxLabel = activeStatus ? activeStatus.label : `${modeLabel} : ${selectedAction.label}`;

  return (
    <div className="flex items-center gap-2">
      {/* Status text — display only, never a box/button. Plain inline text
          indicating the current mode/action, or the live status while one
          is running. */}
      <div
        className="flex h-8 w-44 shrink-0 items-center justify-end px-1 text-right text-xs font-medium text-info cursor-default"
        title={activeStatus ? activeStatus.label : selectedAction.desc}
      >
        <span className="truncate">{boxLabel}</span>
      </div>

      {/* Short divider tying the status text to the mode buttons. */}
      <div className="h-5 w-px bg-border shrink-0" />

      {/* Right: icon-only mode buttons. Clicking one switches to that mode
          AND opens its action menu (the mode name is the menu heading);
          picking an action updates the info box on the left. */}
      <div className={cn('flex rounded-md border bg-muted/30 p-0.5', locked && 'opacity-60')}>
        {MODE_META.map((m) => {
          const Icon = m.icon;
          const activeMode = toolMode === m.key;
          const modeActions = actionsByMode[m.key];
          const modeSelectedIdx = selectedIdxFor(m.key);

          // The mode that's currently running turns INTO its Stop/Cancel
          // button (one button toggles record↔stop, capture↔cancel) rather
          // than a separate control. Other modes are disabled while active.
          if (activeStatus && activeStatus.mode === m.key) {
            const SIcon = activeStatus.stopIcon;
            return (
              <button
                key={m.key}
                type="button"
                onClick={activeStatus.onStop}
                disabled={disabled}
                className="flex h-7 w-9 items-center justify-center rounded bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700"
                title={activeStatus.stopTitle}
                aria-label={activeStatus.stopTitle}
              >
                <SIcon className="h-3.5 w-3.5 fill-current" />
              </button>
            );
          }

          return (
            <DropdownMenu key={m.key}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => setToolMode(m.key)}
                  disabled={locked}
                  className={cn(
                    'flex h-7 w-9 items-center justify-center rounded transition-colors',
                    activeMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    locked && 'cursor-not-allowed hover:text-muted-foreground',
                  )}
                  title={`${m.label} actions`}
                  aria-label={`${m.label} actions`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <DropdownMenuLabel>{m.label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modeActions.map((a, i) => {
                  const ActionIcon = a.icon;
                  return (
                    <DropdownMenuItem
                      key={a.label}
                      className={cn('gap-2 cursor-pointer', i === modeSelectedIdx && 'bg-muted/60')}
                      onClick={() => {
                        if (m.key !== toolMode) setToolMode(m.key);
                        if (m.key === 'record') setRecordIdx(i);
                        else if (m.key === 'extract') setExtractIdx(i);
                        a.onClick();
                      }}
                    >
                      <ActionIcon className="h-3.5 w-3.5 shrink-0" />
                      <div>
                        <div className="font-medium">{a.label}</div>
                        <div className="text-muted-foreground text-[10px]">{a.desc}</div>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </div>
  );
}
