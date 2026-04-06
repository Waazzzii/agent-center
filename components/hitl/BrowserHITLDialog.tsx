'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getBrowserRunStatus,
  getNoVNCInfo,
  resumeBrowserRun,
  abortBrowserRun,
  type BrowserRunStatus,
  type NoVNCInfo,
} from '@/lib/api/agents';
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

  // ── Load browser view immediately on open ────────────────────

  useEffect(() => {
    if (!open) return;

    // Kick off the VNC session for this run as soon as the dialog opens.
    // The backend lazily starts x11vnc + websockify on first call.
    setLoadingNovnc(true);
    getNoVNCInfo(runId)
      .then((info) => setNovnc(info))
      .catch(() => toast.error('Could not load browser view — check that the agent backend is running'))
      .finally(() => setLoadingNovnc(false));
  }, [open, runId]);

  // ── Polling ──────────────────────────────────────────────────

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

  useEffect(() => {
    if (!open) return;

    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

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
      // Resume polling to track progress
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
      }
      fetchStatus();
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
        <div className="flex-1 min-h-0 bg-black overflow-hidden">
            {loadingNovnc ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Starting browser view…</p>
              </div>
            ) : iframeUrl ? (
              <iframe
                src={iframeUrl}
                className="w-full h-full border-0"
                title="Agent browser view"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                <Monitor className="h-10 w-10 opacity-30" />
                <p className="text-sm">No browser view available for this run</p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
