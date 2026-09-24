'use client';

/**
 * The one vocabulary for run and step status.
 *
 * There were three: the run feed's badges (DS tokens), the run detail's `ST`
 * map (raw emerald/red/slate), and the tree panel's dot colours (where
 * awaiting approval was violet and queued amber). One run changed colour as
 * you drilled into it, and even the feed disagreed with itself — its leading
 * dot said "starting" was grey while the badge beside it said amber.
 *
 * Tone rules, so a new status has an obvious home:
 *   success — the work happened.
 *   danger  — the work did not happen (failed, aborted, denied).
 *   info    — the machine is working on it.
 *   brand   — a PERSON is needed. The one colour that asks for you.
 *   warning — waiting on something outside the run: a login, or a free
 *             browser (queued). It will move on its own.
 *   neutral — nothing happened, by design (skipped, not run).
 */

import * as React from 'react';
import {
  CheckCircle2, XCircle, PauseCircle, Monitor, Loader2, Clock, MinusCircle, CircleDashed, Ban,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'danger' | 'info' | 'brand' | 'warning' | 'neutral';

interface StatusDef {
  label: string;
  tone: StatusTone;
  icon: React.ComponentType<{ className?: string }>;
  /** Still moving — the dot pulses and the icon (if a spinner) spins. */
  live?: boolean;
}

const STATUS: Record<string, StatusDef> = {
  completed:         { label: 'Completed',  tone: 'success', icon: CheckCircle2 },
  approved:          { label: 'Approved',   tone: 'success', icon: CheckCircle2 },
  failed:            { label: 'Failed',     tone: 'danger',  icon: XCircle },
  aborted:           { label: 'Aborted',    tone: 'danger',  icon: Ban },
  denied:            { label: 'Denied',     tone: 'danger',  icon: XCircle },
  executing:         { label: 'Running',    tone: 'info',    icon: Loader2, live: true },
  provisioning:      { label: 'Starting',   tone: 'info',    icon: Loader2, live: true },
  awaiting_approval: { label: 'Awaiting approval', tone: 'brand', icon: PauseCircle, live: true },
  awaiting_login:    { label: 'Awaiting login',    tone: 'warning', icon: Monitor, live: true },
  queued:            { label: 'Queued',     tone: 'warning', icon: Clock },
  // Conditional-gate skip or cascade skip — the row's error_message names
  // which. Same pill for both; the behavioural split lives in item _status.
  skipped:           { label: 'Skipped',    tone: 'neutral', icon: MinusCircle },
  // Synthesised by the tree endpoint for a declared step that never got a row.
  not_run:           { label: 'Not run',    tone: 'neutral', icon: CircleDashed },
};

export function statusDef(status: string): StatusDef {
  return STATUS[status] ?? { label: status.replace(/_/g, ' '), tone: 'neutral', icon: CircleDashed };
}

export function statusLabel(status: string): string {
  return statusDef(status).label;
}

/** Background utility for a tone — for dots, bars, timeline nodes. */
export const TONE_BG: Record<StatusTone, string> = {
  success: 'bg-success',
  danger:  'bg-danger',
  info:    'bg-info',
  brand:   'bg-brand',
  warning: 'bg-warning',
  neutral: 'bg-text-dim',
};

/** Foreground utility for a tone. */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-success',
  danger:  'text-danger',
  info:    'text-info',
  brand:   'text-brand',
  warning: 'text-warning',
  neutral: 'text-muted-foreground',
};

export function StatusBadge({
  status, size = 'default', className, label,
}: {
  status: string;
  /** `sm` for dense rows (step cards, nested items). */
  size?: 'default' | 'sm';
  className?: string;
  /** Override the label, e.g. "Awaiting" where space is tight. */
  label?: string;
}) {
  const d = statusDef(status);
  const Icon = d.icon;
  return (
    <Badge
      variant={d.tone}
      className={cn(size === 'sm' ? 'h-5 px-1.5 text-[11px] gap-1' : 'gap-1.5', className)}
    >
      <Icon className={cn('h-3 w-3', d.live && Icon === Loader2 && 'animate-spin')} />
      {label ?? d.label}
    </Badge>
  );
}

export function StatusDot({ status, className }: { status: string; className?: string }) {
  const d = statusDef(status);
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      {d.live && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', TONE_BG[d.tone])} />}
      <span className={cn('relative h-2 w-2 rounded-full', TONE_BG[d.tone])} />
    </span>
  );
}
