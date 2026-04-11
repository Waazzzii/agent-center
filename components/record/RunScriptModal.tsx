'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2, ChevronRight, ChevronsRight, Play, AlertCircle, Loader2,
  CircleDot, MousePointerClick, X, Save, RotateCcw, Trash2, Plus, Server,
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
  captureStepRunWaitFor,
  cancelStepRunWaitForCapture,
  type BrowserScript,
  type RecordedStep,
} from '@/lib/api/scripts';
import { cn } from '@/lib/utils';

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
    case 'wait_for':     return `Wait for: ${step._waitLabel ?? step.waitFor?.description ?? step.waitFor?.selector ?? step.selector ?? ''}`;
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
        if (script && script.parameters.length === 0) {
          handleStartStepRun();
        }
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

  // ── Helpers ───────────────────────────────────────────────────
  const extractParams = (steps: RecordedStep[]) => Array.from(new Set(
    steps.flatMap((s) => {
      const sources = [s.value ?? '', s.field_name ?? '', s.url ?? ''];
      return sources.flatMap((src) => {
        const matches = src.match(/\{\{(\w+)\}\}/g);
        return matches ? matches.map((m) => m.replace(/\{\{|\}\}/g, '')) : [];
      });
    })
  ));

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
      const res = await executeStepRunStep(orgId, runId);
      setStepRunState((s) => ({
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        s?.steps ?? [],
        screenshot:   res.screenshot,
        extracted:    res.extracted,
        done:         res.done,
        status:       'waiting',
      }));
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      setStepEditError('');
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
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    let finished = false;
    while (!finished) {
      try {
        const res = await executeStepRunStep(orgId, runId);
        finished = res.done;
        setStepRunState((s) => ({
          currentIndex: res.currentIndex,
          totalSteps:   res.totalSteps,
          step:         res.step,
          steps:        s?.steps ?? [],
          screenshot:   res.screenshot,
          extracted:    res.extracted,
          done:         res.done,
          status:       res.done ? 'waiting' : 'running',
        }));
        if (res.done) {
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
    if (!runId) { performExit(); return; }
    // Only warn if there's something that would be lost on exit
    const warn =
      (isRecording && liveRecordedSteps.length > 0) ||
      (mode === 'record' && !hasSavedSession && (stepRunState?.steps?.length ?? 0) > 0) ||
      (mode !== 'record' && hasChanges);
    if (warn) {
      setShowExitWarning(true);
    } else {
      performExit();
    }
  };

  // ── Unified save (stays in the session window) ───────────────
  const handleDeleteStep = async (stepIndex: number) => {
    if (!runId || !orgId) return;
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
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete step');
    }
  };

  const handleSave = async () => {
    if (!orgId) return;

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
        const params = extractParams(steps);

        if (tempScriptId) {
          // Already saved once — update in place
          await updateScript(orgId, tempScriptId, { name, steps, parameters: params });
        } else {
          // First save — create the script now
          const created = await createScript(orgId, { name, steps, parameters: params });
          setTempScriptId(created.id);
        }
        toast.success('Script saved!');
        setHasSavedSession(true);
        onSaved?.();
      } catch (err: any) {
        toast.error(err?.response?.data?.message || err?.message || 'Failed to save');
      }
    } else {
      // Test mode — save edits to the original script.
      if (!script) return;
      const steps = stepRunState?.steps ?? [];
      try {
        await updateScript(orgId, script.id, { steps, parameters: extractParams(steps) });
        setHasChanges(false);
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
      setScriptName(run?.steps?.length ? `Resumed session` : scriptName || '');
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
      else if (script && script.parameters.length === 0) handleStartStepRun();
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
      if (script && script.parameters.length === 0) handleStartStepRun();
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

  const handleCaptureWaitFor = async () => {
    if (!runId || !orgId || !stepRunState) return;
    if (isCapturingWaitFor) {
      captureAbortRef.current?.abort();
      captureAbortRef.current = null;
      await cancelStepRunWaitForCapture(orgId, runId);
      setIsCapturingWaitFor(false);
      return;
    }
    setIsCapturingWaitFor(true);
    const controller = new AbortController();
    captureAbortRef.current = controller;
    try {
      const result = await captureStepRunWaitFor(orgId, runId, controller.signal);
      const updatedState = await updateStepRunStep(orgId, runId, {
        waitFor: { selector: result.selector, description: result.description },
      });
      setStepRunState((s) => s ? { ...s, steps: updatedState.steps ?? s.steps, step: updatedState.step ?? s.step } : s);
      setEditedStep(updatedState.step ? JSON.stringify(updatedState.step, null, 2) : editedStep);
      setStepEditError('');
      setHasChanges(true);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      toast.error(err?.response?.data?.error || err?.message || 'Wait-for capture failed');
    } finally {
      captureAbortRef.current = null;
      setIsCapturingWaitFor(false);
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

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const isExecuting = stepRunState?.status === 'running' || starting;
  const isRecordMode = mode === 'record';
  const needsParams = !isRecordMode && !!script && script.parameters.length > 0 && !runId && !isProvisioning;
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

          {/* Editable name */}
          <input
            className="text-sm font-medium bg-transparent border-none outline-none focus:ring-1 focus:ring-border rounded px-1 min-w-0 w-52"
            value={scriptName}
            onChange={(e) => setScriptName(e.target.value)}
            onBlur={handleSaveScriptName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="Script name…"
            disabled={starting}
          />

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
              size="sm"
              className="h-7 w-7 p-0"
              onClick={isRecordMode && isRecording ? handleStopRecordSession : handleToggleRecording}
              disabled={starting || (isExecuting && !isRecording) || isCapturingWaitFor}
              title={isRecording ? 'Stop recording' : 'Record new steps here'}
            >
              <CircleDot className={cn('h-3.5 w-3.5', isRecording && 'animate-pulse')} />
            </Button>
          )}

          {/* Wait-for picker — step mode only, only on wait_for steps, not while actively recording */}
          {runId && !stepRunState?.done && !autoMode && !isRecording &&
           stepRunState?.step?.action === 'wait_for' && (
            <Button
              variant={isCapturingWaitFor ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleCaptureWaitFor}
              disabled={(isExecuting || isRecording) && !isCapturingWaitFor}
              title={isCapturingWaitFor ? 'Cancel — click an element or press Esc' : 'Click an element to set the wait-for target for this step'}
            >
              {isCapturingWaitFor
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <MousePointerClick className="h-3.5 w-3.5" />
              }
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
                {stepRunState?.done ? 'Restart' : autoMode ? 'Run All' : 'Next'}
              </Button>
            </>
          )}

          {/* Save — record: whenever there are steps; test: when edits are pending */}
          {((isRecordMode && hasSteps) || (!isRecordMode && hasChanges && runId)) && (
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-7 w-7 p-0', !isRecordMode && 'text-primary')}
              onClick={handleSave}
              disabled={isExecuting}
              title={isRecordMode ? 'Save script' : 'Save changes to script'}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}

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
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
                <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Server className="h-7 w-7 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold">Waiting for a browser VM</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    All browser slots are currently in use. A new VM is being provisioned — this typically takes 1–2 minutes.
                    The browser will open automatically once it&apos;s ready.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>You can close this window and come back — your session will be waiting for you.</span>
                </div>
              </div>
            </div>
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

          {/* ── Params form (test mode pre-run) ── */}
          {needsParams && (
            <>
              <div className="px-3 py-2 border-b shrink-0">
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">Parameters</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {script!.parameters.map((param) => (
                  <div key={param} className="space-y-1.5">
                    <Label className="text-xs">{param}</Label>
                    <Input
                      placeholder={`Enter ${param}…`}
                      value={params[param] ?? ''}
                      onChange={(e) => setParams((p) => ({ ...p, [param]: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              <div className="border-t p-3">
                {error && (
                  <p className="text-xs text-destructive mb-2 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
                  </p>
                )}
                <Button className="w-full" size="sm" onClick={handleStartStepRun} disabled={starting}>
                  {starting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Start Testing
                </Button>
              </div>
            </>
          )}

          {/* ── Unified step list (record + test + review) ── */}
          {!needsParams && (
            <>
              <div className="px-3 py-2 border-b shrink-0">
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                  {`Steps (${stepCount})`}
                </p>
              </div>

              <div ref={stepListRef} className="flex-1 overflow-y-auto divide-y text-xs min-h-0">

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

                {/* Recording indicator at top — when currentIndex === 0 (no steps executed yet) */}
                {isRecording && !showLiveDirectly && stepRunState && stepRunState.currentIndex === 0 && (
                  <>
                    <div className="px-3 py-1 flex items-center gap-2 bg-red-500/5 border-b border-red-500/15">
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

                {/* Unified step list — same display logic for both record and test modes */}
                {stepsToShow.map((s, i) => {
                  // Current/completed highlighting only applies when NOT actively recording
                  const isCurrent   = !isRecording && stepRunState ? (i === stepRunState.currentIndex && !stepRunState.done) : false;
                  const isCompleted = !isRecording && stepRunState ? i < stepRunState.currentIndex : false;
                  // Show recording position + live steps BEFORE the current step (after last executed).
                  // currentIndex > 0: show after the last executed step (i === currentIndex - 1).
                  // currentIndex === 0: handled by the header element above the map.
                  const showLiveInsert = isRecording && !showLiveDirectly && stepRunState &&
                    stepRunState.currentIndex > 0 && i === stepRunState.currentIndex - 1;
                  const isNew       = newStepIndices.has(i);
                  const isJumping   = jumpingTo === i;
                  const isHovered   = hoveredStep === i && !isExecuting && !isRecording;
                  return (
                    <div key={i}>
                      <div
                        className={cn(
                          'px-3 py-1.5 flex items-center gap-2 group relative',
                          isCurrent  ? 'bg-primary/10 font-medium' : 'text-muted-foreground',
                          isNew && !isCurrent && 'bg-green-500/5',
                          isHovered && !isCurrent && 'bg-muted/40',
                        )}
                        onMouseEnter={() => setHoveredStep(i)}
                        onMouseLeave={() => setHoveredStep(null)}
                      >
                        <span className={cn('w-5 shrink-0 text-right tabular-nums', isCompleted && !isHovered && 'line-through')}>
                          {i + 1}.
                        </span>
                        <span className="truncate flex-1">
                          {stepLabel(s)}
                        </span>
                        {isCurrent && !isHovered ? (
                          <ChevronRight className="h-3 w-3 ml-auto shrink-0 text-primary" />
                        ) : isHovered ? (
                          <div className="ml-auto shrink-0 flex items-center gap-2">
                            {!isCurrent && !stepRunState?.done && (
                              <button
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={() => handleJumpToStep(i)}
                                disabled={isJumping}
                              >
                                {isJumping ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                                Run from here
                              </button>
                            )}
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              onClick={(e) => { e.stopPropagation(); handleDeleteStep(i); }}
                              title="Delete step"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : isNew ? (
                          <Plus className="h-3 w-3 ml-auto shrink-0 text-green-500" />
                        ) : null}
                      </div>
                      {/* Recording insertion point — shown before the current (next-to-run) step */}
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

              {/* ── Current step editor (resizable) ── */}
              {!stepRunState?.done && stepRunState?.step && (
                <div className="border-t shrink-0 flex flex-col">
                  {/* Drag handle */}
                  <div
                    className="h-1.5 bg-border/60 hover:bg-primary/40 cursor-row-resize transition-colors shrink-0"
                    onMouseDown={handleResizeMouseDown}
                    title="Drag to resize"
                  />
                  <div className="px-3 pt-2 pb-1 flex items-center justify-between shrink-0">
                    <p className="text-xs font-medium text-muted-foreground">Current step</p>
                    <div className="flex items-center gap-2">
                      {stepEditError && <p className="text-xs text-destructive">{stepEditError}</p>}
                      <button
                        className="text-xs text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                        onClick={handleApplyStepEdit}
                        disabled={isExecuting || isRecording}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                  <div className="px-3 pb-3">
                    <Textarea
                      className="font-mono text-xs resize-none w-full"
                      style={{ height: stepEditorHeight }}
                      value={editedStep}
                      onChange={(e) => { setEditedStep(e.target.value); setStepEditError(''); }}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyStepEdit();
                        }
                      }}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="border-t px-3 py-2 shrink-0">
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}
                  </p>
                </div>
              )}

              {/* Extracted values */}
              {stepRunState && Object.keys(stepRunState.extracted).length > 0 && (
                <div className="border-t px-3 py-2 shrink-0 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Extracted</p>
                  {Object.entries(stepRunState.extracted).map(([k, v]) => (
                    <div key={k} className="flex gap-1.5 text-xs">
                      <span className="font-mono text-purple-400 shrink-0">{k}</span>
                      <span className="text-muted-foreground truncate">{v}</span>
                    </div>
                  ))}
                </div>
              )}
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
              {(isRecording && liveRecordedSteps.length > 0)
                ? 'You have an active recording in progress. Your unsaved steps will be discarded.'
                : 'You have unsaved changes. Use the Save button to keep them before exiting.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => {
              pendingNavRef.current = null;
              setShowExitWarning(false);
            }}>
              Continue
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setShowExitWarning(false); performExit(); }}>
              Discard & exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
