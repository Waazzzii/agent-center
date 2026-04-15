'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordedStep, SelectorCandidate } from '@/lib/api/scripts';

const SELECTOR_TYPES = ['id', 'data-testid', 'name', 'aria-label', 'role-label', 'role-text', 'text', 'scoped-positional', 'scoped-tag', 'css-path', 'xpath', 'current'] as const;

interface SelectorPanelProps {
  step: RecordedStep;
  stepIndex: number;
  onUpdateStep: (updated: RecordedStep) => void;
}

export function SelectorPanel({ step, stepIndex, onUpdateStep }: SelectorPanelProps) {
  const candidates = step.elementSnapshot?.candidates ?? [];
  const activeSel = step.selector ?? step.waitFor?.selector ?? null;

  const byType = new Map<string, { sel: string; type: string }>();
  for (const c of candidates) byType.set(c.type, c);
  // Ensure active selector appears even if not in candidates
  if (activeSel && activeSel !== 'body' && !candidates.some((c) => c.sel === activeSel)) {
    byType.set('current', { sel: activeSel, type: 'current' });
  }

  const handleSelect = (c: { sel: string; type: string }) => {
    const updated = { ...step };
    updated.selector = c.sel;
    updated.waitFor = { ...(updated.waitFor ?? {}), selector: c.sel };
    onUpdateStep(updated);
  };

  const handleUpdateCandidate = (type: string, sel: string) => {
    const updated = { ...step };
    const newCandidates = [...(updated.elementSnapshot?.candidates ?? [])];
    const existingIdx = newCandidates.findIndex((c) => c.type === type);
    if (existingIdx >= 0) {
      if (sel.trim()) {
        newCandidates[existingIdx] = { ...newCandidates[existingIdx], sel };
      } else {
        newCandidates.splice(existingIdx, 1);
      }
    } else if (sel.trim()) {
      newCandidates.push({ sel, type });
    }
    if (!updated.elementSnapshot) {
      updated.elementSnapshot = { tag: '', id: null, name: null, type: null, classes: [], placeholder: null, ariaLabel: null, ariaRole: null, href: null, innerText: '', candidates: [] };
    }
    updated.elementSnapshot = { ...updated.elementSnapshot, candidates: newCandidates };
    onUpdateStep(updated);
  };

  return (
    <div className="px-3 py-2 space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <h4 className="text-xs font-medium text-foreground">
          Selector <span className="font-normal text-muted-foreground">— Step {stepIndex + 1}</span>
        </h4>
        {activeSel && activeSel !== 'body' ? (
          <span className="flex items-center gap-1 text-[9px] text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Active
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            None selected
          </span>
        )}
      </div>

      {/* Active selector display */}
      {activeSel && activeSel !== 'body' && (
        <div className="rounded bg-green-500/5 border border-green-500/20 px-2.5 py-1.5">
          <span className="text-[9px] text-muted-foreground">Active selector:</span>
          <p className="text-xs font-mono text-foreground truncate mt-0.5">{activeSel}</p>
        </div>
      )}

      {/* Candidate rows */}
      <div className="space-y-0.5">
        {SELECTOR_TYPES.filter((type) => type !== 'current' || byType.has('current')).map((type) => {
          const existing = byType.get(type);
          const isActive = !!(activeSel && existing?.sel && activeSel === existing.sel);

          return (
            <div key={type} className={cn(
              'rounded border transition-colors',
              isActive ? 'border-green-500/30 bg-green-500/5' : 'border-border/30 hover:border-border/60'
            )}>
              <div className="flex items-center gap-2 px-2.5 py-1">
                {/* Type label */}
                <span className={cn(
                  'text-[9px] w-24 shrink-0 truncate',
                  existing ? 'text-foreground font-medium' : 'text-muted-foreground/40'
                )} title={type}>
                  {type}
                </span>

                {/* Selector — click to edit */}
                <input
                  className="flex-1 min-w-0 text-xs font-mono bg-transparent border-none outline-none focus:bg-muted/30 rounded px-1 -mx-1 text-foreground placeholder:text-muted-foreground/30"
                  placeholder="—"
                  value={existing?.sel ?? ''}
                  onChange={(e) => handleUpdateCandidate(type, e.target.value)}
                />

                {/* Use button */}
                <button
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded shrink-0 transition-colors',
                    isActive
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400 font-medium'
                      : existing?.sel
                      ? 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground/20 cursor-default'
                  )}
                  onClick={() => existing?.sel && handleSelect(existing)}
                  disabled={!existing?.sel}
                >
                  {isActive ? 'Active' : 'Use'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
