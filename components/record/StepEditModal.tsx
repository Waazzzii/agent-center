'use client';

import { useEffect, useMemo, useState } from 'react';
import { Code2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { RecordedStep } from '@/lib/api/scripts';
import { SelectorPanel, JsonPanel } from './panels';
import { ExtractOptionsPanel } from './ExtractOptionsPanel';
import { FileStepFields } from './FileStepFields';
import { VariableInput } from './VariableInput';
import { LOGIN_INDICATOR_BLOCKED, fileStepErrors, fileStepLabel, isFileStep, stepOutputNames } from '@/lib/file-steps';

type TabId = 'step' | 'action' | 'branch' | 'element' | 'options' | 'json';

/** Steps that find an element on the page — the ones with an Element tab. */
const LOCATES = new Set(['click', 'fill', 'select', 'wait_for', 'extract', 'download', 'upload']);

interface StepEditModalProps {
  /** Step being edited. The modal is uncontrolled w.r.t. step data — it
   *  loads the step on open, lets the operator tweak locally, and only
   *  pushes back on Save. */
  step: RecordedStep | null;
  stepIndex: number;
  open: boolean;
  onClose: () => void;
  /** Variable names offered by every {{variable}} insert menu. */
  variableNames: string[];
  /**
   * The whole step list, used only by the Branch tab so it can show WHICH
   * steps a group owns rather than making the operator count rows. Optional:
   * every other tab edits the step in isolation.
   */
  allSteps?: RecordedStep[];
  /** Called on Save with the modified step. Caller persists via syncStepRunSteps. */
  onSave: (updated: RecordedStep) => Promise<void> | void;
  /**
   * Offer "Proves we are signed in". Only a business script has a session to
   * prove — a login script IS the sign-in — so the caller turns this off for
   * login scripts. Default on.
   */
  showLoginIndicator?: boolean;
}

/**
 * Editing one step, one concern per tab and only the tabs the step has:
 *   • Step    — its name and what it does (the url, the value, the key…)
 *   • <its own> — Extract / Download / Upload / Capture / Analyze / Branch
 *   • Element — where it acts, for steps that find an element
 *   • Options — when it runs: skip rules, failure, sign-in proof, time limit
 *
 * The raw JSON is not a tab: it is the escape hatch in the footer, for the
 * rare field no form covers. Everything an operator routinely changes —
 * including putting a {{variable}} into a value or a selector — has a field.
 */
export function StepEditModal({
  step, stepIndex, open, onClose, variableNames: inputNames, allSteps, onSave, showLoginIndicator = true,
}: StepEditModalProps) {
  // What every {{variable}} menu in this step offers: the script's variables
  // plus everything an EARLIER step writes (an Analyze answer, an extract, a
  // file id) — even before anything uses it, so it can be picked to begin with.
  const variableNames = useMemo(
    () => [...new Set([...inputNames, ...stepOutputNames((allSteps ?? []).slice(0, stepIndex))])],
    [inputNames, allSteps, stepIndex],
  );

  const [draft, setDraft] = useState<RecordedStep | null>(step);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [tab, setTab] = useState<TabId>('step');
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

  // Re-seed when the modal opens, a different step is edited, or the step was
  // rewritten under us (a Test & Improve walk). Keyed on a JSON fingerprint
  // and the index — NOT the `step` object, which is a new reference on every
  // parent render and would reset the edit mid-save.
  const stepKey = step ? JSON.stringify(step) : '';
  useEffect(() => {
    if (open) {
      setDraft(step);
      setJsonError('');
      setTab('step');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepIndex, stepKey]);

  if (!step || !draft) return null;

  const patch = (p: Partial<RecordedStep>) => setDraft((d) => (d ? { ...d, ...p } as RecordedStep : d));

  // JSON is entered from the footer and left the same way; the form is the
  // source of truth everywhere else.
  const openJson = () => { setJsonText(JSON.stringify(draft, null, 2)); setJsonError(''); setTab('json'); };
  const parseJson = (): RecordedStep | null => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed?.action) { setJsonError('Missing required field: action'); return null; }
      return parsed as RecordedStep;
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      return null;
    }
  };
  const closeJson = () => {
    const parsed = parseJson();
    if (!parsed) return;
    setDraft(parsed);
    setTab('step');
  };

  const handleNameChange = (next: string) => {
    // A group carries BOTH: `name` is what the editor shows, `label` is what
    // the run log prints. Letting them drift means the operator renames a
    // branch and the logs keep calling it the old thing.
    patch(draft.action === 'group' ? { name: next, label: next } : { name: next });
  };

  const handleSave = async () => {
    let toSave = draft;
    if (tab === 'json') {
      const parsed = parseJson();
      if (!parsed) return;
      toSave = parsed;
    }
    // A deliberate save is a commit: mark it _tested so the executor's
    // first-run auto-lock (which rewrites selector / waitFor.selector to
    // whichever candidate matched, only while _tested is falsy) cannot
    // silently revert the edit on the next Run Step. An explicit
    // `_tested: false` from the JSON view is respected.
    if (toSave._tested === undefined) toSave = { ...toSave, _tested: true };
    // "Skip when missing" switched on with no element named yet is not a rule.
    if (toSave.skip_if_missing === '') toSave = { ...toSave, skip_if_missing: false };
    setSaving(true);
    try {
      await onSave(toSave);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const isGroup = draft.action === 'group';
  // The indicator must FAIL when signed out, which means it has to locate an
  // element. Kept in step with LOGIN_INDICATOR_BLOCKED in step-schema.js.
  const canIndicate = !LOGIN_INDICATOR_BLOCKED.includes(draft.action);
  const isFile = isFileStep(draft);
  const isUrlExtract = draft.action === 'extract' && draft.selector === '__url__';
  const pointOnly = draft.action === 'click' && !!draft.point && !draft.selector;

  // The step's own tab, named for what it is rather than "File".
  const actionLabel =
    draft.action === 'extract' && !isUrlExtract ? 'Extract'
    : draft.action === 'download' ? 'Download'
    : draft.action === 'upload' ? 'Upload'
    : draft.action === 'save_page' ? (draft.clip ? 'Region' : 'Capture')
    : draft.action === 'analyze_image' ? 'Analyze'
    : null;
  const hasElement = !isGroup && LOCATES.has(draft.action) && !pointOnly;
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'step', label: 'Step' },
    ...(actionLabel ? [{ id: 'action' as TabId, label: actionLabel }] : []),
    ...(isGroup ? [{ id: 'branch' as TabId, label: 'Branch' }] : []),
    ...(hasElement ? [{ id: 'element' as TabId, label: isUrlExtract ? 'URL' : 'Element' }] : []),
    ...(!isGroup ? [{ id: 'options' as TabId, label: 'Options' }] : []),
  ];
  const fileErrors = isFile ? fileStepErrors(draft) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Edit step {stepIndex + 1}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{actionName(draft)}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b -mx-6 px-6">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => (tab === 'json' ? (() => { const p = parseJson(); if (p) { setDraft(p); setTab(t.id); } })() : setTab(t.id))}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  active ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="min-h-[280px] max-h-[60vh] overflow-y-auto -mx-6">
          {tab === 'step' && (
            <div className="px-6 py-3 space-y-4">
              <Field
                label="Name"
                htmlFor={`step-name-${stepIndex}`}
                hint={<>Shown in the step list and the run log. Blank uses <code className="font-mono">{autoLabelHint(draft)}</code></>}
              >
                <Input
                  id={`step-name-${stepIndex}`}
                  value={draft.name ?? ''}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Open contract form"
                  autoFocus
                  className="text-xs"
                />
              </Field>
              <StepFields step={draft} patch={patch} variableNames={variableNames} />
            </div>
          )}

          {tab === 'options' && !isGroup && (
            <div className="px-6 py-3 space-y-3">
              <Toggle
                title="Skip when its input is empty"
                checked={draft.skip_if_empty === true || Array.isArray(draft.skip_if_empty)}
                disabled={gatingParams.length === 0 && !Array.isArray(draft.skip_if_empty)}
                onChange={(v) => patch({ skip_if_empty: v ? true : false })}
              >
                {gatingParams.length > 0
                  ? <>Runs only when {gatingParams.map((k, i) => (
                      <span key={k}>{i > 0 && ', '}<code className="font-mono">{`{{${k}}}`}</code></span>
                    ))} {gatingParams.length === 1 ? 'has' : 'all have'} a value.</>
                  : 'This step uses no variables, so there is nothing to gate on.'}
              </Toggle>

              <Toggle
                title="Skip when the element is missing"
                checked={draft.skip_if_missing === true || typeof draft.skip_if_missing === 'string'}
                onChange={(v) => patch({ skip_if_missing: v ? (draft.selector ? true : '') : false })}
              >
                For an optional part of the flow — a 2FA challenge that only appears on a new device, a banner that
                shows once. Probes the element first and skips the step if it is not on the page.
              </Toggle>
              {(typeof draft.skip_if_missing === 'string' || (draft.skip_if_missing === true && !draft.selector)) && (
                <Field label="Element to probe" hint="Skip this step when this is not on the page. Blank probes the step's own selector.">
                  <VariableInput
                    mono
                    value={typeof draft.skip_if_missing === 'string' ? draft.skip_if_missing : ''}
                    onChange={(v) => patch({ skip_if_missing: v.trim() ? v : (draft.selector ? true : '') })}
                    variableNames={variableNames}
                    placeholder="#mfa-challenge"
                  />
                </Field>
              )}

              <Toggle
                title="Continue if this step fails"
                checked={draft.allow_failure === true}
                disabled={draft.requires_approval === true}
                onChange={(v) => patch({ allow_failure: v })}
              >
                {draft.requires_approval
                  ? 'Not available on a step that submits — continuing past a failed submit would report success for work that never happened.'
                  : 'Logs the error and moves on. If the step is optional because the element may not be there, use "Skip when the element is missing" instead.'}
              </Toggle>

              {showLoginIndicator && (
                <Toggle
                  title="Proves we are signed in"
                  checked={draft.login_indicator === true}
                  disabled={!canIndicate || draft.requires_approval === true}
                  onChange={(v) => patch({ login_indicator: v })}
                >
                  {canIndicate
                    ? (draft.requires_approval
                        ? 'Not available on a step that submits: a failed indicator re-runs the script from the start, so the submit would happen twice.'
                        : 'If it fails, the engine signs in and re-runs the script from the start — so it must come before anything that submits. One per script.')
                    : 'This step cannot prove a session — it succeeds with nothing on the page.'}
                </Toggle>
              )}

              <Field label="Time limit (ms)" hint="Blank uses the default (about 15 s for most steps).">
                <Input
                  type="number"
                  min={500}
                  max={300000}
                  className="w-32 text-xs"
                  placeholder="15000"
                  value={draft.timeout ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ timeout: Number.isFinite(n) && n > 0 ? n : undefined });
                  }}
                />
              </Field>
            </div>
          )}

          {tab === 'branch' && (() => {
            const g = (draft as { guard?: { selector?: string; timeout?: number; expect?: 'present' | 'absent' } }).guard ?? {};
            const span = (draft as { span?: number }).span ?? 1;
            const patchGroup = (next: Partial<{ guard: typeof g; span: number }>) =>
              setDraft((d) => (d ? { ...d, ...next } as RecordedStep : d));
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
                  <Select
                    value={g.expect ?? 'present'}
                    onValueChange={(v) => patchGroup({ guard: { ...g, expect: v as 'present' | 'absent' } })}
                  >
                    <SelectTrigger size="sm" className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      <SelectItem value="present">this element IS on the page</SelectItem>
                      <SelectItem value="absent">this element is NOT on the page</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Guard selector</label>
                  <VariableInput
                    mono
                    value={g.selector ?? ''}
                    onChange={(v) => patchGroup({ guard: { ...g, selector: v } })}
                    variableNames={variableNames}
                    placeholder="//div[@aria-label='Secure your account']"
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
                    onChange={(e) => patchGroup({ guard: { ...g, timeout: Number(e.target.value) || 8000 } })}
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
                    onChange={(e) => patchGroup({ span: Math.max(1, Number(e.target.value) || 1) })}
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

          {tab === 'action' && isFile && (
            <div className="px-6 py-3">
              <FileStepFields
                step={draft}
                onChange={setDraft}
                hideSelector={hasElement}
                priorSteps={(allSteps ?? []).slice(0, stepIndex)}
                variableNames={variableNames}
              />
            </div>
          )}

          {tab === 'action' && draft.action === 'extract' && !isUrlExtract && (
            <ExtractOptionsPanel step={draft} onChange={setDraft} />
          )}

          {tab === 'element' && (
            <SelectorPanel step={draft} stepIndex={stepIndex} onUpdateStep={setDraft} variableNames={variableNames} />
          )}

          {tab === 'json' && (
            <div className="flex flex-col h-[400px]">
              <JsonPanel
                stepIndex={stepIndex}
                stepAction={draft.action}
                editedStep={jsonText}
                onEditedStepChange={(t) => { setJsonText(t); setJsonError(''); }}
                stepEditError={jsonError}
                variableNames={variableNames}
              />
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {/* The escape hatch, not a tab: for the rare field no form covers. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={tab === 'json' ? closeJson : openJson}
          >
            <Code2 className="h-3.5 w-3.5 mr-1" />
            {tab === 'json' ? 'Back to the form' : 'Edit JSON'}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || fileErrors.length > 0}
              title={fileErrors.length > 0 ? `Fix the problems on the ${actionLabel} tab first` : undefined}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Field({ label, hint, htmlFor, children }: { label: string; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-muted-foreground" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

function Toggle({ title, checked, disabled, onChange, children }: {
  title: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-[11px] font-medium">{title}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">{children}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

/** What the step does, per action — the fields that used to live only in JSON. */
function StepFields({ step, patch, variableNames }: {
  step: RecordedStep; patch: (p: Partial<RecordedStep>) => void; variableNames: string[];
}) {
  switch (step.action) {
    case 'navigate':
      return (
        <Field label="URL" hint="Where to go. Variables allowed, e.g. …/reservations/{{reservation_id}}.">
          <VariableInput mono value={step.url ?? ''} onChange={(v) => patch({ url: v })} variableNames={variableNames} placeholder="https://…" />
        </Field>
      );
    case 'fill':
    case 'select':
      return (
        <Field
          label={step.action === 'fill' ? 'Value to type' : 'Option to choose'}
          hint={step.action === 'fill'
            ? <>Use a variable for anything that changes per run. A login{"'"}s stored password is <code className="font-mono">{'{{_password}}'}</code>.</>
            : 'The option\'s label or value.'}
        >
          <VariableInput value={step.value ?? ''} onChange={(v) => patch({ value: v })} variableNames={variableNames} placeholder={step.action === 'fill' ? '{{guest_email}}' : 'Arizona'} />
        </Field>
      );
    case 'press_key':
      return (
        <Field label="Key" hint='A key or chord, e.g. "Enter", "Escape", "Control+a".'>
          <Input className="font-mono text-xs w-48" value={step.key ?? ''} onChange={(e) => patch({ key: e.target.value })} placeholder="Enter" />
        </Field>
      );
    case 'pause':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Wait (ms)">
            <Input type="number" min={1} max={300000} className="text-xs" value={step.duration_ms ?? ''}
              onChange={(e) => patch({ duration_ms: Math.max(1, parseInt(e.target.value, 10) || 0) || undefined })} />
          </Field>
          <Field label="Up to (ms)" hint="Optional: a random wait between the two.">
            <Input type="number" min={1} max={300000} className="text-xs" value={step.duration_max_ms ?? ''}
              onChange={(e) => { const n = parseInt(e.target.value, 10); patch({ duration_max_ms: Number.isFinite(n) && n > 0 ? n : undefined }); }} />
          </Field>
        </div>
      );
    case 'extract':
      if (step.selector === '__url__') return null; // named on the URL tab
      return (
        <Field
          label="Output variable"
          hint={<>Later steps read it as <code className="font-mono">{`{{${step.field_name || 'name'}}}`}</code>. To rename one already used elsewhere, use the Variables panel so the uses follow.</>}
        >
          <Input className="font-mono text-xs w-64" value={step.field_name ?? ''} placeholder="reservation_id"
            onChange={(e) => patch({ field_name: e.target.value.trim() })} />
        </Field>
      );
    case 'click':
      if (!step.point) return null;
      return (
        <Field label="Click position" hint="Pixels from the top-left of the page area (1279 × 812). No element is looked up.">
          <div className="flex items-center gap-1.5">
            {(['x', 'y'] as const).map((axis) => (
              <Input
                key={axis}
                type="number"
                min={0}
                className="h-8 w-20 text-xs"
                aria-label={`Click position ${axis.toUpperCase()}`}
                value={step.point?.[axis] ?? ''}
                onChange={(e) => {
                  const n = Math.max(0, Math.round(Number(e.target.value) || 0));
                  patch({ point: { ...step.point!, [axis]: n } });
                }}
              />
            ))}
          </div>
        </Field>
      );
    default:
      return null;
  }
}

function actionName(step: RecordedStep): string {
  const names: Record<string, string> = {
    navigate: 'Navigate', click: step.point && !step.selector ? 'Click by position' : 'Click', fill: 'Fill', select: 'Select',
    press_key: 'Press key', wait_for: 'Wait for', pause: 'Pause', extract: 'Extract', download: 'Download',
    upload: 'Upload', save_page: step.clip ? 'Capture screen region' : 'Save page', analyze_image: 'Analyze image',
    group: 'Optional branch',
  };
  return names[step.action] ?? step.action;
}

/** Compact auto label preview for the name hint. */
function autoLabelHint(step: RecordedStep): string {
  switch (step.action) {
    // A group's auto label is the branch it guards, matching the step list.
    case 'group':      return (step as { label?: string }).label?.trim() || 'Optional branch';
    case 'navigate':   return `Navigate → ${step.url ?? ''}`;
    case 'click':      return step.point && !step.selector ? `Click at ${step.point.x}, ${step.point.y}` : `Click: ${step.text || step.selector || ''}`;
    case 'fill':       return `Fill: ${step.selector ?? ''} = ${step.value ?? ''}`;
    case 'select':     return `Select: ${step.value ?? ''} in ${step.selector ?? ''}`;
    case 'press_key':  return `Press: ${step.key ?? ''}`;
    case 'extract':    return `Extract${step.extract?.mode && step.extract.mode !== 'single' ? ` ${step.extract.mode}` : ''} → {{${step.field_name ?? '?'}}}`;
    case 'wait_for':   return `Wait: ${step.waitFor?.description ?? step.selector ?? 'element'}`;
    case 'download':
    case 'upload':
    case 'save_page':
    case 'analyze_image': return fileStepLabel(step);

    default:           return step.action;
  }
}
