'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, ChevronRight, RotateCcw, AlertCircle, Loader2, Square } from 'lucide-react';
import {
  runScript,
  startStepRun,
  executeStepRunStep,
  retryStepRunStep,
  abortStepRun,
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
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
    default: return step.action;
  }
}

export function RunScriptModal({ script, orgId, open, onClose }: RunScriptModalProps) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [stepMode, setStepMode] = useState(false);

  // Full-run state
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ steps_run: number; screenshot?: string } | null>(null);

  // Step-run state
  const [runId, setRunId] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [stepRunState, setStepRunState] = useState<{
    currentIndex: number;
    totalSteps: number;
    step: RecordedStep | null;
    screenshot: string | null;
    extracted: Record<string, string>;
    done: boolean;
    status: 'waiting' | 'running' | 'error';
  } | null>(null);
  const [editedStep, setEditedStep] = useState<string>('');
  const [stepEditError, setStepEditError] = useState('');

  const reset = () => {
    setParams({});
    setRunning(false);
    setError(null);
    setResult(null);
    setRunId(null);
    setViewerUrl(null);
    setStepRunState(null);
    setEditedStep('');
    setStepEditError('');
  };

  const handleClose = () => {
    if (runId && orgId) abortStepRun(orgId, runId).catch(() => {});
    reset();
    onClose();
  };

  // ─── Full run ────────────────────────────────────────────────
  const handleRun = async () => {
    if (!script || !orgId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await runScript(orgId, script.id, params);
      setResult({ steps_run: res.steps_run, screenshot: res.screenshot });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to run script';
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  // ─── Step run ─────────────────────────────────────────────────
  const handleStartStepRun = async () => {
    if (!script || !orgId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await startStepRun(orgId, script.id, params);
      setRunId(res.runId);
      setViewerUrl(res.viewerUrl);
      setStepRunState({
        currentIndex: res.currentIndex,
        totalSteps: res.totalSteps,
        step: res.step,
        screenshot: null,
        extracted: {},
        done: false,
        status: 'waiting',
      });
      setEditedStep(res.step ? JSON.stringify(res.step, null, 2) : '');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to start step run';
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  };

  const handleExecuteStep = async () => {
    if (!runId || !orgId || !stepRunState) return;
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    try {
      const res = await executeStepRunStep(orgId, runId);
      setStepRunState({
        currentIndex: res.currentIndex,
        totalSteps: res.totalSteps,
        step: res.step,
        screenshot: res.screenshot,
        extracted: res.extracted,
        done: res.done,
        status: 'waiting',
      });
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

  const handleRetry = async () => {
    if (!runId || !orgId || !stepRunState) return;
    let replacementStep: RecordedStep | undefined;
    try {
      const parsed = JSON.parse(editedStep);
      if (typeof parsed === 'object' && parsed !== null && parsed.action) {
        replacementStep = parsed;
      }
      setStepEditError('');
    } catch {
      setStepEditError('Invalid JSON — fix before retrying');
      return;
    }
    setStepRunState((s) => s ? { ...s, status: 'running' } : s);
    setError(null);
    try {
      const res = await retryStepRunStep(orgId, runId, replacementStep);
      setStepRunState((s) => s ? { ...s, screenshot: res.screenshot, extracted: res.extracted, status: 'waiting' } : s);
    } catch (err: any) {
      const screenshot = err?.response?.data?.screenshot ?? null;
      const msg = err?.response?.data?.error || err?.message || 'Retry failed';
      setStepRunState((s) => s ? { ...s, status: 'error', screenshot: screenshot ?? s.screenshot } : s);
      setError(msg);
    }
  };

  const handleAbortStepRun = async () => {
    if (!runId || !orgId) return;
    await abortStepRun(orgId, runId).catch(() => {});
    setRunId(null);
    setViewerUrl(null);
    setStepRunState(null);
    setEditedStep('');
    setError(null);
  };

  if (!script) return null;

  const isExecuting = stepRunState?.status === 'running' || running;

  // ─── Full-screen step-run overlay (portal, renders outside Dialog DOM) ───
  const stepRunOverlay = runId && stepRunState && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed z-50 inset-0 md:left-64 bg-background flex flex-col">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
            <div className="flex items-center gap-2.5">
              {stepRunState.done ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : stepRunState.status === 'error' ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
              )}
              <span className="text-sm font-medium">
                {stepRunState.done ? 'Completed' : `Running: ${script.name}`}
              </span>
              <span className="text-xs text-muted-foreground">
                · step {Math.min(stepRunState.currentIndex + 1, stepRunState.totalSteps)} of {stepRunState.totalSteps}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!stepRunState.done && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    disabled={isExecuting}
                  >
                    {isExecuting && stepRunState.status === 'running' ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Retry
                  </Button>
                  <Button onClick={handleExecuteStep} disabled={isExecuting} size="sm">
                    {isExecuting ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Continue
                  </Button>
                </>
              )}
              {stepRunState.done && (
                <Button size="sm" onClick={handleClose}>Close</Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleAbortStepRun} disabled={isExecuting}>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Abort
              </Button>
            </div>
          </div>

          {/* Browser + step sidebar */}
          <div className="flex-1 min-h-0 flex">
            {/* VNC */}
            <div className="flex-1 min-w-0 overflow-hidden">
              {viewerUrl && (
                <iframe
                  src={`${agentApiUrl}${viewerUrl}`}
                  className="w-full h-full"
                  scrolling="no"
                  title="Script execution"
                />
              )}
            </div>

            {/* Right panel */}
            <div className="w-72 shrink-0 border-l flex flex-col overflow-hidden bg-background">
              {/* Step list */}
              <div className="px-3 py-2 border-b shrink-0">
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                  Steps ({stepRunState.totalSteps})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y text-xs">
                {script.steps.map((s, i) => (
                  <div
                    key={i}
                    className={cn(
                      'px-3 py-1.5 flex items-center gap-2',
                      i === stepRunState.currentIndex && !stepRunState.done
                        ? 'bg-primary/10 font-medium'
                        : i < stepRunState.currentIndex
                        ? 'text-muted-foreground line-through'
                        : 'text-muted-foreground'
                    )}
                  >
                    <span className="w-4 shrink-0 text-right tabular-nums">{i + 1}.</span>
                    <span className="truncate">{stepLabel(s)}</span>
                    {i === stepRunState.currentIndex && !stepRunState.done && (
                      <ChevronRight className="h-3 w-3 ml-auto shrink-0 text-primary" />
                    )}
                  </div>
                ))}
              </div>

              {/* Editable current step */}
              {!stepRunState.done && stepRunState.step && (
                <div className="border-t p-3 space-y-1.5 shrink-0">
                  <p className="text-xs font-medium text-muted-foreground">Current step</p>
                  <Textarea
                    className="font-mono text-xs resize-none h-24"
                    value={editedStep}
                    onChange={(e) => { setEditedStep(e.target.value); setStepEditError(''); }}
                    spellCheck={false}
                  />
                  {stepEditError && <p className="text-xs text-destructive">{stepEditError}</p>}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="border-t px-3 py-2 shrink-0">
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {error}
                  </p>
                </div>
              )}

              {/* Extracted values */}
              {Object.keys(stepRunState.extracted).length > 0 && (
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
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {stepRunOverlay}

      <Dialog open={open && !runId} onOpenChange={(o) => { if (!o && !runId) handleClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test: {script.name}</DialogTitle>
            <DialogDescription>
              {script.steps.length} step{script.steps.length !== 1 ? 's' : ''}
              {script.parameters.length > 0
                ? ` · ${script.parameters.length} parameter${script.parameters.length !== 1 ? 's' : ''} required`
                : ' · no parameters'}
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Completed</p>
                  <p className="text-sm text-muted-foreground">
                    {result.steps_run} step{result.steps_run !== 1 ? 's' : ''} executed
                  </p>
                </div>
              </div>
              {result.screenshot && (
                <img
                  src={`data:image/jpeg;base64,${result.screenshot}`}
                  className="w-full rounded border mt-3"
                  alt="Final screenshot"
                />
              )}
            </div>
          ) : (
            <div className="py-2 space-y-4">
              {script.parameters.length > 0 ? (
                script.parameters.map((param) => (
                  <div key={param} className="space-y-1.5">
                    <Label htmlFor={`param-${param}`}>{capitalize(param)}</Label>
                    <Input
                      id={`param-${param}`}
                      placeholder={`Enter ${param}…`}
                      value={params[param] ?? ''}
                      onChange={(e) => setParams((prev) => ({ ...prev, [param]: e.target.value }))}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  This script has no parameters — it will run as-is.
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <Switch id="step-mode" checked={stepMode} onCheckedChange={setStepMode} />
                <Label htmlFor="step-mode" className="cursor-pointer">
                  Step mode — execute one step at a time
                </Label>
              </div>

              {error && (
                <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={running}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            {!result && (
              <Button onClick={stepMode ? handleStartStepRun : handleRun} disabled={running}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting…
                  </>
                ) : stepMode ? (
                  'Start Step Test'
                ) : (
                  'Test Script'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
