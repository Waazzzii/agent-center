'use client';

/**
 * BuilderWorkspace — the live AI Script Builder session view.
 *
 * Layout mirrors RunScriptModal's proportions (viewer left, 480px right
 * panel) but as a normal page inside the dashboard shell: builder sessions
 * are long-lived and autonomous, so navigating away is harmless and the
 * sessionId in the URL makes refresh/resume trivial.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PenLine,
  Sparkles,
  Square,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { AGENT_BACKEND_URL } from '@/lib/config';
import { useBuilderSession } from '@/lib/hooks/use-builder-session';
import { isBuilderTerminal, type BuilderStatus } from '@/lib/api/script-builder';
import { getScript, type BrowserScript } from '@/lib/api/scripts';
import { ProvisioningNotice } from '@/components/hitl/ProvisioningNotice';
import { RunScriptModal } from '@/components/record/RunScriptModal';
import { DraftStepList } from './DraftStepList';
import { ActivityFeed } from './ActivityFeed';
import { ApprovalPrompt } from './ApprovalPrompt';
import { ChatInput } from './ChatInput';

const STATUS_META: Record<BuilderStatus, { label: string; className: string; spin?: boolean }> = {
  provisioning:      { label: 'Provisioning', className: 'bg-amber-500/15 text-amber-500', spin: true },
  exploring:         { label: 'Exploring', className: 'bg-blue-500/15 text-blue-400', spin: true },
  testing:           { label: 'Testing steps', className: 'bg-blue-500/15 text-blue-400', spin: true },
  awaiting_approval: { label: 'Needs approval', className: 'bg-violet-500/15 text-violet-400' },
  awaiting_user:     { label: 'Waiting for you', className: 'bg-amber-500/15 text-amber-500' },
  saving:            { label: 'Saving', className: 'bg-blue-500/15 text-blue-400', spin: true },
  done:              { label: 'Done', className: 'bg-emerald-500/15 text-emerald-500' },
  failed:            { label: 'Failed', className: 'bg-red-500/15 text-red-500' },
  stopped:           { label: 'Stopped', className: 'bg-muted text-muted-foreground' },
};

function StatusPill({ status }: { status: BuilderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'bg-muted text-muted-foreground' };
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', meta.className)}>
      {meta.spin && <Loader2 className="h-3 w-3 animate-spin" />}
      {meta.label}
    </span>
  );
}

interface BuilderWorkspaceProps {
  orgId: string;
  sessionId: string;
}

export function BuilderWorkspace({ orgId, sessionId }: BuilderWorkspaceProps) {
  const router = useRouter();
  const { confirm } = useConfirmDialog();
  const {
    session, loading, notFound, connected,
    isProvisioning, provisioningElapsedMs,
    sendMessage, approve, stop,
  } = useBuilderSession(orgId, sessionId);

  const [editorScript, setEditorScript] = useState<BrowserScript | null>(null);
  const [openingEditor, setOpeningEditor] = useState(false);

  const status = session?.status;
  const terminal = isBuilderTerminal(status);

  // ── Redirect on dead sessions ──
  useEffect(() => {
    if (notFound) {
      toast.error('Build session not found or expired');
      router.replace('/actions/browser-scripts');
    }
  }, [notFound, router]);

  // ── Warn before unload only when the agent is blocked on the human ──
  const blockedOnHuman = status === 'awaiting_approval' || status === 'awaiting_user';
  useEffect(() => {
    if (!blockedOnHuman) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [blockedOnHuman]);

  // ── Toast on NEW approval requests (deduped — refetch-driven state would
  //    otherwise re-toast on every poll) ──
  const lastApprovalToastRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = session?.pendingApproval;
    if (!pending) return;
    const marker = `${pending.reason}`;
    if (lastApprovalToastRef.current === marker) return;
    lastApprovalToastRef.current = marker;
    toast.warning('The agent is asking for approval before an irreversible action');
  }, [session?.pendingApproval]);

  // ── Derive test-run highlights from the feed ──
  const { currentTestIndex, failedIndex } = useMemo(() => {
    const events = session?.events ?? [];
    let started: number | null = null;
    let failed: number | null = null;
    for (const ev of events) {
      if (ev.type === 'run_draft_started') {
        started = typeof ev.data?.from_index === 'number' ? (ev.data.from_index as number) : 0;
        failed = null; // a new run clears the stale failure highlight
      } else if (ev.type === 'run_draft_result') {
        started = null;
        failed = ev.data?.ok ? null : (typeof ev.data?.failed_step_index === 'number' ? (ev.data.failed_step_index as number) : null);
      } else if (ev.type === 'draft_updated') {
        failed = null; // the agent edited the draft — old failure no longer applies
      }
    }
    return {
      currentTestIndex: status === 'testing' ? started : null,
      failedIndex: failed,
    };
  }, [session?.events, status]);

  const handleStop = async () => {
    const ok = await confirm({
      title: 'Stop this build session?',
      description: 'The agent will stop immediately. The draft will not be saved as a script.',
      confirmText: 'Stop session',
      cancelText: 'Keep building',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await stop();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }, message?: string });
      toast.error(msg.response?.data?.error || msg.message || 'Failed to stop session');
    }
  };

  const handleOpenEditor = async () => {
    if (!session?.scriptId) return;
    setOpeningEditor(true);
    try {
      const saved = await getScript(orgId, session.scriptId);
      setEditorScript(saved);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }, message?: string });
      toast.error(msg.response?.data?.error || msg.message || 'Failed to load the saved script');
    } finally {
      setOpeningEditor(false);
    }
  };

  if (loading && !session) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return null;

  const viewerSrc = session.viewerUrl ? `${AGENT_BACKEND_URL}${session.viewerUrl}` : null;
  const showViewer = !isProvisioning && status !== 'provisioning' && viewerSrc && !terminal;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" className="shrink-0 px-2" onClick={() => router.push('/actions/browser-scripts')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Sparkles className="h-4 w-4 text-brand shrink-0" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={session.goal}>
          {session.goal}
        </p>
        <StatusPill status={session.status} />
        <span title={connected ? 'Live updates connected' : 'Live updates reconnecting — falling back to polling'}>
          {connected
            ? <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            : <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        {!terminal && (
          <Button variant="outline" size="sm" onClick={() => void handleStop()}>
            <Square className="mr-1.5 h-3 w-3" /> Stop
          </Button>
        )}
      </div>

      {/* Completion / failure banners */}
      {status === 'done' && session.scriptId && (
        <div className="flex items-center gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 shrink-0">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <p className="flex-1 text-sm text-emerald-600 dark:text-emerald-400">
            Script saved and verified — ready to test in the editor or attach to an agent.
          </p>
          <Button size="sm" disabled={openingEditor} onClick={() => void handleOpenEditor()}>
            {openingEditor ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <PenLine className="mr-1.5 h-3.5 w-3.5" />}
            Open in editor
          </Button>
        </div>
      )}
      {status === 'failed' && (
        <div className="flex items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 shrink-0">
          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="flex-1 text-sm text-red-600 dark:text-red-400">
            {session.error || 'The build session failed.'}
          </p>
        </div>
      )}

      {/* Main: viewer + right panel */}
      <div className="flex min-h-0 flex-1">
        {/* Viewer */}
        <div className="relative min-w-0 flex-1 bg-black/5 dark:bg-black/40">
          {showViewer ? (
            <>
              <iframe
                src={viewerSrc}
                className="h-full w-full border-0"
                scrolling="no"
                allow="clipboard-read; clipboard-write"
                title="Live browser"
              />
              {/* The agent drives the browser — block user clicks on the viewer. */}
              <div className="absolute inset-0 cursor-not-allowed" aria-hidden="true" />
            </>
          ) : terminal ? (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-sm text-muted-foreground">
                {status === 'done'
                  ? 'The build is complete — the browser session has been released.'
                  : 'The browser session has ended.'}
              </p>
            </div>
          ) : (
            <ProvisioningNotice elapsedMs={provisioningElapsedMs} showPersistenceHint />
          )}
        </div>

        {/* Right panel */}
        <div className="flex w-[480px] shrink-0 flex-col border-l">
          <DraftStepList
            draft={session.draft}
            currentTestIndex={currentTestIndex}
            failedIndex={failedIndex}
            className="h-[45%] border-b"
          />
          <ActivityFeed events={session.events} className="min-h-0 flex-1" />
          {session.pendingApproval && (
            <ApprovalPrompt
              reason={session.pendingApproval.reason}
              action={session.pendingApproval.action}
              onDecide={approve}
            />
          )}
          <ChatInput
            disabled={terminal}
            awaitingUser={status === 'awaiting_user'}
            onSend={sendMessage}
          />
        </div>
      </div>

      {/* Completion handoff — RunScriptModal is a full-screen portal; mounting
          it here overlays everything, defaults to test mode, and auto-starts
          a step run on the saved script. */}
      {editorScript && (
        <RunScriptModal
          script={editorScript}
          orgId={orgId}
          open={!!editorScript}
          onClose={() => {
            setEditorScript(null);
            router.push('/actions/browser-scripts');
          }}
        />
      )}
    </div>
  );
}
