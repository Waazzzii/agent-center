'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { RecordedStep } from '@/lib/api/scripts';
import { SelectorPanel, JsonPanel } from './panels';

type TabId = 'name' | 'selector' | 'json';

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
  step, stepIndex, open, onClose, variableNames, onSave,
}: StepEditModalProps) {
  const [draft, setDraft] = useState<RecordedStep | null>(step);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [tab, setTab] = useState<TabId>('name');
  const [saving, setSaving] = useState(false);

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
    const updated: RecordedStep = { ...draft, name: next };
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

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'name', label: 'Name' },
    { id: 'selector', label: 'Selector' },
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
            </div>
          )}

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
