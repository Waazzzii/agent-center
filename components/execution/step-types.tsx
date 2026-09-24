'use client';

/**
 * What kind of step something is — label, glyph and colour — for the editor
 * flow and the run detail alike.
 *
 * Both used to keep their own map, and they disagreed: an AI step was a Bot
 * in the editor and a Zap in the run, a browser script a CircleDot in one and
 * a Play in the other. The glyphs now match the sidebar, so the icon beside a
 * step is the icon of the page you would go to to edit it.
 *
 * Colours come from the --step-* tokens (globals.css), which are chosen to
 * stay clear of brand, admin and the status tones. The raw orange/violet/
 * amber they replace each already meant something else in this product.
 */

import * as React from 'react';
import { Sparkles, UserCheck, LogIn, Video, GitBranch, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepType = 'agent' | 'approval' | 'login' | 'browser_script' | 'sub_agent';

interface StepTypeDef {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tinted tile behind the glyph. */
  tile: string;
  /** The type colour as text — for the label beside the glyph. */
  text: string;
  /** Solid fill — timeline nodes, left accents. */
  solid: string;
}

const STEP_TYPES: Record<StepType, StepTypeDef> = {
  agent:          { label: 'AI Step',        icon: Sparkles,  tile: 'bg-step-ai/12 text-step-ai',         text: 'text-step-ai',     solid: 'bg-step-ai' },
  approval:       { label: 'Human Review',   icon: UserCheck, tile: 'bg-step-review/12 text-step-review', text: 'text-step-review', solid: 'bg-step-review' },
  login:          { label: 'Browser Login',  icon: LogIn,     tile: 'bg-step-login/12 text-step-login',   text: 'text-step-login',  solid: 'bg-step-login' },
  browser_script: { label: 'Browser Script', icon: Video,     tile: 'bg-step-script/12 text-step-script', text: 'text-step-script', solid: 'bg-step-script' },
  sub_agent:      { label: 'Run Agent',      icon: GitBranch, tile: 'bg-step-agent/12 text-step-agent',   text: 'text-step-agent',  solid: 'bg-step-agent' },
};

const FALLBACK: StepTypeDef = {
  label: 'Step', icon: CircleDashed, tile: 'bg-muted text-muted-foreground', text: 'text-muted-foreground', solid: 'bg-text-dim',
};

export function stepTypeDef(type: string | null | undefined): StepTypeDef {
  return (type && STEP_TYPES[type as StepType]) || FALLBACK;
}

/** The glyph on its tinted tile. `md` for card headers, `sm` inline. */
export function StepTypeIcon({
  type, size = 'md', className,
}: { type: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const d = stepTypeDef(type);
  const Icon = d.icon;
  const box = size === 'lg' ? 'h-9 w-9 rounded-lg' : size === 'md' ? 'h-7 w-7 rounded-md' : 'h-4 w-4 rounded';
  const glyph = size === 'lg' ? 'h-[18px] w-[18px]' : size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span className={cn('grid shrink-0 place-items-center', box, d.tile, className)} title={d.label}>
      <Icon className={glyph} />
    </span>
  );
}

/** Small-caps type label, coloured — "AI STEP", "RUN AGENT". */
export function StepTypeLabel({ type, className }: { type: string; className?: string }) {
  const d = stepTypeDef(type);
  return (
    <span className={cn('shrink-0 text-[10px] font-semibold uppercase tracking-wider', d.text, className)}>
      {d.label}
    </span>
  );
}
