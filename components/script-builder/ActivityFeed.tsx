'use client';

/**
 * Chronological activity feed for an AI Script Builder session — agent
 * narration, tool events, test results, user guidance, approvals.
 *
 * Unknown event types render generically so the feed stays forward-
 * compatible with new backend event vocabulary.
 */

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Bot,
  CheckCircle2,
  HelpCircle,
  ListPlus,
  PauseCircle,
  Play,
  Save,
  User,
  Wrench,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { BuilderEvent } from '@/lib/api/script-builder';

interface ActivityFeedProps {
  events: BuilderEvent[];
  className?: string;
}

function eventIcon(ev: BuilderEvent) {
  const cls = 'h-3.5 w-3.5 shrink-0 mt-0.5';
  switch (ev.type) {
    case 'narration':         return <Bot className={cn(cls, 'text-muted-foreground')} />;
    case 'tool_use':          return <Wrench className={cn(cls, 'text-muted-foreground/70')} />;
    case 'draft_updated':     return <ListPlus className={cn(cls, 'text-blue-400')} />;
    case 'run_draft_started': return <Play className={cn(cls, 'text-blue-400')} />;
    case 'run_draft_result':
      return ev.data?.ok
        ? <CheckCircle2 className={cn(cls, 'text-emerald-500')} />
        : <XCircle className={cn(cls, 'text-red-500')} />;
    case 'user_message':      return <User className={cn(cls, 'text-brand')} />;
    case 'question':          return <HelpCircle className={cn(cls, 'text-amber-500')} />;
    case 'approval_request':  return <PauseCircle className={cn(cls, 'text-violet-500')} />;
    case 'approval_decision':
      return ev.data?.approved
        ? <CheckCircle2 className={cn(cls, 'text-emerald-500')} />
        : <XCircle className={cn(cls, 'text-red-500')} />;
    case 'saved':             return <Save className={cn(cls, 'text-emerald-500')} />;
    case 'error':             return <AlertTriangle className={cn(cls, 'text-red-500')} />;
    default:                  return <Bot className={cn(cls, 'text-muted-foreground/50')} />;
  }
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function ActivityFeed({ events, className }: ActivityFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const lastSeqRef = useRef(0);

  // Track whether the user is near the bottom — only then auto-scroll, so
  // scrolling back through history isn't yanked away on each new event.
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const lastSeq = events.length ? events[events.length - 1].seq : 0;
  useEffect(() => {
    if (lastSeq > lastSeqRef.current && nearBottomRef.current) {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    lastSeqRef.current = lastSeq;
  }, [lastSeq]);

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="px-3 py-2 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground">Activity</span>
      </div>
      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-2">
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Waiting for the agent to start…</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((ev) => (
              <li key={ev.seq} className="flex items-start gap-2">
                {eventIcon(ev)}
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'text-xs whitespace-pre-wrap break-words',
                    ev.type === 'narration' ? 'text-foreground' : 'text-muted-foreground',
                    ev.type === 'user_message' && 'text-brand',
                    ev.type === 'error' && 'text-red-500',
                  )}>
                    {ev.text || ev.type}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                  {formatTime(ev.ts)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
