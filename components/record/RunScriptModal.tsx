'use client';

import { useState, useEffect, useRef } from 'react';
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
  CircleDot, MousePointerClick, X, Save,
} from 'lucide-react';
import { useBrowserClientId } from '@/lib/hooks/use-browser-client-id';
import {
  createScript,
  updateScript,
  deleteScript,
  startStepRun,
  getStepRun,
  executeStepRunStep,
  jumpStepRunToIndex,
  abortStepRun,
  startStepRunRecording,
  stopStepRunRecording,
  updateStepRunStep,
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
    case 'wait_for':   return `Wait for: ${step._waitLabel ?? step.waitFor?.description ?? step.waitFor?.selector ?? step.selector ?? ''}`;
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
  const recordingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepListRef      = useRef<HTMLDivElement>(null);

  // ── Wait-for capture ──────────────────────────────────────────
  const [isCapturingWaitFor, setIsCapturingWaitFor] = useState(false);
  const captureAbortRef = useRef<AbortController | null>(null);

  // ── Exit warning (active session: nav interception or manual exit) ───────────
  const [showExitWarning, setShowExitWarning] = useState(false);
  // href of the internal link that was blocked by the nav guard.
  // After the session tears down cleanly, we router.push() it.
  const pendingNavRef = useRef<string | null>(null);

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
    setIsCapturingWaitFor(false);
    setShowExitWarning(false);
  };

  // ── Auto-start when overlay opens ────────────────────────────
  useEffect(() => {
    if (!open || !orgId) return;
    if (mode === 'record') {
      handleStartRecordSession();
    } else {
      setScriptName(script?.name ?? '');
      if (script && script.parameters.length === 0) {
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
    }, 800);
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
  useEffect(() => {
    if (!runId) return;

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
        setShowExitWarning(true);
      }
    };

    document.addEventListener('click', handleLinkClick, true); // capture phase

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

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

  // ── Record mode: start ────────────────────────────────────────
  // Creates a blank script then reuses startStepRun (same agent slot as test).
  const handleStartRecordSession = async () => {
    if (!orgId) return;
    setStarting(true);
    let createdScriptId: string | null = null;
    try {
      const autoName = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
      });
      const tempScript = await createScript(orgId, { name: autoName, steps: [], parameters: [] });
      createdScriptId = tempScript.id;
      setTempScriptId(tempScript.id);
      setScriptName(autoName);

      const res = await startStepRun(orgId, tempScript.id, {}, undefined, browserClientId);
      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setStepRunState({
        currentIndex: 0, totalSteps: 0, step: null, steps: [],
        screenshot: null, extracted: {}, done: false, status: 'waiting',
      });

      // Recording on immediately
      await startStepRunRecording(orgId, res.runId);
      setIsRecording(true);
    } catch (err: any) {
      // Clean up the temp script if slot allocation failed (e.g. 503 browser capacity)
      if (createdScriptId) {
        deleteScript(orgId, createdScriptId).catch(() => {});
      }
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
      // Update the step run state with the newly recorded steps so the user can replay immediately
      setStepRunState(s => s ? {
        ...s,
        totalSteps: res.totalSteps,
        steps: res.steps ?? s.steps,
        step: res.step ?? null,
        status: 'waiting',
        done: res.totalSteps === 0,
      } : s);
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
      if ((res as any).insertedCount === 0) toast.info('No steps were captured');
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
      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setStepRunState({
        currentIndex: res.currentIndex,
        totalSteps:   res.totalSteps,
        step:         res.step,
        steps:        script.steps ?? [],
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
    if (isRecording && runId && orgId) await stopStepRunRecording(orgId, runId).catch(() => {});
    if (runId && orgId) await abortStepRun(orgId, runId).catch(() => {});
    if (mode === 'record' && orgId && tempScriptId) {
      // Delete the blank placeholder if nothing was recorded / not saved
      await deleteScript(orgId, tempScriptId).catch(() => {});
    }

    const pendingNav = pendingNavRef.current;
    pendingNavRef.current = null;

    reset();
    onClose();
    if (mode !== 'record' && script) onOpenScript?.(script);

    // Resume the navigation that was blocked by the guard
    if (pendingNav) router.push(pendingNav);
  };

  const handleExit = () => {
    // Always warn when there is an active session (any mode)
    if (runId) {
      setShowExitWarning(true);
      return;
    }
    performExit();
  };

  const handleExitConfirmSave = async () => {
    setShowExitWarning(false);
    if (!orgId || !tempScriptId) return;

    let steps = stepRunState?.steps ?? [];

    // If still recording, stop first to capture final steps
    if (isRecording && runId) {
      try {
        const res = await stopStepRunRecording(orgId, runId);
        setIsRecording(false);
        setLiveRecordedSteps([]);
        steps = res.steps ?? steps;
        setStepRunState(s => s ? {
          ...s, totalSteps: res.totalSteps, steps,
          step: res.step ?? null, status: 'waiting', done: res.totalSteps === 0,
        } : s);
      } catch { /* proceed with whatever steps we have */ }
    }

    try {
      await updateScript(orgId, tempScriptId, {
        name: scriptName.trim() || 'Untitled Script',
        steps,
        parameters: extractParams(steps),
      });
      toast.success('Script saved!');
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save');
      return;
    }

    // Abort the browser session now that we've saved
    if (runId && orgId) await abortStepRun(orgId, runId).catch(() => {});

    const pendingNav = pendingNavRef.current;
    pendingNavRef.current = null;

    reset();
    onClose();
    if (pendingNav) router.push(pendingNav);
  };

  const handleSaveAndClose = async () => {
    if (!orgId || !tempScriptId) return;

    let steps = stepRunState?.steps ?? [];

    if (isRecording && runId) {
      try {
        const res = await stopStepRunRecording(orgId, runId);
        setIsRecording(false);
        setLiveRecordedSteps([]);
        steps = res.steps ?? steps;
        setStepRunState(s => s ? {
          ...s, totalSteps: res.totalSteps, steps,
          step: res.step ?? null, status: 'waiting', done: res.totalSteps === 0,
        } : s);
      } catch { /* proceed with whatever steps we have */ }
    }

    try {
      await updateScript(orgId, tempScriptId, {
        name: scriptName.trim() || 'Untitled Script',
        steps,
        parameters: extractParams(steps),
      });
      toast.success('Script saved!');
      onSaved?.();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to save');
      return;
    }

    // Abort the browser session now that we've saved
    if (runId && orgId) await abortStepRun(orgId, runId).catch(() => {});
    reset();
    onClose();
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
          toast.success(`${res.insertedCount} step${res.insertedCount !== 1 ? 's' : ''} inserted`);
        } else {
          toast.info('No new steps captured');
        }
      } else {
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
      toast.success(`Wait for set: ${result.description ?? result.selector}`);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      toast.error(err?.response?.data?.error || err?.message || 'Wait-for capture failed');
    } finally {
      captureAbortRef.current = null;
      setIsCapturingWaitFor(false);
    }
  };

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const isExecuting = stepRunState?.status === 'running' || starting;
  const isRecordMode = mode === 'record';
  const needsParams = !isRecordMode && !!script && script.parameters.length > 0 && !runId;
  const hasSteps = (stepRunState?.totalSteps ?? 0) > 0 || (stepRunState?.steps?.length ?? 0) > 0;

  // ── Unified step list source ───────────────────────────────────
  // base = already-committed steps (finalized); live = captured-but-not-yet-refined
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

          {/* Record toggle — always visible when run is active */}
          {runId && !stepRunState?.done && (
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

          {/* Wait-for picker — always visible when run is active */}
          {runId && !stepRunState?.done && (
            <Button
              variant={isCapturingWaitFor ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleCaptureWaitFor}
              disabled={(isExecuting || isRecording) && !isCapturingWaitFor}
              title={isCapturingWaitFor ? 'Cancel wait-for pick' : 'Click an element to set wait-for'}
            >
              {isCapturingWaitFor
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <MousePointerClick className="h-3.5 w-3.5" />
              }
            </Button>
          )}

          {/* Step/Auto + run — always visible when run is active */}
          {runId && !stepRunState?.done && (
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
                onClick={autoMode ? handleRunAll : handleExecuteStep}
                disabled={isExecuting || isCapturingWaitFor || isRecording || !hasSteps}
                size="sm"
              >
                {isExecuting
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : autoMode
                    ? <ChevronsRight className="mr-1.5 h-3.5 w-3.5" />
                    : <Play className="mr-1.5 h-3 w-3 fill-current" />
                }
                {autoMode ? 'Run All' : 'Next'}
              </Button>
            </>
          )}

          {/* Done — test mode when finished */}
          {!isRecordMode && stepRunState?.done && (
            <Button size="sm" variant="outline" onClick={handleExit}>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-green-500" />
              Done
            </Button>
          )}

          {/* Save icon — record mode whenever there are steps to save */}
          {isRecordMode && hasSteps && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleSaveAndClose}
              disabled={isExecuting}
              title="Save script"
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Exit — always (X icon) */}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleExit} disabled={starting} title="Exit">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Main area: VNC + right panel ────────────────────── */}
      <div className="flex-1 min-h-0 flex">

        {/* VNC */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {viewerUrl ? (
            <iframe
              src={`${agentApiUrl}${viewerUrl}`}
              className="w-full h-full"
              scrolling="no"
              title="Browser"
            />
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

                {/* Unified step list — same display logic for both record and test modes */}
                {stepsToShow.map((s, i) => {
                  // Current/completed highlighting only applies when NOT actively recording
                  const isCurrent   = !isRecording && stepRunState ? (i === stepRunState.currentIndex && !stepRunState.done) : false;
                  const isCompleted = !isRecording && stepRunState ? i < stepRunState.currentIndex : false;
                  // Show live-captured inserts after the step at currentIndex (only when base steps exist)
                  const showLiveInsert = isRecording && !showLiveDirectly && stepRunState && i === stepRunState.currentIndex;
                  const isJumping   = jumpingTo === i;
                  const isHovered   = hoveredStep === i && !isExecuting && !isRecording && !stepRunState?.done;
                  return (
                    <div key={i}>
                      <div
                        className={cn(
                          'px-3 py-1.5 flex items-center gap-2 group relative',
                          isCurrent  ? 'bg-primary/10 font-medium' : 'text-muted-foreground',
                          isHovered && !isCurrent && 'bg-muted/40 cursor-pointer',
                        )}
                        onMouseEnter={() => !isCurrent && setHoveredStep(i)}
                        onMouseLeave={() => setHoveredStep(null)}
                      >
                        <span className={cn('w-5 shrink-0 text-right tabular-nums', isCompleted && !isHovered && 'line-through')}>
                          {i + 1}.
                        </span>
                        <span className={cn('truncate flex-1', s._processing === 'refining' && 'opacity-70')}>
                          {stepLabel(s)}
                          {s._waitLabel && s.action !== 'wait_for' && (
                            <span className="block text-indigo-400/70 font-normal truncate">⏳ {s._waitLabel}</span>
                          )}
                        </span>
                        {s._processing === 'refining' ? (
                          <span className="flex items-center gap-0.5 shrink-0 text-purple-400 ml-auto">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /><span>AI</span>
                          </span>
                        ) : isCurrent && !isHovered ? (
                          <ChevronRight className="h-3 w-3 ml-auto shrink-0 text-primary" />
                        ) : isHovered ? (
                          <button
                            className="ml-auto shrink-0 flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={() => handleJumpToStep(i)}
                            disabled={isJumping}
                          >
                            {isJumping ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                            Run from here
                          </button>
                        ) : null}
                      </div>
                      {/* Live-captured steps inserted at currentIndex — neutral styling, no red */}
                      {showLiveInsert && liveRecordedSteps.map((r, ri) => (
                        <div key={`rec-${ri}`} className="px-3 py-1.5 flex items-center gap-2 text-muted-foreground bg-muted/30">
                          <span className="w-5 shrink-0 text-right tabular-nums">↳</span>
                          <span className="truncate flex-1">
                            {stepLabel(r)}
                            {r._waitLabel && r.action !== 'wait_for' && (
                              <span className="block text-indigo-400/70 font-normal truncate">⏳ {r._waitLabel}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* Recording footer — shown while recording with base steps present */}
                {isRecording && baseSteps.length > 0 && (
                  <div className="px-3 py-2 flex items-center gap-2 text-muted-foreground border-t">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-xs">Recording…</span>
                  </div>
                )}

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
                    {stepEditError && <p className="text-xs text-destructive">{stepEditError}</p>}
                  </div>
                  <div className="px-3 pb-3">
                    <Textarea
                      className="font-mono text-xs resize-none w-full"
                      style={{ height: stepEditorHeight }}
                      value={editedStep}
                      onChange={(e) => { setEditedStep(e.target.value); setStepEditError(''); }}
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
              {isRecordMode && (liveRecordedSteps.length > 0 || (stepRunState?.steps?.length ?? 0) > 0)
                ? (liveRecordedSteps.length > 0
                    ? 'You have an active recording in progress. Save your steps before exiting, or discard them.'
                    : "You have recorded steps that haven't been saved yet. Save the script before exiting, or discard your work.")
                : 'Are you sure you want to exit the session? The browser instance will be closed and any unsaved changes will be lost.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => {
              pendingNavRef.current = null;
              setShowExitWarning(false);
            }}>
              Keep session
            </Button>
            <Button variant="destructive" size="sm" onClick={() => { setShowExitWarning(false); performExit(); }}>
              Exit session
            </Button>
            {isRecordMode && (liveRecordedSteps.length > 0 || (stepRunState?.steps?.length ?? 0) > 0) && (
              <Button size="sm" onClick={handleExitConfirmSave}>
                Save Script
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
