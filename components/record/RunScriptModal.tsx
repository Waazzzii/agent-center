'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, ChevronRight, ChevronsRight, Play, AlertCircle, AlertTriangle, Loader2,
  CircleDot, X, Save, RotateCcw, Trash2, Plus, Server, Clock, GripVertical,
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
  type BrowserScript,
  type RecordedStep,
} from '@/lib/api/scripts';
import { cn } from '@/lib/utils';
import { BottomPanel } from './panels';
import { ProvisioningNotice } from '@/components/hitl/ProvisioningNotice';

const agentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL ?? '';

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

function stepLabel(step: RecordedStep): string {
  switch (step.action) {
    case 'navigate':   return `Navigate → ${step.url ?? ''}`;
    case 'click':      return `Click: ${step.text || step.selector || ''}`;
    case 'fill':       return `Fill: ${step.selector ?? ''} = ${step.value ?? ''}`;
    case 'select':     return `Select: ${step.value ?? ''} in ${step.selector ?? ''}`;
    case 'press_key':  return `Press: ${step.key ?? ''}`;
    case 'extract':    return `Extract → ${step.field_name ?? ''}`;
    case 'switch_tab': return `Switch to tab ${step.tab_index ?? ''}`;
    case 'close_tab':  return 'Close tab';
    case 'wait_for':     return `Wait: ${step._waitLabel ?? step.waitFor?.description ?? step.waitFor?.selector ?? step.selector ?? 'element'}`;
    case 'wait_for_tab': return `Wait for new tab${step.selector ? `: ${step.waitFor?.description ?? step.selector}` : ''}`;
    default:           return step.action;
  }
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
  } | null>(null);
  const [editedStep, setEditedStep]     = useState('');
  const [stepEditError, setStepEditError] = useState('');
  const [hoveredStep, setHoveredStep]   = useState<number | null>(null);
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

  const handleRunAll = async () => {
    if (!runId || !orgId || !stepRunState || stepRunState.done) return;
    cancelAutoRunRef.current = false;
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    let finished = false;
    while (!finished && !cancelAutoRunRef.current) {
      try {
        const res = await executeStepRunStep(orgId, runId, params);
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
        const screenshot = err?.response?.data?.screenshot ?? null;
        const msg = err?.response?.data?.error || err?.message || 'Step failed';
        setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
        setError(msg);
        finished = true;
      }
    }
    if (cancelAutoRunRef.current) {
      cancelAutoRunRef.current = false;
      setStepRunState((s) => s ? { ...s, status: 'waiting' } : s);
      toast.info('Auto-run stopped');
    }
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

    // Auto-apply any pending JSON edits locally before saving.
    // The full step list (including this edit) gets synced to the worker
    // via syncStepRunSteps later in the save flow.
    if (editedStep && stepRunState) {
      try {
        const parsed = JSON.parse(editedStep);
        if (parsed?.action) {
          const idx = stepRunState.currentIndex;
          setStepRunState((s) => {
            if (!s) return s;
            const steps = [...s.steps];
            if (idx < steps.length) steps[idx] = parsed;
            return { ...s, steps };
          });
        }
      } catch { /* invalid JSON — skip */ }
    }

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
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          ) : (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
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

        {/* Right: actions — identical for both record and test */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Record toggle — visible whenever a run is active */}
          {runId && (
            <Button
              variant={isRecording ? 'destructive' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={isRecordMode && isRecording ? handleStopRecordSession : handleToggleRecording}
              disabled={starting || (isExecuting && !isRecording) || isCapturingWaitFor}
              title={isRecording ? 'Stop recording' : 'Record new steps here'}
            >
              <CircleDot className={cn('h-3.5 w-3.5', isRecording && 'animate-pulse')} />
            </Button>
          )}

          {/* Add wait step — always visible when run active, disabled during record/execute */}
          {runId && !stepRunState?.done && (
            <Button
              variant={isCapturingWaitFor ? 'default' : 'ghost'}
              size="icon"
              className="h-7 w-7 focus-visible:ring-0 focus-visible:ring-offset-0"
              onClick={isCapturingWaitFor ? () => {
                captureAbortRef.current?.abort();
                captureAbortRef.current = null;
                cancelStepRunWaitForCapture(orgId!, runId!).catch(() => {});
                setIsCapturingWaitFor(false);
              } : handleAddWaitStep}
              disabled={!isCapturingWaitFor && (isRecording || isExecuting)}
              title={isCapturingWaitFor ? 'Cancel — press Esc or click here' : 'Add a wait step — click an element on the page'}
            >
              {isCapturingWaitFor
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Clock className="h-3.5 w-3.5" />}
            </Button>
          )}

          {/* Step/Auto + run — visible whenever a run is active */}
          {runId && (
            <>
              <div className="w-px h-5 bg-border mx-0.5" />
              <div className="flex rounded-md border overflow-hidden shrink-0">
                <button
                  className={cn('px-2.5 py-1 text-xs transition-colors',
                    !autoMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                  onClick={() => setAutoMode(false)}
                  disabled={isExecuting || isRecording}
                >Step</button>
                <button
                  className={cn('px-2.5 py-1 text-xs transition-colors border-l',
                    autoMode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                  onClick={() => setAutoMode(true)}
                  disabled={isExecuting || isRecording}
                >Auto</button>
              </div>
              {/* Stop button — visible during auto-run */}
              {isExecuting && autoMode ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { cancelAutoRunRef.current = true; }}
                >
                  <X className="mr-1.5 h-3 w-3" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={stepRunState?.done ? () => handleJumpToStep(0) : (autoMode ? handleRunAll : handleExecuteStep)}
                  disabled={isExecuting || isCapturingWaitFor || isRecording || (!stepRunState?.done && !hasSteps)}
                  size="sm"
                >
                  {isExecuting
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : stepRunState?.done
                      ? <RotateCcw className="mr-1.5 h-3 w-3" />
                      : autoMode
                        ? <ChevronsRight className="mr-1.5 h-3.5 w-3.5" />
                        : <Play className="mr-1.5 h-3 w-3 fill-current" />
                  }
                  {stepRunState?.done ? 'Restart' : autoMode ? 'Run All' : 'Run Step'}
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
              src={`${agentApiUrl}${viewerUrl}`}
              className="w-full h-full border-0 block"
              scrolling="no"
              title="Browser"
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

        {/* Right panel */}
        <div className="flex flex-col overflow-hidden bg-background w-[480px] shrink-0 border-l">

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
                          isCurrent  ? 'bg-primary/10 font-medium' : 'text-muted-foreground',
                          isNew && 'bg-green-500/5',
                          isHovered && !isCurrent && 'bg-muted/40',
                          !isRecording && dropStepIdx === i && dragStepIdx !== i && 'border-t-2 border-primary',
                        )}
                        draggable={!isExecuting && !isRecording}
                        onDragStart={isRecording ? undefined : () => setDragStepIdx(i)}
                        onDragEnd={isRecording ? undefined : () => { setDragStepIdx(null); setDropStepIdx(null); }}
                        onDragOver={isRecording ? undefined : (e) => { e.preventDefault(); setDropStepIdx(i); }}
                        onDrop={isRecording ? undefined : () => handleDropStep(i)}
                        onMouseEnter={() => setHoveredStep(i)}
                        onMouseLeave={() => setHoveredStep(null)}
                        onClick={() => { if (!isCurrent && !isExecuting && !isRecording && !stepRunState?.done) handleJumpToStep(i); }}
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
                        <span className="truncate flex-1">
                          {stepLabel(s)}
                        </span>
                        {/* Actions: delete (on hover) + selector warning (persistent) */}
                        <div className="ml-auto shrink-0 flex items-center gap-1">
                          {isHovered && (
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleDeleteStep(i); }}
                              title="Delete step"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {needsSelectorReview(s) && (
                            <span title="Selector needs review — run this step to auto-select"><AlertTriangle className="h-3 w-3 text-amber-500" /></span>
                          )}
                        </div>
                        {isCurrent && !isHovered ? (
                          <ChevronRight className="h-3 w-3 shrink-0 text-primary" />
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

              {/* ── Bottom panel (extracted component) ── */}
              {(() => {
                const vars = analyzeVariables(stepsToShow);
                const allNames = [...new Set([...vars.keys(), ...Object.keys(params).filter((k) => !vars.has(k))])];
                const idx = stepRunState?.done
                  ? Math.max(0, (stepRunState?.steps?.length ?? 1) - 1)
                  : (stepRunState?.currentIndex ?? 0);
                const curStep = stepRunState?.steps?.[idx] ?? null;
                return (
                  <BottomPanel
                    variables={vars}
                    params={params}
                    onParamsChange={setParams}
                    onRenameVariable={handleRenameVariable}
                    onDeleteVariable={handleDeleteVariable}
                    hoveredStep={hoveredStep}
                    variableNames={allNames}
                    currentStep={curStep}
                    currentStepIndex={idx}
                    onUpdateStep={(updated) => {
                      const newSteps = [...(stepRunState?.steps ?? [])];
                      newSteps[idx] = updated;
                      setStepRunState((s) => s ? { ...s, steps: newSteps, step: updated } : s);
                      setEditedStep(JSON.stringify(updated, null, 2));
                      setHasChanges(true);
                    }}
                    needsSelectorReview={needsSelectorReview}
                    editedStep={editedStep}
                    onEditedStepChange={(v) => { setEditedStep(v); setStepEditError(''); }}
                    stepEditError={stepEditError}
                    isExecuting={isExecuting}
                    isRecording={isRecording}
                    extracted={stepRunState?.extracted ?? {}}
                  />
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      {portal}
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
    </>
  );
}
