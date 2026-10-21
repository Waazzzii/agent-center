'use client';

/**
 * A small collapsible JSON viewer for the editor's Outputs panel. Objects and
 * arrays fold; strings that hold JSON (an extract list stored as text) are
 * parsed so they fold too. Long strings are clipped with the full value in the
 * tooltip. Read-only.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return value;
  try { return JSON.parse(t); } catch { return value; }
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground/60 italic">—</span>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span className="text-amber-500">{String(value)}</span>;
  const s = String(value);
  const short = s.length > 80 ? `${s.slice(0, 80)}…` : s;
  return <span className="text-emerald-600 dark:text-emerald-400 break-all" title={s.length > 80 ? s : undefined}>&quot;{short}&quot;</span>;
}

export function JsonNode({ name, value, depth = 0, defaultOpen = false }: {
  name?: string; value: unknown; depth?: number; defaultOpen?: boolean;
}) {
  const v = parseMaybeJson(value);
  const isBranch = v !== null && typeof v === 'object';
  const [open, setOpen] = useState(defaultOpen);
  const label = name !== undefined && <span className="text-purple-400">{name}</span>;

  if (!isBranch) {
    return (
      <div className="flex gap-1.5 min-w-0" style={{ paddingLeft: depth * 12 }}>
        {label}{label && <span className="text-muted-foreground">:</span>}
        <Scalar value={v} />
      </div>
    );
  }
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>);
  const summary = Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-left hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronRight className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')} />
        {label}
        <span className="text-muted-foreground">{summary}</span>
      </button>
      {open && entries.map(([k, x]) => <JsonNode key={k} name={k} value={x} depth={1} />)}
    </div>
  );
}
