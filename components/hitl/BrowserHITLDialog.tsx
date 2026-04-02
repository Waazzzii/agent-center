'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getBrowserRunStatus,
  getNoVNCInfo,
  resumeBrowserRun,
  type BrowserRunStatus,
  type NoVNCInfo,
} from '@/lib/api/agents';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Monitor,
  Loader2,
  CheckCircle2,
  XCircle,
  WifiOff,
  RefreshCw,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  agentId: string;
  agentName?: string;
}

const POLL_INTERVAL_MS = 3_000;

function StatusPill({ status }: { status: BrowserRunStatus['status'] }) {
  const map: Record<
    BrowserRunStatus['status'],
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    pending:      { label: 'Pending',        cls: 'border-slate-300 text-slate-500',                          icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    running:      { label: 'Running',         cls: 'border-blue-300 text-blue-600 dark:text-blue-400',        icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    auth_required:{ label: 'Login Required',  cls: 'border-amber-400 text-amber-600 dark:text-amber-400',     icon: <Monitor className="h-3 w-3" /> },
    completed:    { label: 'Completed',       cls: 'border-green-500 text-green-600 dark:text-green-400',     icon: <CheckCircle2 className="h-3 w-3" /> },
    failed:       { label: 'Failed',          cls: 'border-red-400 text-red-600 dark:text-red-400',           icon: <XCircle className="h-3 w-3" /> },
  };
  const { label, cls, icon } = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={`gap-1.5 ${cls}`}>
      {icon}{label}
    </Badge>
  );
}

export function BrowserHITLDialog({ open, onOpenChange, runId, agentId, agentName }: Props) {
  const [runStatus, setRunStatus] = useState<BrowserRunStatus | null>(null);
  const [novnc, setNovnc] = useState<NoVNCInfo | null>(null);
  const [loadingNovnc, setLoadingNovnc] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [pollError, setPollError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling ──────────────────────────────────────────────────

  const fetchStatus = async () => {
    try {
      const data = await getBrowserRunStatus(runId);
      setRunStatus(data);
      setPollError(false);

      // When auth_required is detected, fetch the noVNC URL once
      if (data.status === 'auth_required' && !novnc) {
        setLoadingNovnc(true);
        try {
          const info = await getNoVNCInfo(agentId);
          setNovnc(info);
        } catch {
          toast.error('Could not load browser view — check that the noVNC server is running');
        } finally {
          setLoadingNovnc(false);
        }
      }

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
  }, [open, runId, agentId]);

  // Reset noVNC state when dialog closes
  useEffect(() => {
    if (!open) {
      setNovnc(null);
      setRunStatus(null);
      setPollError(false);
    }
  }, [open]);

  // ── HITL resume ──────────────────────────────────────────────

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
  const isTerminal = runStatus?.status === 'completed' || runStatus?.status === 'failed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full flex flex-col" style={{ maxHeight: '90vh' }}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Monitor className="h-5 w-5 text-muted-foreground" />
            <div>
              <DialogTitle className="text-base">
                {agentName ? `${agentName} — Live Browser` : 'Live Browser View'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Run ID: {runId}</p>
            </div>
            {runStatus && <StatusPill status={runStatus.status} />}
            {pollError && (
              <Badge variant="outline" className="gap-1.5 border-orange-400 text-orange-500 ml-auto">
                <WifiOff className="h-3 w-3" />Cannot reach agent-backend
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* ── Browser viewport ───────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col gap-3">

          {/* Auth-required banner */}
          {isAuthRequired && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <strong>Login required.</strong> The agent encountered a login page. Please log in
              using the browser below, then click <strong>Done — I'm Logged In</strong>.
            </div>
          )}

          {isTerminal && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              runStatus?.status === 'completed'
                ? 'border-green-400 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
                : 'border-red-400 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300'
            }`}>
              {runStatus?.status === 'completed'
                ? 'Agent run completed successfully.'
                : `Agent run failed${runStatus?.error ? `: ${runStatus.error}` : '.'}`}
            </div>
          )}

          {/* noVNC iframe */}
          <div
            className="flex-1 rounded-lg border bg-black overflow-hidden"
            style={{ minHeight: '400px' }}
          >
            {loadingNovnc ? (
              <div className="flex h-full items-center justify-center text-white/60">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : iframeUrl ? (
              <iframe
                src={iframeUrl}
                className="w-full h-full border-0"
                title="Agent browser view"
                allow="clipboard-read; clipboard-write"
              />
            ) : runStatus?.status === 'running' || runStatus?.status === 'pending' ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Agent is running — browser view will appear when login is required</p>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
                <Monitor className="h-10 w-10 opacity-30" />
                <p className="text-sm">
                  {!runStatus ? 'Loading run status…' : 'No browser view available'}
                </p>
              </div>
            )}
          </div>

          {/* Step log — compact scrollable list */}
          {(runStatus?.steps?.length ?? 0) > 0 && (
            <div className="rounded-lg border bg-muted/30 max-h-32 overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 py-2 border-b">
                Steps ({runStatus!.steps.length})
              </p>
              <div className="divide-y">
                {runStatus!.steps.slice(-10).map((step, i) => (
                  <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground tabular-nums w-16 shrink-0">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                    {step.role && (
                      <Badge variant="secondary" className="text-xs py-0 h-4">{step.role}</Badge>
                    )}
                    {step.iteration !== undefined && (
                      <span className="text-muted-foreground">Turn {step.iteration}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <DialogFooter className="gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchStatus(); }}
            disabled={pollError === false && !!intervalRef.current}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh status
          </Button>

          {isAuthRequired && (
            <Button
              size="sm"
              onClick={handleDone}
              disabled={resuming}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {resuming
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving session…</>
                : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Done — I'm Logged In</>
              }
            </Button>
          )}

          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
