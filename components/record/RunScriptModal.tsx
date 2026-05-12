'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, ChevronRight, ChevronsRight, ChevronLeft, Play, AlertCircle, AlertTriangle, Loader2,
  CircleDot, X, Save, RotateCcw, Trash2, Plus, Server, Clock, GripVertical, PanelRightClose, PanelRightOpen,
  Variable, MousePointer2, Link2, Clipboard, Pencil, Copy, ListTodo,
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
  type BrowserScript,
  type RecordedStep,
} from '@/lib/api/scripts';
import { cn } from '@/lib/utils';
import { BottomPanel } from './panels';
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
    default:           return step.action;
  }
}

function stepLabel(step: RecordedStep): string {
  const custom = step.name?.trim();
  return custom && custom.length > 0 ? custom : autoStepLabel(step);
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
  const [autoMode, setAutoMode]         = useState(false);

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
    setAutoMode(false);
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
  };

  // ── Auto-start when overlay opens (with orphan check) ────────
  useEffect(() => {
    if (!open || !orgId) return;

    // Check for an orphaned session before starting a new one
    const existing = getActiveBrowserSession();
    if (existing && existing.orgId === orgId) {
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
        // Pre-seed: recording defaults from parameters, then override with
        // persisted test_values (user's latest test overrides survive sessions)
        if (script?.parameters && typeof script.parameters === 'object') {
          setParams({ ...script.parameters, ...(script.test_values ?? {}) });
        }
        // Always auto-start — variables are editable inline in the Variables Panel
        handleStartStepRun();
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
    steps.forEach((s, i) => {
      // Consumers: anywhere {{name}} appears in value/url/field_name
      for (const src of [s.value ?? '', s.field_name ?? '', s.url ?? '']) {
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
   * Build the parameters object for saving: { name: defaultValue }.
   * Default values come from the current test values (params state),
   * so whatever the user typed during recording becomes the default.
   */
  const buildParameters = (steps: RecordedStep[]): Record<string, string> => {
    const vars = analyzeVariables(steps);
    const result: Record<string, string> = {};
    // Build a map of _defaultValue from steps for fallback
    const defaults: Record<string, string> = {};
    for (const s of steps) {
      if (s._defaultValue) {
        if (s.action === 'fill' && s.value) {
          const match = s.value.match(/^\{\{(\w+)\}\}$/);
          if (match) defaults[match[1]] = s._defaultValue;
        }
        if (s.action === 'extract' && s.field_name) {
          defaults[s.field_name] = s._defaultValue;
        }
      }
    }
    for (const name of vars.keys()) {
      result[name] = params[name] || defaults[name] || '';
    }
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

  const handleExecuteStep = async () => {
    if (!runId || !orgId || !stepRunState) return;
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    try {
      const res = await executeStepRunStep(orgId, runId, params);
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
      const screenshot = err?.response?.data?.screenshot ?? null;
      const msg = err?.response?.data?.error || err?.message || 'Step failed';
      setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
      setError(msg);
    }
  };

  // AbortController for the in-flight step execution request.  When the
  // user clicks Stop, we abort the HTTP request AND tell the backend to
  // halt the step run — the browser stops mid-action immediately.
  const autoRunAbortRef = useRef<AbortController | null>(null);

  const handleRunAll = async () => {
    if (!runId || !orgId || !stepRunState || stepRunState.done) return;
    cancelAutoRunRef.current = false;
    const controller = new AbortController();
    autoRunAbortRef.current = controller;
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    let finished = false;
    while (!finished && !cancelAutoRunRef.current) {
      try {
        const res = await executeStepRunStep(orgId, runId, params, controller.signal);
        finished = res.done;
        setStepRunState((s) => {
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
            status:       res.done ? 'waiting' : 'running',
          };
        });
        // Live-update test values from extracted data
        if (res.extracted && Object.keys(res.extracted).length > 0) {
          setParams((p) => ({ ...p, ...res.extracted }));
        }
        if (res.done) {
          // Force one more state update to ensure the last executedStep merge is visible
          const lastExecutedStep = res.executedStep;
          if (lastExecutedStep && res.currentIndex > 0) {
            setStepRunState((s) => {
              if (!s) return s;
              const steps = [...s.steps];
              steps[res.currentIndex - 1] = lastExecutedStep;
              return { ...s, steps };
            });
          }
          setEditedStep('');
          toast.success('All steps completed!');
        }
      } catch (err: any) {
        // AbortError means the user clicked Stop — not a real error.
        if (err?.name === 'AbortError' || err?.name === 'CanceledError' || cancelAutoRunRef.current) break;
        const screenshot = err?.response?.data?.screenshot ?? null;
        const msg = err?.response?.data?.error || err?.message || 'Step failed';
        setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
        setError(msg);
        finished = true;
      }
    }
    autoRunAbortRef.current = null;
    if (cancelAutoRunRef.current) {
      cancelAutoRunRef.current = false;
      setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
      toast.info('Auto-run stopped');
    }
  };

  /** Stop button handler — cancels the auto-run loop but keeps the step
   *  run alive so the user can click individual steps, re-run, edit, etc.
   *  Only the in-flight HTTP request is aborted (so we don't wait for the
   *  current step to finish). The backend session stays intact. */
  const handleStopAutoRun = () => {
    cancelAutoRunRef.current = true;
    // Abort the in-flight HTTP request so the await returns immediately
    if (autoRunAbortRef.current) {
      autoRunAbortRef.current.abort();
      autoRunAbortRef.current = null;
    }
    // Don't call abortStepRun — that kills the backend session and makes
    // all subsequent step clicks return "step run not found".
  };

  const handleJumpToStep = async (targetIndex: number) => {
    if (!runId || !orgId || !stepRunState || jumpingTo !== null) return;
    setJumpingTo(targetIndex);
    setError(null);
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
  const handleRenameVariable = (oldName: string, newName: string) => {
    const safeName = newName.trim().replace(/\s+/g, '_').replace(/\W/g, '');
    if (!safeName || safeName === oldName) return;
    // Update all step references: {{oldName}} → {{newName}} in value/url/field_name
    const updatedSteps = (stepRunState?.steps ?? []).map((s) => {
      const updated = { ...s };
      if (updated.value) updated.value = updated.value.replace(new RegExp(`\\{\\{${oldName}\\}\\}`, 'g'), `{{${safeName}}}`);
      if (updated.url) updated.url = updated.url.replace(new RegExp(`\\{\\{${oldName}\\}\\}`, 'g'), `{{${safeName}}}`);
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
  const handleExtractUrl = async () => {
    setUrlExtractValue('');
    setUrlExtractFieldName('');
    // Fetch live URL before opening dialog
    if (runId && orgId) {
      try {
        const freshState = await getStepRun(orgId, runId);
        if (freshState?.pageUrl) setStepRunState((s) => s ? { ...s, pageUrl: freshState.pageUrl } : s);
      } catch { /* use cached */ }
    }
    setUrlExtractOpen(true);
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
          // Already saved once — update in place
          await updateScript(orgId, tempScriptId, { name, description: scriptDescription || undefined, steps, parameters, test_values: params });
        } else {
          // First save — create the script now
          const created = await createScript(orgId, { name, steps, parameters, test_values: params });
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
        await updateScript(orgId, script.id, { steps, parameters: buildParameters(steps), test_values: params, description: scriptDescription || undefined });
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
        if (script.parameters && typeof script.parameters === 'object') setParams({ ...script.parameters, ...(script.test_values ?? {}) });
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
        if (script.parameters && typeof script.parameters === 'object') setParams({ ...script.parameters, ...(script.test_values ?? {}) });
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

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const isExecuting = stepRunState?.status === 'running' || starting;
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

          {/* Progress chip */}
          {stepRunState && !stepRunState.done && stepRunState.totalSteps > 0 && !isRecording && (
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {Math.min(stepRunState.currentIndex + 1, stepRunState.totalSteps)} / {stepRunState.totalSteps}
            </span>
          )}
          {isRecording && (
            <span className="text-xs text-red-500/70 shrink-0">Recording…</span>
          )}
        </div>

        {/* Right: actions ─────────────────────────────────────────
            Single Mode dropdown collapses what used to be four toolbar
            sections (record toggle / wait capture / extract dropdown /
            step-auto toggle) into one labeled picker. Selecting a mode
            triggers it immediately:
              • Step Test / Auto Test → updates Run button behavior, no action
              • Record Interactions   → starts recording
              • Record Wait           → starts wait-for capture
              • Extract From Element  → starts extract capture
              • Extract From URL      → uses clipboard or opens URL dialog
              • Copy From Page        → uses last-copied text
            The current mode label is always visible so the operator
            sees exactly what action will happen next. */}
        <div className="flex items-center gap-1.5 shrink-0">

          {runId && (
            <ModeDropdown
              autoMode={autoMode}
              isRecording={isRecording}
              isCapturingWaitFor={isCapturingWaitFor}
              isCapturingExtract={isCapturingExtract}
              isExecuting={isExecuting}
              disabled={starting}
              onSelectStep={() => setAutoMode(false)}
              onSelectAuto={() => setAutoMode(true)}
              onSelectRecordInteractions={isRecordMode && isRecording ? handleStopRecordSession : handleToggleRecording}
              onSelectRecordWait={isCapturingWaitFor ? () => {
                captureAbortRef.current?.abort();
                captureAbortRef.current = null;
                cancelStepRunWaitForCapture(orgId!, runId!).catch(() => {});
                setIsCapturingWaitFor(false);
              } : handleAddWaitStep}
              onSelectExtractElement={isCapturingExtract ? () => {
                captureExtractAbortRef.current?.abort();
                captureExtractAbortRef.current = null;
                cancelStepRunExtractCapture(orgId!, runId!).catch(() => {});
                setIsCapturingExtract(false);
              } : handleAddExtractStep}
              onSelectExtractUrl={async () => {
                const clip = await requestVncClipboard();
                if (clip) handleSmartCopyWithText(clip);
                else handleExtractUrl();
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

          {/* Run / Stop — visible whenever a run is active. Mode is
              chosen in the dropdown above; the button below just
              fires (or aborts) the current test mode. */}
          {runId && (
            <>
              <div className="w-px h-5 bg-border mx-0.5" />
              {/* Stop button — visible during auto-run.  Cancels the in-flight
                  HTTP request AND tells the backend to halt the step run. */}
              {isExecuting && autoMode ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopAutoRun}
                >
                  <X className="mr-1.5 h-3 w-3" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={autoMode ? handleRunAll : handleExecuteStep}
                  disabled={
                    isExecuting ||
                    isCapturingWaitFor ||
                    isCapturingExtract ||
                    isRecording ||
                    !hasSteps ||
                    // When the run is done, every step is marked
                    // completed. There's no "Restart" — clicking a step
                    // in the list jumps back to it and re-runs from
                    // there. Disabled state keeps the button visible so
                    // the layout doesn't shift on completion.
                    !!stepRunState?.done
                  }
                  size="sm"
                  title={stepRunState?.done ? 'Run complete — click any step to re-run from there.' : undefined}
                >
                  {isExecuting
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : autoMode
                      ? <ChevronsRight className="mr-1.5 h-3.5 w-3.5" />
                      : <Play className="mr-1.5 h-3 w-3 fill-current" />
                  }
                  {autoMode ? 'Run All' : 'Run Step'}
                </Button>
              )}
            </>
          )}

          {/* Save — always visible */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleSave}
            disabled={isExecuting || isRecording}
            title="Save"
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
              <p className="text-sm">Starting browser instance{provisioningElapsedMs > 30_000 ? ' — this may take a minute' : ''}…</p>
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
                <div className="flex items-center gap-2">
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
                  // Show recording position + live steps BEFORE the current step (after last executed).
                  // currentIndex > 0: show after the last executed step (i === currentIndex - 1).
                  // currentIndex === 0: handled by the header element above the map.
                  // Show recording insertion indicator AFTER the current step
                  const showLiveInsert = isRecording && !showLiveDirectly && stepRunState &&
                    i === stepRunState.currentIndex;
                  const isNew       = newStepIndices.has(i);
                  const isJumping   = jumpingTo === i;
                  const isHovered   = hoveredStep === i && !isExecuting && !isRecording;
                  return (
                    <div key={i}>
                      <div
                        className={cn(
                          'py-1.5 flex items-center gap-1.5 group relative',
                          isRecording ? 'px-3' : 'px-1.5 cursor-pointer',
                          isCurrent  ? 'bg-brand/10 font-medium' : 'text-muted-foreground',
                          isNew && 'bg-green-500/5',
                          isHovered && !isCurrent && 'bg-muted/40',
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
                          // Click jumps to that step. When the run is
                          // complete, clicking effectively rewinds and
                          // re-runs from there (handleJumpToStep clears
                          // the done flag and replays from the target).
                          if (inlineRenameIndex === i) return; // mid-rename, ignore
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
                        {/* Drag handle — only in test mode */}
                        {!isRecording && (
                          <div className={cn(
                            'cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0',
                            isExecuting && 'invisible'
                          )}>
                            <GripVertical className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {/* Step number — replaced by green check (completed) or green + (new) */}
                        <span className="w-5 shrink-0 text-right tabular-nums flex items-center justify-end">
                          {isCompleted ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : isNew ? (
                            <Plus className="h-3.5 w-3.5 text-green-500" />
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
                        {/* Actions: edit + duplicate + delete (on hover) + selector warning (persistent). */}
                        <div className="ml-auto shrink-0 flex items-center gap-1">
                          {isHovered && (
                            <>
                              <button
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); setEditingStepIndex(i); }}
                                title="Edit step — name, selector, JSON"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                onClick={(e) => { e.stopPropagation(); handleDuplicateStep(i); }}
                                title="Duplicate step"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                onClick={(e) => { e.stopPropagation(); handleDeleteStep(i); }}
                                title="Delete step"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          )}
                          {needsSelectorReview(s) && (
                            <span title="Selector needs review — run this step to auto-select"><AlertTriangle className="h-3 w-3 text-amber-500" /></span>
                          )}
                        </div>
                        {isCurrent && !isHovered ? (
                          <ChevronRight className="h-3 w-3 shrink-0 text-brand" />
                        ) : null}
                      </div>
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
                            <div key={`rec-${ri}`} className="px-3 py-1.5 flex items-center gap-2 text-muted-foreground bg-red-500/5">
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

              {/* ── Bottom panel — Variables only. Selector + JSON
                  editors moved to the step-edit modal so the operator
                  has one editing surface (and Variables can stay
                  pinned without competing for tab space). ── */}
              {(() => {
                const vars = analyzeVariables(stepsToShow);
                return (
                  <BottomPanel
                    variables={vars}
                    params={params}
                    onParamsChange={setParams}
                    onRenameVariable={handleRenameVariable}
                    onDeleteVariable={handleDeleteVariable}
                    hoveredStep={hoveredStep}
                    extracted={stepRunState?.extracted ?? {}}
                  />
                );
              })()}
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
          // BOTH the React state update and the backend sync. Avoid mutating
          // anything inside setStepRunState's updater: React requires the
          // updater to be pure (it may run multiple times under StrictMode or
          // be skipped under bail-out), so capturing values via side effects
          // inside it is unreliable.
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
          if (orgId && runId) {
            try {
              await syncStepRunSteps(orgId, runId, newSteps);
            } catch (err: any) {
              toast.error(err?.response?.data?.error || err?.message || 'Failed to save step');
            }
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

// ── Action mode dropdown ───────────────────────────────────────────────
//
// Single picker that consolidates the test mode + every capture action
// (record interactions, record wait, extract from element / url / copy)
// into one labeled dropdown. Picking a capture mode fires it immediately;
// picking Step / Auto Test just toggles the Run button behavior.

interface ModeDropdownProps {
  autoMode: boolean;
  isRecording: boolean;
  isCapturingWaitFor: boolean;
  isCapturingExtract: boolean;
  isExecuting: boolean;
  disabled: boolean;
  onSelectStep: () => void;
  onSelectAuto: () => void;
  onSelectRecordInteractions: () => void;
  onSelectRecordWait: () => void;
  onSelectExtractElement: () => void;
  onSelectExtractUrl: () => void | Promise<void>;
  onSelectCopyPage: () => void | Promise<void>;
}

function ModeDropdown({
  autoMode, isRecording, isCapturingWaitFor, isCapturingExtract, isExecuting, disabled,
  onSelectStep, onSelectAuto, onSelectRecordInteractions, onSelectRecordWait,
  onSelectExtractElement, onSelectExtractUrl, onSelectCopyPage,
}: ModeDropdownProps) {
  // Compute the current mode label + icon. Capture states take
  // precedence over the test-mode toggle so the operator can tell at a
  // glance what the next click on the page will do.
  let label = autoMode ? 'Auto Test' : 'Step Test';
  let Icon: React.ComponentType<{ className?: string }> = autoMode ? ChevronsRight : Play;
  let accent = 'text-muted-foreground';
  if (isRecording) {
    label = 'Recording…';
    Icon = CircleDot;
    accent = 'text-red-500 animate-pulse';
  } else if (isCapturingWaitFor) {
    label = 'Click to set Wait';
    Icon = Loader2;
    accent = 'text-brand animate-spin';
  } else if (isCapturingExtract) {
    label = 'Click to Extract';
    Icon = Loader2;
    accent = 'text-brand animate-spin';
  }

  const sectionLabelClass = 'px-2 pt-1.5 pb-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled}
          title="Choose what the next action will do"
        >
          <ListTodo className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[140px]">{label}</span>
          <Icon className={cn('h-3 w-3 shrink-0', accent)} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <div className={sectionLabelClass}>Test</div>
        <DropdownMenuItem
          className={cn('gap-2 cursor-pointer', !autoMode && !isRecording && !isCapturingWaitFor && !isCapturingExtract && 'bg-muted/60')}
          onClick={onSelectStep}
          disabled={isExecuting || isRecording || isCapturingWaitFor || isCapturingExtract}
        >
          <Play className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Step Test</div>
            <div className="text-muted-foreground text-[10px]">Run one step at a time</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn('gap-2 cursor-pointer', autoMode && !isRecording && !isCapturingWaitFor && !isCapturingExtract && 'bg-muted/60')}
          onClick={onSelectAuto}
          disabled={isExecuting || isRecording || isCapturingWaitFor || isCapturingExtract}
        >
          <ChevronsRight className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Auto Test</div>
            <div className="text-muted-foreground text-[10px]">Run all remaining steps in sequence</div>
          </div>
        </DropdownMenuItem>

        <div className={sectionLabelClass}>Record</div>
        <DropdownMenuItem
          className={cn('gap-2 cursor-pointer', isRecording && 'bg-muted/60')}
          onClick={onSelectRecordInteractions}
          disabled={isExecuting || isCapturingWaitFor || isCapturingExtract}
        >
          <CircleDot className={cn('h-3.5 w-3.5 shrink-0', isRecording && 'text-red-500')} />
          <div>
            <div className="font-medium">{isRecording ? 'Stop Recording' : 'Record Interactions'}</div>
            <div className="text-muted-foreground text-[10px]">
              {isRecording ? 'Stop capturing clicks / fills / navigations' : 'Capture clicks, fills, and navigations on the page'}
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={cn('gap-2 cursor-pointer', isCapturingWaitFor && 'bg-muted/60')}
          onClick={onSelectRecordWait}
          disabled={isExecuting || isRecording || isCapturingExtract}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">{isCapturingWaitFor ? 'Cancel Wait Capture' : 'Record Wait'}</div>
            <div className="text-muted-foreground text-[10px]">
              {isCapturingWaitFor ? 'Stop waiting for the next click' : 'Click an element to insert a wait-for step'}
            </div>
          </div>
        </DropdownMenuItem>

        <div className={sectionLabelClass}>Extract</div>
        <DropdownMenuItem
          className={cn('gap-2 cursor-pointer', isCapturingExtract && 'bg-muted/60')}
          onClick={onSelectExtractElement}
          disabled={isExecuting || isRecording || isCapturingWaitFor}
        >
          <MousePointer2 className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">{isCapturingExtract ? 'Cancel Element Capture' : 'Extract From Element'}</div>
            <div className="text-muted-foreground text-[10px]">
              {isCapturingExtract ? 'Stop waiting for an element click' : 'Click any element on the page'}
            </div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={onSelectExtractUrl}
          disabled={isExecuting || isRecording || isCapturingWaitFor || isCapturingExtract}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Extract From URL</div>
            <div className="text-muted-foreground text-[10px]">Uses selected value, or enter manually</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={onSelectCopyPage}
          disabled={isExecuting || isRecording || isCapturingWaitFor || isCapturingExtract}
        >
          <Clipboard className="h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Copy From Page</div>
            <div className="text-muted-foreground text-[10px]">Uses last copied text (Ctrl+C)</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
