'use client';

/**
 * Live authoring session — watch, take over, or end.
 *
 * This is where the link from a chat lands. A model somewhere else is driving a
 * browser on a worker VM; this page shows that browser and the steps being
 * captured, side by side.
 *
 * Two things make it worth a dedicated page rather than a modal:
 *
 *   1. It has to be deep-linkable. The whole handoff is "here's a link, open
 *      it and watch" — a modal inside another page has no URL to hand over.
 *   2. It has to be gated. agent-backend's own /live/run/:runId viewer takes no
 *      auth: the runId IS the credential, and the viewer is interactive. Fine
 *      while runIds only appeared inside this app; not fine once a model is
 *      printing them into a transcript. Rendering the iframe from behind the
 *      normal session cookie plus an org-membership check means a leaked link
 *      is inert to anyone outside the org.
 *
 * The iframe is interactive on purpose. Taking the mouse mid-session is a
 * first-class move, not a debugging escape hatch — anything the operator does
 * by hand is captured into the same draft the chat is building, so "let me just
 * do this bit myself" works without anyone pressing Record.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { AGENT_BACKEND_URL } from '@/lib/config';
import {
  getAuthoringSession,
  endAuthoringSession,
  type AuthoringSessionDetail,
} from '@/lib/api/authoring-sessions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Loader2, Monitor, ShieldAlert, ArrowLeft, XCircle, MousePointer2,
  Globe, Type, ChevronDown, CornerDownLeft, Layers, Hourglass, Circle,
} from 'lucide-react';

/**
 * Steps refresh while the chat works. 5s still reads as live for a list that
 * grows a step every few seconds, and each poll costs a full authenticated
 * request — this page is not the only thing polling agent-backend, and it's a
 * view of someone ELSE's work, so it should be the cheap participant.
 */
const POLL_MS = 5000;

const ACTION_ICON: Record<string, React.ReactNode> = {
  navigate:     <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  click:        <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  fill:         <Type className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  select:       <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  press_key:    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  wait_for:     <Hourglass className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  wait_for_tab: <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  switch_tab:   <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
  close_tab:    <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
};

function stepSummary(step: AuthoringSessionDetail['steps'][number]): string {
  if (step.name) return step.name;
  switch (step.action) {
    case 'navigate':  return step.url ?? 'Navigate';
    case 'fill':      return `${step.selector ?? 'field'} = ${step.value ?? ''}`;
    case 'select':    return `${step.selector ?? 'select'} = ${step.value ?? ''}`;
    case 'press_key': return `Press ${step.key ?? '?'}`;
    default:          return step.selector ?? step.action;
  }
}

/** Password-ish values never reach the browser as plaintext; belt-and-braces. */
function maskIfSecret(text: string, selector?: string): string {
  const sel = (selector ?? '').toLowerCase();
  return /pass|pwd|secret|token|cvv|otp/.test(sel) ? text.replace(/=.*$/, '= ••••••••') : text;
}

export default function AuthoringSessionPage() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');

  const [session, setSession] = useState<AuthoringSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [ending, setEnding] = useState(false);
  // Keep the last known step list when a poll fails, so a transient blip
  // doesn't blank the panel the operator is reading.
  const lastGood = useRef<AuthoringSessionDetail | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Clipboard relay for host → VM paste.
  //
  // The viewer is a cross-origin iframe, where clipboard-read is refused:
  // Safari never delegates it and Chrome cannot prompt inside a third-party
  // frame. This page is top-level and first-party, so the same read is
  // grantable here. The iframe asks over postMessage, we answer. Without it
  // the operator can type into the remote browser but never paste into it.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== 'vnc-request-paste') return;
      const reply = (text: string) =>
        iframeRef.current?.contentWindow?.postMessage({ type: 'vnc-paste-text', text }, '*');
      navigator.clipboard.readText()
        .then((t) => reply(t ?? ''))
        // Answer even on failure — the viewer is waiting on a timeout and an
        // immediate empty reply lets it fall through to its own fallback.
        .catch(() => reply(''));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const load = useCallback(async () => {
    if (!selectedOrgId || !runId) return;
    try {
      const data = await getAuthoringSession(selectedOrgId, runId);
      setSession(data);
      lastGood.current = data;
      setGone(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 404 means the session is genuinely over (ended, or its liveness
      // lapsed and the sweeper reclaimed the browser). Stop polling — there is
      // nothing to come back to.
      if (status === 404) setGone(true);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, runId]);

  useEffect(() => { void load(); }, [load]);

  // Poll only while the tab is actually visible. A backgrounded tab left open
  // on this page would otherwise keep requesting indefinitely, and nobody is
  // reading the result. Refresh once on return so the list is current.
  useEffect(() => {
    if (gone) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => { void load(); }, POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      void load();
      start();
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, gone]);

  const handleEnd = async () => {
    if (!selectedOrgId || !runId) return;
    setEnding(true);
    try {
      await endAuthoringSession(selectedOrgId, runId);
      setGone(true);
    } finally {
      setEnding(false);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  const view = session ?? lastGood.current;
  const iframeUrl = view ? `${AGENT_BACKEND_URL}${view.viewerPath}` : null;

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/actions/browser-scripts')}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Scripts
            </Button>
            {!gone && view?.active && (
              <Badge variant="outline" className="gap-1 text-emerald-600 dark:text-emerald-400">
                <Circle className="h-2 w-2 fill-current" /> Live
              </Badge>
            )}
            {gone && <Badge variant="secondary">Ended</Badge>}
          </div>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight">Authoring session</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {view?.userEmail ? `Started by ${view.userEmail}. ` : ''}
            A chat assistant is driving this browser — you can take the mouse at any time, and
            anything you do is captured into the same script.
          </p>
        </div>
        {!gone && (
          <Button variant="outline" size="sm" onClick={handleEnd} disabled={ending}>
            {ending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
            End session
          </Button>
        )}
      </div>

      {/* Body: browser + captured steps */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Live browser */}
        <div className="min-h-[420px] overflow-hidden rounded-lg border bg-black">
          {loading && !view ? (
            <div className="flex h-full items-center justify-center text-white/60">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : gone ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white/60">
              <ShieldAlert className="h-10 w-10 opacity-40" />
              <p className="text-sm">
                This session has ended and its browser was released.
              </p>
              <p className="max-w-sm text-xs text-white/40">
                Sessions close after about fifteen minutes without activity. Any steps that
                weren&apos;t saved to a script are gone — ask the assistant to start a new session.
              </p>
            </div>
          ) : iframeUrl ? (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="h-full w-full border-0"
              title="Live authoring browser"
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-white/60">
              <Monitor className="h-10 w-10 opacity-30" />
              <p className="text-sm">No browser view available</p>
            </div>
          )}
        </div>

        {/* Captured steps */}
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Captured steps</span>
            <Badge variant="secondary">{view?.stepCount ?? 0}</Badge>
          </div>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-0">
            {!view?.steps?.length ? (
              <p className="p-4 text-xs text-muted-foreground">
                Nothing captured yet. Steps appear here as the assistant acts — and as you do.
              </p>
            ) : (
              <ol className="divide-y">
                {view.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-2">
                    <span className="w-5 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">
                      {ACTION_ICON[step.action] ?? <MousePointer2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs leading-snug">
                        {maskIfSecret(stepSummary(step), step.selector)}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {step.action}
                        </span>
                        {step.requires_approval && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-600 dark:text-amber-400">
                            approval
                          </Badge>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
