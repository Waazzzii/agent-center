'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronRight, Link2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecordedStep, SelectorCandidate } from '@/lib/api/scripts';
import { primarySelector, replaceInLocators, setPrimarySelector, staticFallbacks } from '@/lib/step-locator';
import { VariableInput } from '../VariableInput';

// Order matches the runtime locator priority in
// browser-step-run-worker.service.js so the editor reads top-down the
// same way the agent tries candidates. xpath-text-contains is Tier 6.5
// (between `text` and the css/xpath positional fallbacks) — adding it
// to this allowlist is what makes the row appear in the editor; missing
// from this list = silently filtered out of the UI even when captured.
const SELECTOR_TYPES = ['id', 'data-testid', 'name', 'aria-label', 'role-label', 'role-text', 'text', 'xpath-text-contains', 'scoped-positional', 'scoped-tag', 'css-path', 'xpath', 'current'] as const;

const URL_METHODS = [
  { value: 'query_param',  label: 'Query Parameter', hint: '?key=VALUE' },
  { value: 'path_segment', label: 'Path Segment',    hint: '/a/VALUE/b' },
  { value: 'url_match',    label: 'Exact Match',     hint: 'find string in URL' },
] as const;

interface SelectorPanelProps {
  step: RecordedStep;
  stepIndex: number;
  onUpdateStep: (updated: RecordedStep) => void;
  /** For the {{variable}} insert menu. */
  variableNames?: string[];
}

export function SelectorPanel({ step, stepIndex, onUpdateStep, variableNames = [] }: SelectorPanelProps) {
  // ── URL extract steps get a dedicated editor ──────────────────
  if (step.selector === '__url__') {
    return <UrlExtractionPanel step={step} stepIndex={stepIndex} onUpdateStep={onUpdateStep} />;
  }
  return <DomSelectorPanel step={step} onUpdateStep={onUpdateStep} variableNames={variableNames} />;
}

/**
 * Where a DOM step acts. ONE editable selector; every change goes through
 * lib/step-locator so the action, its wait, the fallbacks and a skip probe
 * cannot disagree — a {{variable}} put in here reaches all of them. The
 * recorder's ranked fallbacks are folded away: they are the engine's business
 * until the selector needs replacing.
 */
function DomSelectorPanel({ step, onUpdateStep, variableNames }: { step: RecordedStep; onUpdateStep: (s: RecordedStep) => void; variableNames: string[] }) {
  const [showFallbacks, setShowFallbacks] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const candidates = step.elementSnapshot?.candidates ?? [];
  const activeSel = primarySelector(step) || null;
  const waitSel = step.waitFor?.selector ?? null;
  const waitDiffers = !!waitSel && !!step.selector && waitSel !== step.selector;
  const staticCount = staticFallbacks(step);

  // Selected text + a variable → that value becomes the variable EVERYWHERE
  // on the step, and fallbacks that would still find the recorded element go.
  const pickVariable = (variable: string, selected: string) => {
    if (!selected.trim()) return false; // plain insert at the cursor
    const r = replaceInLocators(step, selected, variable, true);
    onUpdateStep(r.step);
    setNote(
      `Replaced "${selected}" with {{${variable}}} in ${r.changed} place${r.changed === 1 ? '' : 's'}` +
      (r.dropped ? `; removed ${r.dropped} fallback${r.dropped === 1 ? '' : 's'} that ignored it.` : '.'),
    );
    return true;
  };
  const dropStatic = () => {
    const vars = (primarySelector(step).match(/\{\{\s*\w+\s*\}\}/g) ?? []);
    const kept = candidates.filter((c) => vars.some((v) => c.sel.includes(v)));
    onUpdateStep({ ...step, elementSnapshot: { ...step.elementSnapshot!, candidates: kept } });
    setNote(`Removed ${candidates.length - kept.length} fallback(s) that ignored the variable.`);
  };

  const byType = new Map<string, { sel: string; type: string }>();
  for (const c of candidates) byType.set(c.type, c);
  if (activeSel && activeSel !== 'body' && !candidates.some((c) => c.sel === activeSel)) {
    byType.set('current', { sel: activeSel, type: 'current' });
  }

  // Switching to a fallback: the action AND its wait move to it together.
  const handleSelect = (c: { sel: string; type: string }) => {
    const moved = setPrimarySelector(step, c.sel);
    onUpdateStep({ ...moved, waitFor: { ...(moved.waitFor ?? {}), selector: c.sel } });
  };

  const handleUpdateCandidate = (type: string, sel: string) => {
    // The active row IS the selector: editing it edits the step, not a copy.
    const existing = byType.get(type);
    if (type === 'current' || (existing && existing.sel === activeSel)) {
      onUpdateStep(setPrimarySelector(step, sel));
      return;
    }
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
    <div className="px-6 py-3 space-y-3">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">Selector</label>
        <VariableInput
          mono
          value={step.selector ?? waitSel ?? ''}
          onChange={(v) => { setNote(null); onUpdateStep(setPrimarySelector(step, v)); }}
          variableNames={variableNames}
          onPickVariable={pickVariable}
          placeholder="//button[contains(., 'Save')]"
          aria-label="Selector"
        />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          CSS or XPath. To make it follow a variable, select the recorded value in the box (a name, an id)
          and choose the variable — it is replaced in the action, its wait and every fallback together.
        </p>
        {!activeSel && (
          <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> No selector — the step has nothing to find.
          </p>
        )}
        {note && <p className="text-[10px] text-green-600 dark:text-green-400">{note}</p>}
        {staticCount > 0 && (
          <div className="flex items-start justify-between gap-3 rounded border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
              {staticCount} fallback{staticCount === 1 ? '' : 's'} still point at the recorded element. If the
              variable selector misses, the engine would use {staticCount === 1 ? 'it' : 'them'} and act on the
              wrong element.
            </p>
            <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]" onClick={dropStatic}>Remove</Button>
          </div>
        )}
      </div>

      {/* The wait normally watches the same element; say so, and offer to
          re-join it when someone pointed it elsewhere. */}
      {waitSel && (
        <div className="text-[10px] text-muted-foreground">
          {waitDiffers ? (
            <div className="flex items-start justify-between gap-3">
              <span>Waits first for a different element: <code className="font-mono break-all">{waitSel}</code></span>
              <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[10px]"
                onClick={() => onUpdateStep({ ...step, waitFor: { ...(step.waitFor ?? {}), selector: step.selector } })}>
                Wait for this one
              </Button>
            </div>
          ) : 'Waits for the same element before acting.'}
        </div>
      )}

      {/* Wait-state dropdown — only meaningful for wait_for steps.
          Default 'visible' keeps the original behavior (tries
          candidates, fails if nothing becomes visible). 'hidden'
          waits for the selector to be display:none/visibility:hidden/
          detached — useful for drawer-closes and modal-dismisses.
          'detached' is strictest: wait for the element to be removed
          from the DOM entirely. Candidate fallback is skipped on
          hidden/detached (operator's selector IS the spec). */}
      {step.action === 'wait_for' && (
        <div className="rounded border border-border/40 bg-muted/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Wait until
            </span>
            <Select
              value={step.wait_state ?? 'visible'}
              onValueChange={(v) =>
                onUpdateStep({ ...step, wait_state: v as 'visible' | 'hidden' | 'detached' })
              }
            >
              <SelectTrigger size="sm" className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value="visible">Visible (default)</SelectItem>
                <SelectItem value="hidden">Hidden (display:none / not visible)</SelectItem>
                <SelectItem value="detached">Detached (removed from DOM)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(step.wait_state === 'hidden' || step.wait_state === 'detached') && (
            <p className="text-[10px] text-muted-foreground leading-tight">
              Candidate fallback is skipped — the active selector above is the spec. Wait until that
              specific element {step.wait_state === 'hidden' ? 'becomes hidden or detached' : 'is removed from the DOM'}.
            </p>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <button
          type="button"
          onClick={() => setShowFallbacks((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn('h-3 w-3 transition-transform', showFallbacks && 'rotate-90')} />
          Fallbacks ({candidates.length})
          <span className="font-normal">— tried in order when the selector misses</span>
        </button>
      )}
      {showFallbacks && (
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
                <span className={cn(
                  'text-[9px] w-24 shrink-0 truncate',
                  existing ? 'text-foreground font-medium' : 'text-muted-foreground/40'
                )} title={type}>
                  {type}
                </span>
                <input
                  className="flex-1 min-w-0 text-xs font-mono bg-transparent border-none outline-none focus:bg-muted/30 rounded px-1 -mx-1 text-foreground placeholder:text-muted-foreground/30"
                  placeholder="—"
                  value={existing?.sel ?? ''}
                  onChange={(e) => handleUpdateCandidate(type, e.target.value)}
                />
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
      )}
    </div>
  );
}


// ─── URL Extraction Panel ─────────────────────────────────────────
// Shown instead of the DOM selector panel when the step is a URL extract.
// Lets the user switch between extraction methods and edit the config.

function UrlExtractionPanel({ step, stepIndex, onUpdateStep }: SelectorPanelProps) {
  const ext = step.url_extraction ?? { method: 'url_match' as const };
  const activeMethod = ext.method;
  const isTested = !!step._tested;

  const handleMethodChange = (method: 'query_param' | 'path_segment' | 'url_match') => {
    const updated = { ...step };
    if (method === 'query_param') {
      updated.url_extraction = { method, param_name: ext.param_name ?? step.field_name ?? '' };
    } else if (method === 'path_segment') {
      updated.url_extraction = { method, path_index: ext.path_index ?? 0 };
    } else {
      updated.url_extraction = { method, match_value: ext.match_value ?? step._defaultValue ?? '' };
    }
    onUpdateStep(updated);
  };

  const handleFieldUpdate = (field: string, value: string | number) => {
    const updated = { ...step, url_extraction: { ...ext, [field]: value } };
    onUpdateStep(updated);
  };

  const handleFieldNameUpdate = (name: string) => {
    onUpdateStep({ ...step, field_name: name });
  };

  return (
    <div className="px-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between pb-1">
        <h4 className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Link2 className="h-3 w-3" />
          URL Extraction <span className="font-normal text-muted-foreground">— Step {stepIndex + 1}</span>
        </h4>
        <span className={cn(
          'flex items-center gap-1 text-[9px]',
          isTested ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', isTested ? 'bg-green-500' : 'bg-blue-500')} />
          {activeMethod === 'query_param' ? 'Query Param' : activeMethod === 'path_segment' ? 'Path Segment' : 'Match'}
        </span>
      </div>

      {/* Active extraction display — mirrors the "Active selector" block on DOM steps.
          Turns green after the step has been successfully tested. */}
      <div className={cn(
        'rounded px-2.5 py-1.5',
        isTested
          ? 'bg-green-500/5 border border-green-500/20'
          : 'bg-blue-500/5 border border-blue-500/20'
      )}>
        <span className="text-[9px] text-muted-foreground">Active extraction:</span>
        <p className="text-xs font-mono text-foreground mt-0.5">
          {activeMethod === 'query_param' && `?${ext.param_name || '…'} → {{${step.field_name || '?'}}}`}
          {activeMethod === 'path_segment' && `path[${ext.path_index ?? 0}] → {{${step.field_name || '?'}}}`}
          {activeMethod === 'url_match' && `match("${ext.match_value || '…'}") → {{${step.field_name || '?'}}}`}
        </p>
        {step._defaultValue && (
          <p className="text-[9px] text-muted-foreground mt-1">Captured: <span className="font-mono text-foreground">{step._defaultValue}</span></p>
        )}
      </div>

      {/* Extraction method selector */}
      <div className="space-y-0.5">
        {URL_METHODS.map((m) => {
          const isActive = activeMethod === m.value;
          return (
            <div key={m.value} className={cn(
              'rounded border transition-colors',
              isActive ? 'border-blue-500/30 bg-blue-500/5' : 'border-border/30 hover:border-border/60'
            )}>
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <span className={cn(
                  'text-[9px] w-28 shrink-0',
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                )}>
                  {m.label}
                </span>
                <span className="text-[9px] text-muted-foreground/50 shrink-0">{m.hint}</span>
                <span className="flex-1" />
                <button
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded shrink-0 transition-colors',
                    isActive
                      ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium'
                      : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => handleMethodChange(m.value)}
                >
                  {isActive ? 'Active' : 'Use'}
                </button>
              </div>

              {/* Method-specific config — only shown for the active method */}
              {isActive && (
                <div className="px-2.5 pb-2 pt-0.5 space-y-1.5">
                  {m.value === 'query_param' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-20 shrink-0">Param name</span>
                      <input
                        className="flex-1 min-w-0 text-xs font-mono bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground"
                        value={ext.param_name ?? ''}
                        onChange={(e) => handleFieldUpdate('param_name', e.target.value)}
                        placeholder="e.g. contract_id"
                      />
                    </div>
                  )}
                  {m.value === 'path_segment' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-20 shrink-0">Segment index</span>
                      <input
                        type="number"
                        min={0}
                        className="w-16 text-xs font-mono bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground"
                        value={ext.path_index ?? 0}
                        onChange={(e) => handleFieldUpdate('path_index', parseInt(e.target.value) || 0)}
                      />
                      <span className="text-[9px] text-muted-foreground">0-based: /a/b/c → a=0, b=1, c=2</span>
                    </div>
                  )}
                  {m.value === 'url_match' && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground w-20 shrink-0">Match value</span>
                      <input
                        className="flex-1 min-w-0 text-xs font-mono bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground"
                        value={ext.match_value ?? ''}
                        onChange={(e) => handleFieldUpdate('match_value', e.target.value)}
                        placeholder="Literal string to find"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Variable name */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/30">
        <span className="text-[9px] text-muted-foreground w-20 shrink-0">Variable name</span>
        <input
          className="flex-1 min-w-0 text-xs font-mono bg-muted/30 border border-border/40 rounded px-2 py-1 text-foreground"
          value={step.field_name ?? ''}
          onChange={(e) => handleFieldNameUpdate(e.target.value)}
          placeholder="e.g. contract_id"
        />
        <span className="text-[9px] text-muted-foreground shrink-0">
          {'{{' + (step.field_name || '?') + '}}'}
        </span>
      </div>
    </div>
  );
}
