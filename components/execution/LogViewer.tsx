'use client';

/**
 * LogViewer — GCP Cloud Logging-style step viewer.
 *
 * Each execution step (tool_use, tool_result, text, result, error, init)
 * renders as a compact single-line row.  Click to expand the full payload.
 *
 * Visual pattern:
 *   [severity icon] [HH:MM:SS] [label] [truncated message] ... [badges]
 */

import { useState } from 'react';
import {
  Wrench, Terminal, FileText, Zap, AlertCircle, Clock, ChevronRight, ChevronDown, Copy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────

type StepType = 'text' | 'tool_use' | 'tool_result' | 'result' | 'init' | 'error';

interface Step {
  id: string;
  sequence: number;
  step_type: StepType;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface LogViewerProps {
  steps: Step[];
  loading?: boolean;
}

// ─── Step config ──────────────────────────────────────────────

const STEP_CONFIG: Record<StepType, {
  icon: typeof Wrench;
  color: string;
  dotColor: string;
  label: string;
}> = {
  tool_use:    { icon: Wrench,      color: 'text-blue-600 dark:text-blue-400',   dotColor: 'bg-blue-500',   label: '' },
  tool_result: { icon: Terminal,    color: 'text-slate-500 dark:text-slate-400', dotColor: 'bg-slate-400',  label: '' },
  text:        { icon: FileText,    color: 'text-emerald-600 dark:text-emerald-400', dotColor: 'bg-emerald-500', label: 'Assistant' },
  result:      { icon: Zap,         color: 'text-violet-600 dark:text-violet-400', dotColor: 'bg-violet-500', label: 'Result' },
  error:       { icon: AlertCircle, color: 'text-red-600 dark:text-red-400',     dotColor: 'bg-red-500',    label: 'Error' },
  init:        { icon: Clock,       color: 'text-slate-400',                      dotColor: 'bg-slate-300',  label: 'Init' },
};

// ─── Helpers ──────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function truncate(str: string | null, max = 120): string {
  if (!str) return '';
  const clean = str.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function formatJson(obj: unknown): string {
  if (obj == null) return '';
  if (typeof obj === 'string') {
    try { return JSON.stringify(JSON.parse(obj), null, 2); } catch { return obj; }
  }
  return JSON.stringify(obj, null, 2);
}

function getLabel(step: Step): string {
  const cfg = STEP_CONFIG[step.step_type];
  if (step.step_type === 'tool_use' || step.step_type === 'tool_result') {
    return step.tool_name ?? cfg.label ?? step.step_type;
  }
  return cfg.label || step.step_type;
}

function getPreview(step: Step): string {
  if (step.step_type === 'tool_use' && step.tool_input) {
    const keys = Object.keys(step.tool_input);
    if (keys.length <= 3) {
      return keys.map((k) => {
        const v = step.tool_input![k];
        const vs = typeof v === 'string' ? v : JSON.stringify(v);
        return `${k}: ${truncate(vs, 40)}`;
      }).join(', ');
    }
    return `{${keys.length} fields}`;
  }
  return truncate(step.content);
}

function getExpandContent(step: Step): string | null {
  if (step.step_type === 'tool_use' && step.tool_input) {
    return formatJson(step.tool_input);
  }
  if (step.content) {
    // Try to pretty-print if it's JSON
    try {
      const parsed = JSON.parse(step.content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return step.content;
    }
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────

export function LogViewer({ steps, loading }: LogViewerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="py-8 text-center text-xs text-muted-foreground">Loading steps…</div>;
  }

  if (steps.length === 0) {
    return <div className="py-8 text-center text-xs text-muted-foreground italic">No steps recorded for this action.</div>;
  }

  return (
    <div className="border rounded-md overflow-hidden text-xs">
      {steps.map((step, i) => {
        const cfg = STEP_CONFIG[step.step_type] ?? STEP_CONFIG.init;
        const Icon = cfg.icon;
        const isExpanded = expandedIds.has(step.id);
        const expandContent = getExpandContent(step);
        const hasContent = !!expandContent;
        const isError = step.step_type === 'error';

        return (
          <div key={step.id}>
            {/* Compact row */}
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 border-b border-border/40 transition-colors',
                hasContent ? 'cursor-pointer hover:bg-muted/40' : '',
                isExpanded && 'bg-muted/30',
                isError && 'bg-red-50/50 dark:bg-red-950/20',
                i % 2 === 0 && !isError && !isExpanded && 'bg-muted/10',
              )}
              onClick={() => hasContent && toggle(step.id)}
            >
              {/* Expand chevron */}
              <span className="w-3 shrink-0">
                {hasContent ? (
                  isExpanded
                    ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                ) : null}
              </span>

              {/* Severity dot */}
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dotColor)} />

              {/* Icon */}
              <Icon className={cn('h-3 w-3 shrink-0', cfg.color)} />

              {/* Timestamp */}
              <span className="text-muted-foreground/60 tabular-nums shrink-0 w-16">
                {formatTime(step.created_at)}
              </span>

              {/* Label */}
              <span className={cn('font-medium shrink-0 max-w-[140px] truncate', cfg.color)}>
                {getLabel(step)}
              </span>

              {/* Message preview */}
              <span className="text-muted-foreground truncate flex-1 font-mono">
                {getPreview(step)}
              </span>

              {/* Sequence badge */}
              <span className="text-muted-foreground/30 tabular-nums shrink-0">
                #{step.sequence}
              </span>
            </div>

            {/* Expanded payload */}
            {isExpanded && expandContent && (
              <div className="border-b border-border/40 bg-muted/20">
                <div className="flex items-start justify-between px-3 pt-2 pb-1">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                    {step.step_type === 'tool_use' ? 'Input' : step.step_type === 'tool_result' ? 'Result' : 'Content'}
                  </span>
                  <button
                    className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(expandContent);
                      toast.success('Copied');
                    }}
                  >
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                </div>
                <pre className={cn(
                  'px-3 pb-2 text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed max-h-64 overflow-auto',
                  isError ? 'text-red-700 dark:text-red-400' : 'text-foreground'
                )}>
                  {expandContent}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
