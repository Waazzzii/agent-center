'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBrowserRunStatus,
  getNoVNCInfo,
  resumeBrowserRun,
  abortBrowserRun,
  type BrowserRunStatus,
  type NoVNCInfo,
} from '@/lib/api/agents';
import { useProvisioningPoll } from '@/lib/hooks/use-provisioning-poll';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Monitor,
  Loader2,
  CheckCircle2,
  XCircle,
  WifiOff,
  PauseCircle,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  agentId?: string;
  agentName?: string;
}

const POLL_INTERVAL_MS = 10_000;

function StatusPill({ status }: { status: BrowserRunStatus['status'] }) {
  const map: Record<
    BrowserRunStatus['status'],
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    pending:           { label: 'Pending',            cls: 'border-slate-300 text-slate-500',                          icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    provisioning:      { label: 'Provisioning',        cls: 'border-slate-300 text-slate-500',                          icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    running:           { label: 'Running',             cls: 'border-blue-300 text-blue-600 dark:text-blue-400',        icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    auth_required:     { label: 'Awaiting Login',      cls: 'border-amber-400 text-amber-600 dark:text-amber-400',     icon: <Monitor className="h-3 w-3" /> },
    awaiting_approval: { label: 'Awaiting Approval',   cls: 'border-violet-400 text-violet-600 dark:text-violet-400',  icon: <PauseCircle className="h-3 w-3" /> },
    completed:         { label: 'Completed',           cls: 'border-green-500 text-green-600 dark:text-green-400',     icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:            { label: 'Failed',              cls: 'border-red-400 text-red-600 dark:text-red-400',           icon: <XCircle className="h-3 w-3" /> },
    aborted:           { label: 'Aborted',             cls: 'border-red-400 text-red-600 dark:text-red-400',           icon: <XCircle className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={`gap-1.5 ${cls}`}>
      {icon}{label}
    </Badge>
  );
}

export function BrowserHITLDialog({ open, onOpenChange, runId, agentName }: Props) {
  const { confirm } = useConfirmDialog();
  const [runStatus, setRunStatus] = useState<BrowserRunStatus | null>(null);
  const [novnc, setNovnc] = useState<NoVNCInfo | null>(null);
  const [loadingNovnc, setLoadingNovnc] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [pollError, setPollError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whether the initial fetch found a provisioning/pending status.
  // Drives the shared provisioning poll hook for fast 3s polling.
  const [provisioningRunId, setProvisioningRunId] = useState<string | null>(null);

  // ── Provisioning poll (shared hook) — fast 3s poll while VM boots ──
  const handleProvisioningReady = useCallback((data: BrowserRunStatus) => {
    setProvisioningRunId(null);
    setRunStatus(data);
    // Start the normal 10s status poll now that provisioning is done
    startStatusPoll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProvisioningError = useCallback(() => {
    setProvisioningRunId(null);
    setPollError(true);
  }, []);

  const { isProvisioning, elapsedMs: provisioningElapsedMs } = useProvisioningPoll<BrowserRunStatus>({
    runId: provisioningRunId,
    pollFn: (id) => getBrowserRunStatus(id),
    isProvisioningStatus: (s) => s === 'provisioning' || s === 'pending',
    onReady: handleProvisioningReady,
    onError: handleProvisioningError,
  });

  // ── Load browser view once the run has an active browser instance ──
  // Don't attempt VNC while provisioning/pending — there's no instance yet.

  const browserReadyStatuses: Array<BrowserRunStatus['status']> = ['running', 'auth_required', 'awaiting_approval'];

  useEffect(() => {
    if (!open || novnc || loadingNovnc) return;
    if (!runStatus || !browserReadyStatuses.includes(runStatus.status)) return;

    setLoadingNovnc(true);
    getNoVNCInfo(runId)
      .then((info) => setNovnc(info))
      .catch(() => toast.error('Could not load browser view — check that the agent backend is running'))
      .finally(() => setLoadingNovnc(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId, runStatus?.status]);

  // ── Status polling (10s) — runs after provisioning is complete ──

  const fetchStatus = async () => {
    try {
      const data = await getBrowserRunStatus(runId);
      setRunStatus(data);
      setPollError(false);

      // Stop polling when terminal
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
      }
    } catch {
      setPollError(true);
    }
  };

  const startStatusPoll = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
  };

  // On dialog open: do an initial fetch to determine if we need the fast provisioning poll
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        const data = await getBrowserRunStatus(runId);
        setRunStatus(data);
        setPollError(false);

        if (data.status === 'provisioning' || data.status === 'pending') {
          // Hand off to the shared provisioning poll hook (3s)
          setProvisioningRunId(runId);
        } else {
          // Already past provisioning — use the normal 10s poll
          startStatusPoll();
        }
      } catch {
        setPollError(true);
      }
    })();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNovnc(null);
      setRunStatus(null);
      setPollError(false);
      setProvisioningRunId(null);
    }
  }, [open]);

  // ── HITL resume ──────────────────────────────────────────────

  const handleAbort = async () => {
    const confirmed = await confirm({
      title: 'Abort Run',
      description: 'This will stop the agent and close the browser session. Any unsaved progress will be lost. Are you sure?',
      confirmText: 'Abort Run',
      cancelText: 'Keep Running',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setAborting(true);
    try {
      await abortBrowserRun(runId);
      toast.success('Agent run aborted');
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to abort run');
    } finally {
      setAborting(false);
    }
  };

  const handleDone = async () => {
    setResuming(true);
    try {
      await resumeBrowserRun(runId);
      toast.success('Agent resuming — browser session saved');
      // Immediately flip to running so the button/banner disappear and the
      // interaction overlay is restored — don't wait for the next poll cycle.
      setRunStatus((prev) => prev ? { ...prev, status: 'running' } : prev);
      // Resume polling to track actual progress, but delay the first poll so
      // the backend has time to transition state — otherwise it returns the
      // stale auth_required status and the button flickers back.
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to resume agent');
    } finally {
      setResuming(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────

  const agentBackendUrl =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://localhost:8080'
      : '';

  const iframeUrl = novnc
    ? `${agentBackendUrl}${novnc.viewerUrl}`
    : null;

  const isAuthRequired = runStatus?.status === 'auth_required';
  const isAwaitingApproval = runStatus?.status === 'awaiting_approval';
  const isTerminal = runStatus?.status === 'completed' || runStatus?.status === 'failed' || runStatus?.status === 'aborted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0" style={{ width: '92vw', maxWidth: '1400px', height: '92vh', maxHeight: '92vh' }}>
        {/* ── Header bar ───────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
          <DialogTitle className="text-sm font-medium">
            {agentName ? `${agentName} — Live Browser` : 'Live Browser View'}
          </DialogTitle>
          {runStatus && <StatusPill status={runStatus.status} />}
          {pollError && (
            <Badge variant="outline" className="gap-1.5 border-orange-400 text-orange-500">
              <WifiOff className="h-3 w-3" />Cannot reach agent-backend
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isAuthRequired && (
              <Button
                size="sm"
                onClick={handleDone}
                disabled={resuming || aborting}
                className="h-7 bg-green-600 hover:bg-green-700 text-white text-xs"
              >
                {resuming
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Saving…</>
                  : <><CheckCircle2 className="mr-1 h-3 w-3" />Done — I'm Logged In</>
                }
              </Button>
            )}
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleAbort}
                disabled={aborting || resuming}
              >
                {aborting
                  ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Aborting…</>
                  : <>Abort Run</>
                }
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>

        {/* ── Banners (auth / approval / terminal) ─────────────── */}
        {(isAuthRequired || isAwaitingApproval || isTerminal) && (
          <div className="shrink-0 px-4 py-2 border-b">
            {isAuthRequired && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>Login required.</strong> Log in using the browser below, then click <strong>Done — I'm Logged In</strong>.
              </p>
            )}
            {isAwaitingApproval && (
              <p className="text-xs text-violet-700 dark:text-violet-400">
                <strong>Awaiting approval.</strong> This step requires manual approval before the agent can continue.
              </p>
            )}
            {isTerminal && (
              <p className={`text-xs ${runStatus?.status === 'completed' ? 'text-green-700 dark:text-green-400' : runStatus?.status === 'aborted' ? 'text-red-700 dark:text-red-400' : 'text-red-700 dark:text-red-400'}`}>
                {runStatus?.status === 'completed'
                  ? 'Agent run completed successfully.'
                  : runStatus?.status === 'aborted'
                  ? 'Agent run was aborted.'
                  : `Agent run failed${runStatus?.error ? `: ${runStatus.error}` : '.'}`}
              </p>
            )}
          </div>
        )}

        {/* ── Browser viewport ───────────────────────────────── */}
        <div className="flex-1 min-h-0 bg-black overflow-hidden relative">
            {loadingNovnc ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Starting browser view…</p>
              </div>
            ) : iframeUrl ? (
              <>
                <iframe
                  src={iframeUrl}
                  className="w-full h-full border-0 block"
                  scrolling="no"
                  title="Agent browser view"
                  allow="clipboard-read; clipboard-write"
                />
                {/* Block mouse/keyboard interaction with the browser except when
                    login is required — that's the only state where the human
                    needs to type credentials directly into the browser. */}
                {!isAuthRequired && (
                  <div className="absolute inset-0 cursor-not-allowed" />
                )}
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                {isProvisioning || runStatus?.status === 'provisioning' || runStatus?.status === 'pending' ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin opacity-50" />
                    <p className="text-sm">Starting browser instance{provisioningElapsedMs > 30_000 ? ' — this may take a minute' : ''}…</p>
                  </>
                ) : (
                  <>
                    <Monitor className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No browser view available for this run</p>
                  </>
                )}
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
