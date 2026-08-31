'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { RecordedStep } from '@/lib/api/scripts';
import { SelectorPanel, JsonPanel } from './panels';

type TabId = 'name' | 'branch' | 'selector' | 'json';

interface StepEditModalProps {
  /** Step being edited. The modal is uncontrolled w.r.t. step data — it
   *  loads the step on open, lets the operator tweak locally, and only
   *  pushes back on Save. */
  step: RecordedStep | null;
  stepIndex: number;
  open: boolean;
  onClose: () => void;
  /** Variable names available for the JSON panel's {{insertion}} picker. */
  variableNames: string[];
  /**
   * The whole step list, used only by the Branch tab so it can show WHICH
   * steps a group owns rather than making the operator count rows. Optional:
   * every other tab edits the step in isolation.
   */
  allSteps?: RecordedStep[];
  /** Called on Save with the modified step. Caller persists via syncStepRunSteps. */
  onSave: (updated: RecordedStep) => Promise<void> | void;
}

/**
 * Modal that consolidates step-editing affordances into one place:
 *   • Name   — operator-supplied label (overrides the auto stepLabel)
 *   • Selector — DOM / URL-extract picker (same component as before,
 *     just moved out of the bottom panel)
 *   • JSON   — raw payload editor with variable autocomplete
 *
 * Opens via the pencil button on a step row. The bottom panel can stay
 * pinned to Variables since selector/JSON live here now.
 */
export function StepEditModal({
  step, stepIndex, open, onClose, variableNames, allSteps, onSave,
}: StepEditModalProps) {
  const [draft, setDraft] = useState<RecordedStep | null>(step);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [tab, setTab] = useState<TabId>('name');
  const [saving, setSaving] = useState(false);

  /**
   * Variables this step references, which are what "skip when empty" gates on.
   *
   * Reserved names are excluded: {{_mfa}} is supplied by the engine, so its
   * absence is a defect to fix rather than missing input to skip over — and
   * gating a 2FA step on it would quietly stop that step from ever running.
   */
  const gatingParams = useMemo(() => {
    if (!draft) return [];
    let text: string;
    try { text = JSON.stringify(draft); } catch { return []; }
    const found = new Set<string>();
    for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
      if (!m[1].startsWith('_')) found.add(m[1]);
    }
    return [...found];
  }, [draft]);

  // Seed local state when the modal opens, or when a different step starts
  // being edited. Crucially we depend on `stepIndex` (a number — stable) and
  // NOT `step` (a new object reference every time the parent re-renders).
  //
  // Why this matters: during save, the parent fires setStepRunState mid-await,
  // which causes a re-render BEFORE onClose runs. With `step` in the deps,
  // this effect would re-fire and reset tab/jsonText/draft to whatever the
  // parent now thinks the step is — visible as the UI "reverting" the edit
  // for a split second on save, and confusing operators who expect their
  // edits to persist until they close the modal.
  // Re-sync the draft from the incoming step whenever it changes (open,
  // different index, OR the step's content was rewritten under us — e.g. by a
  // Test & Improve walk). Keying on a JSON fingerprint means an external
  // rewrite refreshes the JSON tab instead of showing stale content. Local
  // typing edits jsonText (not the `step` prop), so this never clobbers an
  // in-progress edit; AI walks lock editing anyway.
  const stepKey = step ? JSON.stringify(step) : '';
  useEffect(() => {
    if (open) {
      setDraft(step);
      setJsonText(stepKey ? JSON.stringify(step, null, 2) : '');
      setJsonError('');
      setTab('name');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex, stepKey]);

  if (!step || !draft) return null;

  // Updates from the selector panel come back as a full step replacement;
  // sync them into the JSON tab so switching between tabs doesn't lose work.
  const handleSelectorUpdate = (updated: RecordedStep) => {
    setDraft(updated);
    setJsonText(JSON.stringify(updated, null, 2));
    setJsonError('');
  };

  const handleJsonChange = (next: string) => {
    setJsonText(next);
    setJsonError('');
    // Try to parse so a subsequent tab switch picks up the new shape.
    // Don't block typing on invalid JSON though — the operator may be
    // mid-edit. Real validation happens on Save.
    try {
      const parsed = JSON.parse(next);
      if (parsed?.action) setDraft(parsed as RecordedStep);
    } catch { /* ignore until save */ }
  };

  const handleNameChange = (next: string) => {
    // A group carries BOTH: `name` is what the editor shows, `label` is what
    // the run log prints. Letting them drift means the operator renames a
    // branch and the logs keep calling it the old thing.
    const updated: RecordedStep = draft.action === 'group'
      ? { ...draft, name: next, label: next }
      : { ...draft, name: next };
    setDraft(updated);
    setJsonText(JSON.stringify(updated, null, 2));
  };

  const handleSave = async () => {
    // Final JSON validation. If the operator edited JSON last, it might
    // be invalid — surface the error inline instead of saving stale data.
    let toSave = draft;
    if (tab === 'json') {
      try {
        const parsed = JSON.parse(jsonText);
        if (!parsed?.action) {
          setJsonError('Missing required field: action');
          return;
        }
        toSave = parsed as RecordedStep;
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
        return;
      }
    }
    // Mark the step as committed so the executor's auto-lock doesn't
    // overwrite the operator's deliberate edits on the next run.
    //
    // The executor's first-run auto-lock (browser-step-run-worker.service.js,
    // lines 985-996) rewrites `step.selector` and `step.waitFor.selector`
    // to whatever candidate just matched — but ONLY when `_tested` is
    // falsy. That's the right call on an initial recording (lock in the
    // best selector after one successful run), but it's the WRONG call
    // after a deliberate modal save: the operator opened JSON, edited a
    // value, and clicked Save — that's an explicit commit. Without this
    // line the next Run Step would silently revert the edit, which was
    // exactly the reported bug.
    //
    // The unless-the-operator-explicitly-removed-it caveat is honored:
    // if the JSON tab's parsed payload sets `_tested: false` (or omits
    // it after deletion), we respect the explicit choice. This branch
    // only DEFAULTS to true when the field is missing entirely.
    if (toSave._tested === undefined) {
      toSave = { ...toSave, _tested: true };
    }
    setSaving(true);
    try {
      await onSave(toSave);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // A group has no selector of its own — it has a GUARD and a span — so it
  // gets Branch where every other step gets Selector.
  const isGroup = draft.action === 'group';
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'name', label: 'Name' },
    isGroup ? { id: 'branch', label: 'Branch' } : { id: 'selector', label: 'Selector' },
    { id: 'json', label: 'JSON' },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Edit step {stepIndex + 1}
          </DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b -mx-6 px-6">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-brand text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="min-h-[280px] max-h-[60vh] overflow-y-auto -mx-6">
          {tab === 'name' && (
            <div className="px-6 py-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`step-name-${stepIndex}`}>
                  Display name
                </label>
                <Input
                  id={`step-name-${stepIndex}`}
                  value={draft.name ?? ''}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Open contract form"
                  autoFocus
                />
                <p className="text-[10px] text-muted-foreground">
                  Shown in the step list and timeline. Leave blank to use the auto label:
                  {' '}
                  <code className="font-mono">{autoLabelHint(draft)}</code>
                </p>
              </div>

              {/* A GROUP does not take these.
                  
                  skip_if_empty, skip_if_missing and allow_failure are per-step
                  answers to "should this one run" — a group answers that for
                  its whole branch, once, with its guard. Offering both invites
                  a step that is skipped by two mechanisms disagreeing about
                  why, and the toggles reference an input and a selector this
                  step does not have. */}
              {!isGroup && (<>
              {/* Conditional behaviour.
                  Lives on the step, next to its name, because both answer
                  "when does this step run" — and the step is the only place
                  that knows which input it fills. */}
              <div className="border-t pt-3 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium">Skip when its input is empty</p>
                    <p className="text-[10px] text-muted-foreground">
                      {gatingParams.length > 0
                        ? <>Runs only when {gatingParams.map((k, i) => (
                            <span key={k}>
                              {i > 0 && ', '}
                              <code className="font-mono">{`{{${k}}}`}</code>
                            </span>
                          ))} {gatingParams.length === 1 ? 'has' : 'all have'} a value.</>
                        : <>This step references no variables, so there is nothing to gate on.
                            Use the JSON tab to name one explicitly — useful when this step is
                            part of a chain for a field it does not itself fill.</>}
                    </p>
                  </div>
                  <Switch
                    checked={draft.skip_if_empty === true || Array.isArray(draft.skip_if_empty)}
                    disabled={gatingParams.length === 0 && !Array.isArray(draft.skip_if_empty)}
                    onCheckedChange={(v) => setDraft((d) => (d ? { ...d, skip_if_empty: v ? true : false } : d))}
                    aria-label="Skip this step when its input is empty"
                  />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium">Skip when the element is missing</p>
                    <p className="text-[10px] text-muted-foreground">
                      {draft.selector
                        ? <>Probes <code className="font-mono">{String(draft.selector).slice(0, 44)}{String(draft.selector).length > 44 ? '…' : ''}</code> first
                            and skips the step if it is not on the page. For an optional part of the
                            flow — a 2FA challenge that only appears on a new device, a banner that
                            shows once.</>
                        : <>This step has no selector to probe. Name one explicitly via the JSON tab.</>}
                    </p>
                  </div>
                  <Switch
                    checked={draft.skip_if_missing === true || typeof draft.skip_if_missing === 'string'}
                    disabled={!draft.selector && typeof draft.skip_if_missing !== 'string'}
                    onCheckedChange={(v) => setDraft((d) => (d ? { ...d, skip_if_missing: v ? true : false } : d))}
                    aria-label="Skip this step when the element is missing"
                  />
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-[11px] font-medium">Continue if this step fails</p>
                    <p className="text-[10px] text-muted-foreground">
                      {draft.requires_approval
                        ? 'Not available on a step that submits — continuing past a failed submit would report success for work that never happened.'
                        : 'Logs the error and moves on instead of failing the run. For a step that may genuinely fail. If the step is optional because the ELEMENT may not be there, use "Skip when the element is missing" instead — it avoids running the step at all.'}
                    </p>
                  </div>
                  <Switch
                    checked={draft.allow_failure === true}
                    disabled={draft.requires_approval === true}
                    onCheckedChange={(v) => setDraft((d) => (d ? { ...d, allow_failure: v } : d))}
                    aria-label="Continue if this step fails"
                  />
                </div>
              </div>
              </>)}
            </div>
          )}

          {tab === 'branch' && (() => {
            const g = (draft as { guard?: { selector?: string; timeout?: number; expect?: 'present' | 'absent' } }).guard ?? {};
            const span = (draft as { span?: number }).span ?? 1;
            const patch = (next: Partial<{ guard: typeof g; span: number }>) => {
              const updated = { ...draft, ...next } as RecordedStep;
              setDraft(updated);
              setJsonText(JSON.stringify(updated, null, 2));
            };
            // The steps this group currently owns, named. Counting rows by eye
            // is exactly how a span ends up one short or one long.
            const owned = (allSteps ?? []).slice(stepIndex + 1, stepIndex + 1 + span);
            const overrun = (allSteps?.length ?? 0) > 0 && stepIndex + span >= (allSteps as RecordedStep[]).length;
            return (
              <div className="px-6 py-3 space-y-4">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The guard is asked <span className="font-medium">once</span>, before any of these steps run.
                  If it doesn{"'"}t match, the whole branch is skipped together and nothing inside it is
                  evaluated — including any {"{{_mfa}}"} code, which is what makes this fast.
                </p>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Run this branch when</label>
                  <select
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                    value={g.expect ?? 'present'}
                    onChange={(e) => patch({ guard: { ...g, expect: e.target.value as 'present' | 'absent' } })}
                  >
                    <option value="present">this element IS on the page</option>
                    <option value="absent">this element is NOT on the page</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Guard selector</label>
                  <Input
                    value={g.selector ?? ''}
                    onChange={(e) => patch({ guard: { ...g, selector: e.target.value } })}
                    placeholder="//div[@aria-label='Secure your account']"
                    className="font-mono text-xs"
                  />
                  {!g.selector?.trim() && (
                    <p className="text-[10px] text-destructive">
                      Required — without it the group cannot decide, and the engine runs the steps rather than guessing.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Give up after (ms)
                  </label>
                  <Input
                    type="number"
                    value={g.timeout ?? 8000}
                    onChange={(e) => patch({ guard: { ...g, timeout: Number(e.target.value) || 8000 } })}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Paid in full only when the branch is ABSENT. Long enough for the element to appear,
                    short enough that a script without the branch isn{"'"}t waiting on nothing.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Steps in this branch</label>
                  <Input
                    type="number"
                    min={1}
                    value={span}
                    onChange={(e) => patch({ span: Math.max(1, Number(e.target.value) || 1) })}
                    className="text-xs w-24"
                  />
                  {overrun && (
                    <p className="text-[10px] text-destructive">
                      That reaches past the end of the script — the engine would stop at the last step.
                    </p>
                  )}
                  <ul className="mt-1.5 space-y-0.5">
                    {owned.map((st, k) => (
                      <li key={k} className="text-[11px] text-muted-foreground flex items-baseline gap-1.5">
                        <span className="tabular-nums text-muted-foreground/60">{stepIndex + 2 + k}</span>
                        <span className="truncate">{st.name?.trim() || autoLabelHint(st)}</span>
                      </li>
                    ))}
                    {owned.length === 0 && (
                      <li className="text-[11px] text-muted-foreground/60 italic">Nothing — the branch is empty.</li>
                    )}
                  </ul>
                </div>
              </div>
            );
          })()}

          {tab === 'selector' && (
            <SelectorPanel
              step={draft}
              stepIndex={stepIndex}
              onUpdateStep={handleSelectorUpdate}
            />
          )}

          {tab === 'json' && (
            <div className="flex flex-col h-[400px]">
              <JsonPanel
                stepIndex={stepIndex}
                stepAction={draft.action}
                editedStep={jsonText}
                onEditedStepChange={handleJsonChange}
                stepEditError={jsonError}
                variableNames={variableNames}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact auto label preview for the name-tab hint. */
function autoLabelHint(step: RecordedStep): string {
  switch (step.action) {
    // A group's auto label is the branch it guards, matching the step list.
    case 'group':      return (step as { label?: string }).label?.trim() || 'Optional branch';
    case 'navigate':   return `Navigate → ${step.url ?? ''}`;
    case 'click':      return `Click: ${step.text || step.selector || ''}`;
    case 'fill':       return `Fill: ${step.selector ?? ''} = ${step.value ?? ''}`;
    case 'select':     return `Select: ${step.value ?? ''} in ${step.selector ?? ''}`;
    case 'press_key':  return `Press: ${step.key ?? ''}`;
    case 'extract':    return `Extract → {{${step.field_name ?? '?'}}}`;
    case 'wait_for':   return `Wait: ${step.waitFor?.description ?? step.selector ?? 'element'}`;
    default:           return step.action;
  }
}
