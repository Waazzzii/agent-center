'use client';

import { AlertTriangle, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordedStep, SelectorCandidate } from '@/lib/api/scripts';

const SELECTOR_TYPES = ['id', 'data-testid', 'name', 'aria-label', 'role-label', 'role-text', 'text', 'scoped-positional', 'scoped-tag', 'css-path', 'xpath', 'current'] as const;

const URL_METHODS = [
  { value: 'query_param',  label: 'Query Parameter', hint: '?key=VALUE' },
  { value: 'path_segment', label: 'Path Segment',    hint: '/a/VALUE/b' },
  { value: 'url_match',    label: 'Exact Match',     hint: 'find string in URL' },
] as const;

interface SelectorPanelProps {
  step: RecordedStep;
  stepIndex: number;
  onUpdateStep: (updated: RecordedStep) => void;
}

export function SelectorPanel({ step, stepIndex, onUpdateStep }: SelectorPanelProps) {
  // ── URL extract steps get a dedicated editor ──────────────────
  if (step.selector === '__url__') {
    return <UrlExtractionPanel step={step} stepIndex={stepIndex} onUpdateStep={onUpdateStep} />;
  }

  // ── Standard DOM selector panel ───────────────────────────────
  const candidates = step.elementSnapshot?.candidates ?? [];
  const activeSel = step.selector ?? step.waitFor?.selector ?? null;

  const byType = new Map<string, { sel: string; type: string }>();
  for (const c of candidates) byType.set(c.type, c);
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

      {activeSel && activeSel !== 'body' && (
        <div className="rounded bg-green-500/5 border border-green-500/20 px-2.5 py-1.5">
          <span className="text-[9px] text-muted-foreground">Active selector:</span>
          <p className="text-xs font-mono text-foreground truncate mt-0.5">{activeSel}</p>
        </div>
      )}

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
