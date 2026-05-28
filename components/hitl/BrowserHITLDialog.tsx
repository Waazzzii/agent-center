'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBrowserRunStatus,
  getNoVNCInfo,
  resumeBrowserRun,
  abortBrowserRun,
  openBrowserForRun,
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
import { toast } from 'sonner';
import {
  Monitor,
  Loader2,
  CheckCircle2,
  XCircle,
  WifiOff,
  PauseCircle,
} from 'lucide-react';
import { ProvisioningNotice } from './ProvisioningNotice';
import { useEventStream } from '@/lib/hooks/use-event-stream';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  agentId?: string;
  agentName?: string;
  /**
   * 'observe' (default) — user is watching a background task.  They can
   *   close the dialog freely (session continues), or abort to kill it.
   *
   * 'interactive' — user is actively engaged (e.g. manual login).  The
   *   close button, Esc, and outside-click are disabled.  The only ways
   *   to exit are Done (success) or Abort (kill).
   */
  mode?: 'observe' | 'interactive';
  /**
   * Affects user-facing copy only — the dialog flips between login-themed
   * wording ("Awaiting Login" / "Done — I'm Logged In") and logout-themed
   * wording ("Awaiting Logout" / "Done — I'm Logged Out"). Defaults to
   * 'login' since the vast majority of interactive flows are logins.
   */
  purpose?: 'login' | 'logout';
  /**
   * Fires when the user clicks Done for a manual-login flow and the backend
   * has kicked off the independent post-login verify run. The caller (login
   * details page) uses this id to subscribe to the verify's status so the
   * "Verifying..." spinner can flip to its terminal state when verify
   * completes. Not fired for logout flows or when the backend doesn't
   * return a verifyRunId.
   */
  onVerifyStarted?: (verifyRunId: string) => void;
}

const POLL_INTERVAL_MS = 10_000;

function StatusPill({ status, purpose = 'login' }: { status: BrowserRunStatus['status']; purpose?: 'login' | 'logout' }) {
  const authLabel = purpose === 'logout' ? 'Awaiting Logout' : 'Awaiting Login';
  const map: Record<
    BrowserRunStatus['status'],
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    pending:           { label: 'Pending',            cls: 'border-slate-300 text-slate-500',                          icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    provisioning:      { label: 'Provisioning',        cls: 'border-slate-300 text-slate-500',                          icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    running:           { label: 'Running',             cls: 'border-blue-300 text-blue-600 dark:text-blue-400',        icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    auth_required:     { label: authLabel,             cls: 'border-amber-400 text-amber-600 dark:text-amber-400',     icon: <Monitor className="h-3 w-3" /> },
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

export function BrowserHITLDialog({ open, onOpenChange, runId, agentName, mode = 'observe', purpose = 'login', onVerifyStarted }: Props) {
  // postDone = the user has clicked the Done button and we've handed off
  // to the backend for session-save + (for logins) post-Done verification.
  // The original browser slot is being torn down; a fresh one may be
  // allocated server-side for the verify. We do NOT want the user trapped
  // in interactive mode while that runs — close should be allowed, and
  // the live-viewer iframe should be hidden (it points at a now-dead VNC
  // endpoint).
  const [postDone, setPostDone] = useState(false);
  const isInteractive = mode === 'interactive' && !postDone;
  const isLogout = purpose === 'logout';
  const doneLabel = isLogout ? "Done — I'm Logged Out" : "Done — I'm Logged In";
  const authBannerStrong = isLogout ? 'Logout required.' : 'Login required.';
  const authBannerBody = isLogout
    ? 'Log out using the browser below, then click '
    : 'Log in using the browser below, then click ';
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
  // Don't attempt VNC after Done has been clicked either — the worker slot
  // is being torn down by the server, so any call would either hit a dead
  // VNC endpoint or race the loginRun's 30s grace and surface a misleading
  // "Run not found" toast even though the operation succeeded.

  const browserReadyStatuses: Array<BrowserRunStatus['status']> = ['running', 'auth_required', 'awaiting_approval'];

  useEffect(() => {
    if (!open || novnc || loadingNovnc) return;
    if (postDone) return; // post-Done: we've already hidden the iframe behind the overlay
    if (!runStatus || !browserReadyStatuses.includes(runStatus.status)) return;

    setLoadingNovnc(true);
    getNoVNCInfo(runId)
      .then((info) => setNovnc(info))
      .catch(() => toast.error('Could not load browser view — check that the agent backend is running'))
      .finally(() => setLoadingNovnc(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, runId, runStatus?.status, postDone]);

  // ── Status polling (10s) — runs after provisioning is complete ──
  // Kept as a safety net; SSE below drives the fast path.

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

  // ── Realtime: flip the status pill the moment the backend transitions.
  // `run:<runId>` is the universal topic — works for both agent executions
  // and standalone login runs.  Refetch on any event since the status
  // mapping (auth_required vs awaiting_approval etc.) is server-side.
  useEventStream({
    topics: open && runId ? [`run:${runId}`] : [],
    enabled: open,
    onEvent: () => { fetchStatus().catch(() => {}); },
  });

  const startStatusPoll = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
  };

  // On dialog open: lazily allocate a browser slot, then start status polling.
  // In the per-action browser model, paused runs have no live browser until
  // the user clicks "Open Browser" — /agent/run/:id/open-browser allocates on demand.
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        // Lazy allocation — server provisions a browser seeded with the saved session.
        await openBrowserForRun(runId).catch(() => {
          // Harmless if a slot is already allocated (the endpoint is idempotent).
        });

        const data = await getBrowserRunStatus(runId);
        setRunStatus(data);
        setPollError(false);

        if (data.status === 'provisioning' || data.status === 'pending') {
          setProvisioningRunId(runId);
        } else {
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
      setPostDone(false);
    }
  }, [open]);

  // ── HITL resume ──────────────────────────────────────────────

  /**
   * Close the dialog.  Behind the scenes we abort the browser session so the
   * slot is released.  This only ends the login attempt — any workflow runs
   * waiting on the login stay paused and can be retried from the Logins or
   * Interactions list.  Use the run row's abort control to stop a workflow.
   */
  const handleAbort = async () => {
    setAborting(true);
    try {
      await abortBrowserRun(runId);
    } catch {
      // Slot may already be gone — closing is still the right outcome.
    } finally {
      setAborting(false);
      onOpenChange(false);
    }
  };

  const handleDone = async () => {
    setResuming(true);
    try {
      const { verifyRunId } = await resumeBrowserRun(runId);
      // For logins, the server kicks off an independent background verify
      // (separate logId) right after the save — its result will reflect
      // on the Logins list row, not this dialog. For logouts, the save
      // IS the job. Either way, the user is done here — auto-close the
      // dialog. Leaving it open invited stale-runId 404s from getNoVNCInfo
      // / getBrowserRunStatus once the loginRun's 30s grace expired,
      // which surfaced as misleading "Run not found" toasts even when
      // the operation had succeeded.
      toast.success(
        purpose === 'logout'
          ? 'Logged out — session saved.'
          : 'Logged in — verifying in the background.'
      );
      // Stop any polling/SSE-driven status refetches we were running
      // against this runId; the backend cleanup continues independently,
      // and the Logins list row + Recent Runs panel are the source of
      // truth for the final outcome.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setNovnc(null);
      onOpenChange(false);
      // Hand the verify run's id to the caller AFTER closing the dialog,
      // so the parent's activeSession swap doesn't briefly re-render this
      // dialog with the new runId during teardown. Logouts and agent-
      // action resumes return null here.
      if (verifyRunId && purpose !== 'logout') {
        onVerifyStarted?.(verifyRunId);
      }
    } catch (err: any) {
      // Real failure (e.g. resume route rejected) — keep the dialog open
      // so the user can see what happened.
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // In interactive mode the user must explicitly Abort or Done — don't
        // let them back out of the flow by pressing Esc / clicking outside.
        if (!nextOpen && isInteractive) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="flex flex-col p-0 gap-0"
        style={{ width: '92vw', maxWidth: '1400px', height: '92vh', maxHeight: '92vh' }}
        showCloseButton={!isInteractive}
        onEscapeKeyDown={(e) => { if (isInteractive) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (isInteractive) e.preventDefault(); }}
        onInteractOutside={(e) => { if (isInteractive) e.preventDefault(); }}
      >
        {/* ── Header bar ───────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b shrink-0">
          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
          <DialogTitle className="text-sm font-medium">
            {agentName ? `${agentName} — Live Browser` : 'Live Browser View'}
          </DialogTitle>
          {runStatus && <StatusPill status={runStatus.status} purpose={purpose} />}
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
                  : <><CheckCircle2 className="mr-1 h-3 w-3" />{doneLabel}</>
                }
              </Button>
            )}
            {/* Close button.
                - observe (background task): closes the dialog; session keeps
                  running so the user can come back later.
                - interactive (manual login): tears down the browser session
                  too, since leaving it mid-login would waste a slot.  The
                  workflow runs waiting on the login stay paused and can be
                  retried any time. */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={isTerminal || !isInteractive ? () => onOpenChange(false) : handleAbort}
              disabled={aborting || resuming}
            >
              {aborting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              Close
            </Button>
          </div>
        </div>

        {/* ── Banners (auth / approval / terminal) ─────────────── */}
        {(isAuthRequired || isAwaitingApproval || isTerminal) && (
          <div className="shrink-0 px-4 py-2 border-b">
            {isAuthRequired && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                <strong>{authBannerStrong}</strong> {authBannerBody}<strong>{doneLabel}</strong>.
              </p>
            )}
            {isAwaitingApproval && (
              <p className="text-xs text-violet-700 dark:text-violet-400">
                <strong>Awaiting approval.</strong> This step requires manual approval before the agent can continue.
              </p>
            )}
            {isTerminal && (() => {
              // Tailor the wording to login / logout flows when the dialog
              // is purpose-scoped; otherwise stay generic for agent runs.
              // For login, "completed" here means session was saved — the
              // independent verify runs as a separate background job and
              // its outcome shows on the Logins list row, not this dialog.
              const succeededTxt =
                purpose === 'logout' ? 'Logged out — session saved.' :
                purpose === 'login'  ? 'Session saved — running background verify (the login row will update shortly).' :
                'Agent run completed successfully.';
              const failedPrefix =
                purpose === 'logout' ? 'Logout did not complete' :
                purpose === 'login'  ? 'Login flow failed' :
                'Agent run failed';
              const abortedTxt =
                purpose === 'logout' ? 'Logout was aborted.' :
                purpose === 'login'  ? 'Login was aborted.' :
                'Agent run was aborted.';
              return (
                <p className={`text-xs ${runStatus?.status === 'completed' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {runStatus?.status === 'completed'
                    ? succeededTxt
                    : runStatus?.status === 'aborted'
                    ? abortedTxt
                    : `${failedPrefix}${runStatus?.error ? `: ${runStatus.error}` : '.'}`}
                </p>
              );
            })()}
          </div>
        )}

        {/* ── Browser viewport ───────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden relative bg-muted/30">
            {postDone && !isTerminal ? (
              // After Done, the original viewer is dead. The server's
              // doing its post-flight work (session save, sibling resume,
              // and for logins a background verify on a separate run).
              // Calm overlay; the user can close any time.
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">
                  {purpose === 'logout' ? 'Saving logged-out session…' : 'Saving session…'}
                </p>
                <p className="text-xs">You can close this window. The login row will update when the background verify finishes.</p>
              </div>
            ) : isProvisioning || runStatus?.status === 'provisioning' || runStatus?.status === 'pending' ? (
              <ProvisioningNotice
                elapsedMs={provisioningElapsedMs}
                showPersistenceHint={!isInteractive}
              />
            ) : loadingNovnc ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Starting browser view…</p>
              </div>
            ) : iframeUrl ? (
              <div className="w-full h-full bg-black relative">
                <iframe
                  src={iframeUrl}
                  className="w-full h-full border-0 block"
                  scrolling="no"
                  title="Agent browser view"
                  allow="clipboard-read; clipboard-write"
                />
                {/* Block mouse/keyboard interaction in observe mode. In
                    interactive mode (manual login / HITL flows) the user must
                    be able to interact for the entire dialog lifetime,
                    regardless of status flicker — keying the overlay off
                    `runStatus.status === 'auth_required'` causes interactivity
                    to drop whenever the backend briefly reports a different
                    status (SSE event, polling lag, transient state). The
                    `mode` prop is the stable source of truth. */}
                {!isInteractive && !isAuthRequired && (
                  <div className="absolute inset-0 cursor-not-allowed" />
                )}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Monitor className="h-10 w-10 opacity-30" />
                <p className="text-sm">No browser view available for this run</p>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
