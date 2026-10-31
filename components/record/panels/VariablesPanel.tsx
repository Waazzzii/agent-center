'use client';

/**
 * Inputs / Outputs — the editor's lower panel.
 *
 * Everything is a GROUP, in two views (the selected step, or the whole script):
 *
 *   ▸ name · chips · value or "n fields"
 *
 *   Output group — what one step produces: a download's `photo` (photo_file,
 *     photo_filename, …), an extract's single value.
 *   Input group  — what a step reads, grouped by where it comes from: an earlier
 *     step's output (`photo · from 2`, holding the photo_* fields it reads), a
 *     value you supply (`case_id · you`, test value inline), or the login
 *     (`password · login`).
 *
 * A one-field group shows its value in the row; a larger one expands. A group's
 * NAME is click-to-rename: renaming `photo` renames every photo_* field in every
 * step (the server's scripts/rename-variable — the same rename the authoring
 * MCP's rename_variable does). Login values are not renamed.
 *
 * Any field can be used later by name; an upload's Files takes the …_file id.
 */

import { useState } from 'react';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isReservedParam, isLoginSecretParam, reservedParamMeta } from '@/lib/script-params';
import type { RecordedStep } from '@/lib/api/scripts';
import { fileStepField, fileStepOutputs, isFileStep } from '@/lib/file-steps';
import { JsonNode } from './JsonTree';

export interface VariableRef {
  index: number;
  action: string;
}

export interface VariableInfo {
  sources: VariableRef[];
  consumers: VariableRef[];
}

interface VariablesPanelProps {
  variables: Map<string, VariableInfo>;
  params: Record<string, string>;
  onParamsChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  /** Rename a group (or a single variable) in every step. */
  onRenameVariable?: (oldName: string, newName: string) => void | Promise<void>;
  onDeleteVariable?: (name: string) => void;
  hoveredStep: number | null;
  /** Report the step indices a row touches while hovered, so the step list highlights them (null clears). */
  onHoverVariable?: (steps: Set<number> | null) => void;
  /** Reserved values the session's login offers ({{_password}}, {{_mfa}}). null: no login. */
  loginVariables?: string[] | null;
  loginName?: string | null;
  steps?: RecordedStep[];
  /** What the run has produced so far. */
  outputs?: Record<string, unknown>;
  /** The selected step (the editor's cursor). Out of range = no step. */
  focusStep?: number | null;
}

// ── The script's output model ───────────────────────────────────────────────

// Names come from lib/file-steps (fileStepOutputs), the one list the editor keeps.
const FILE_KINDS: Record<string, string> = {
  download: 'Download',
  upload: 'Upload',
  save_page: 'Save page',
  analyze_image: 'Analyze image',
};

interface OutputGroup { step: number; key: string; kind: string; names: string[] }

function outputGroups(steps: RecordedStep[]): OutputGroup[] {
  const out: OutputGroup[] = [];
  steps.forEach((s, i) => {
    if (s.action === 'extract' && s.field_name) out.push({ step: i, key: s.field_name, kind: 'Extract', names: [s.field_name] });
    if (isFileStep(s)) {
      out.push({ step: i, key: fileStepField(s), kind: FILE_KINDS[s.action] ?? s.action, names: fileStepOutputs(s) });
    }

  });
  return out;
}

const stepTitle = (steps: RecordedStep[], i: number) =>
  `Step ${i + 1}: ${steps[i]?.name?.trim() || steps[i]?.action?.replace('_', ' ') || ''}`;

// ── Pieces ──────────────────────────────────────────────────────────────────

/** The one chip style. */
function Chip({ children, title, tone = 'muted' }: { children: React.ReactNode; title?: string; tone?: 'muted' | 'accent' | 'warn' }) {
  return (
    <span
      title={title}
      className={cn(
        'shrink-0 rounded px-1.5 py-px text-[10px] leading-4 tabular-nums whitespace-nowrap',
        tone === 'accent' && 'bg-purple-500/10 text-purple-400',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'warn' && 'bg-warning/10 text-warning',
      )}
    >
      {children}
    </span>
  );
}

/** A value, compactly. JSON (an extract's list) folds; nothing yet shows —. */
function Value({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === '') return <span className="text-muted-foreground/50">—</span>;
  const s = typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'object' || s.startsWith('{') || s.startsWith('[')) {
    return <span className="font-mono text-[11px]"><JsonNode value={value} /></span>;
  }
  const text = String(value);
  return <span className="font-mono text-[11px] text-foreground/80 truncate" title={text}>{text}</span>;
}

/** A group's name — click to rename it in every step, unless it is fixed. */
function GroupName({ name, onRename }: { name: string; onRename?: (next: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename?.(next);
  };
  if (editing) {
    return (
      <form className="shrink-0" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
          className="w-32 rounded bg-muted/40 px-1 font-mono text-xs font-semibold text-foreground outline-none ring-1 ring-purple-400/50"
          aria-label={`New name for ${name}`}
        />
      </form>
    );
  }
  return onRename ? (
    <button
      type="button"
      onClick={() => { setDraft(name); setEditing(true); }}
      className="shrink-0 max-w-[40%] truncate font-mono text-xs font-semibold text-foreground hover:text-purple-400"
      title="Rename — everywhere it is used"
    >
      {name}
    </button>
  ) : (
    <span className="shrink-0 max-w-[40%] truncate font-mono text-xs font-semibold text-foreground">{name}</span>
  );
}

/** One group: header row, and its fields when expanded. */
function Group({
  name, onRename, chips, value, fields, onHover, highlighted, trailing,
}: {
  name: string;
  onRename?: (next: string) => void;
  chips?: React.ReactNode;
  /** Shown in the header — the value of a one-field group. */
  value?: React.ReactNode;
  /** The fields of a larger group, shown expanded. */
  fields?: Array<{ name: string; value: React.ReactNode; chip?: React.ReactNode; onHover?: (on: boolean) => void; highlighted?: boolean }>;
  onHover?: (on: boolean) => void;
  highlighted?: boolean;
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const expandable = !!fields?.length;
  return (
    <div>
      <div
        onMouseEnter={() => onHover?.(true)}
        onMouseLeave={() => onHover?.(false)}
        className={cn(
          'group flex items-center gap-2 min-w-0 rounded px-1.5 py-1 border transition-colors',
          highlighted ? 'border-purple-400/40 bg-purple-500/5' : 'border-transparent hover:bg-muted/40',
        )}
      >
        {expandable ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="shrink-0 h-4 w-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
            aria-expanded={open}
            aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}
        <GroupName name={name} onRename={onRename} />
        <div className="shrink-0 flex items-center gap-1">{chips}</div>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
          {expandable ? <span className="text-[10px] text-muted-foreground">{fields!.length} field{fields!.length > 1 ? 's' : ''}</span> : value}
        </div>
        {trailing}
      </div>
      {expandable && open && (
        <div className="ml-[1.375rem] border-l border-border/50 pl-1">
          {fields!.map((f) => (
            <div
              key={f.name}
              onMouseEnter={() => f.onHover?.(true)}
              onMouseLeave={() => f.onHover?.(false)}
              className={cn(
                'flex items-center gap-2 min-w-0 rounded px-1.5 py-0.5 border transition-colors',
                f.highlighted ? 'border-purple-400/40 bg-purple-500/5' : 'border-transparent hover:bg-muted/40',
              )}
            >
              <span className="shrink-0 max-w-[45%] truncate font-mono text-[11px] text-purple-400">{f.name}</span>
              {f.chip}
              <div className="flex-1 min-w-0 flex items-center justify-end">{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="space-y-0.5">
      <p className="px-1.5 pt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">{title}</p>
      {children.length ? children : <p className="px-1.5 pb-0.5 text-[10px] italic text-muted-foreground/60">{empty}</p>}
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export function VariablesPanel({
  variables, params, onParamsChange, onRenameVariable, onDeleteVariable, hoveredStep, onHoverVariable,
  loginVariables, loginName, steps = [], outputs = {}, focusStep = null,
}: VariablesPanelProps) {
  const [view, setView] = useState<'step' | 'script'>('step');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const hover = (idx: number[]) => (on: boolean) => onHoverVariable?.(on && idx.length ? new Set(idx) : null);
  const rename = (from: string) => (onRenameVariable ? (to: string) => { void onRenameVariable(from, to); } : undefined);

  const groups = outputGroups(steps);
  const producedNames = new Set(groups.flatMap((g) => g.names));
  const groupFor = (name: string, before: number | null) => {
    const owners = groups.filter((g) => g.names.includes(name));
    if (before == null) return owners[0];
    const earlier = owners.filter((g) => g.step < before);
    return earlier.length ? earlier[earlier.length - 1] : owners[0];
  };
  const readersOf = (name: string) => (variables.get(name)?.consumers ?? []).map((r) => r.index);
  const offered = loginVariables ?? null;
  const loginLabel = loginName ? `"${loginName}"` : 'this login';
  const hasFocus = view === 'step' && focusStep != null && focusStep >= 0 && focusStep < steps.length;

  const usedByChip = (names: string[], after: number) => {
    const r = [...new Set(names.flatMap(readersOf))].filter((i) => i > after).sort((a, b) => a - b);
    return r.length
      ? <Chip title={r.map((i) => stepTitle(steps, i)).join('\n')}>used by {r.map((i) => i + 1).join(', ')}</Chip>
      : <Chip>unused</Chip>;
  };

  // ── Input groups ────────────────────────────────────────────────────────

  /** A value you supply: one field, its test value in the row. */
  const suppliedGroup = (name: string) => {
    const touched = readersOf(name);
    return (
      <Group
        key={`you:${name}`}
        name={name}
        onRename={rename(name)}
        chips={<Chip title="Supplied when the script runs — a test value here">you</Chip>}
        onHover={hover(touched)}
        highlighted={hoveredStep != null && touched.includes(hoveredStep)}
        value={
          <input
            className="w-full min-w-0 text-xs bg-muted/30 rounded px-2 py-0.5 border border-border/30 focus:border-border focus:outline-none font-mono"
            placeholder="test value"
            value={params[name] ?? ''}
            onChange={(e) => onParamsChange((p) => ({ ...p, [name]: e.target.value }))}
          />
        }
        trailing={onDeleteVariable && touched.length === 0 ? (
          <button
            className="shrink-0 p-0.5 rounded text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
            onClick={() => onDeleteVariable(name)}
            title="Remove — no step uses it"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        ) : undefined}
      />
    );
  };

  /** A value the login (or the engine) supplies — fixed name. */
  const loginGroup = (name: string) => {
    const meta = reservedParamMeta(name);
    const secret = isLoginSecretParam(name);
    const missing = secret && (loginVariables === null || (offered && !offered.includes(name)));
    const touched = readersOf(name);
    return (
      <Group
        key={`login:${name}`}
        name={name}
        chips={<Chip title={meta?.description} tone={missing ? 'warn' : 'muted'}>login</Chip>}
        onHover={hover(touched)}
        highlighted={hoveredStep != null && touched.includes(hoveredStep)}
        value={<span className={cn('text-[10px] italic truncate', missing ? 'text-warning' : 'text-muted-foreground')}>
          {loginVariables === null && secret ? 'pick a login for this session'
            : missing ? `${loginLabel} doesn't store it — fills blank` : meta?.label}
        </span>}
      />
    );
  };

  /** What a step reads from an earlier step's output — grouped under that output's name. */
  const fromStepGroup = (g: OutputGroup, readNames: string[], at: number) => {
    const late = g.step >= at;
    const fieldsRead = readNames.map((n) => ({ name: n, value: <Value value={outputs[n]} /> }));
    return (
      <Group
        key={`from:${g.step}:${g.key}`}
        name={g.key}
        onRename={rename(g.key)}
        chips={<Chip tone={late ? 'warn' : 'accent'} title={late ? `${stepTitle(steps, g.step)} — runs after this step` : stepTitle(steps, g.step)}>
          from {g.step + 1}
        </Chip>}
        onHover={hover([g.step, at])}
        highlighted={hoveredStep === g.step}
        value={g.names.length === 1 ? <Value value={outputs[g.names[0]!]} /> : undefined}
        fields={g.names.length > 1 ? fieldsRead : undefined}
      />
    );
  };

  // ── Output groups ───────────────────────────────────────────────────────
  const outputGroup = (g: OutputGroup) => {
    const kind = <Chip tone="accent" title={stepTitle(steps, g.step)}>{g.kind} · step {g.step + 1}</Chip>;
    const single = g.names.length === 1;
    return (
      <Group
        key={`out:${g.step}:${g.key}`}
        name={g.key}
        onRename={rename(g.key)}
        chips={<>{kind}{usedByChip(g.names, g.step)}</>}
        onHover={hover([g.step, ...g.names.flatMap(readersOf)])}
        highlighted={hoveredStep === g.step}
        value={single ? <Value value={outputs[g.names[0]!]} /> : undefined}
        fields={single ? undefined : g.names.map((n) => {
          const readers = readersOf(n).filter((i) => i > g.step);
          return {
            name: n,
            value: <Value value={outputs[n]} />,
            chip: readers.length ? <Chip>used by {readers.map((i) => i + 1).join(', ')}</Chip> : undefined,
            onHover: hover([g.step, ...readers]),
            highlighted: hoveredStep != null && readers.includes(hoveredStep),
          };
        })}
      />
    );
  };

  // ── Views ───────────────────────────────────────────────────────────────
  let inputs: React.ReactNode[];
  let outs: React.ReactNode[];
  let inputsTitle: string;
  let outputsTitle: string;
  if (hasFocus) {
    const i = focusStep!;
    inputsTitle = `Inputs · step ${i + 1}`;
    outputsTitle = `Outputs · step ${i + 1}`;
    const reads = [...variables.entries()].filter(([, info]) => info.consumers.some((r) => r.index === i)).map(([n]) => n);
    // Reads from earlier steps, grouped by the output they belong to.
    const byGroup = new Map<OutputGroup, string[]>();
    const rest: string[] = [];
    for (const n of reads) {
      const g = !isReservedParam(n) && producedNames.has(n) ? groupFor(n, i) : undefined;
      if (g) byGroup.set(g, [...(byGroup.get(g) ?? []), n]);
      else rest.push(n);
    }
    inputs = [
      ...[...byGroup.entries()].map(([g, names]) => fromStepGroup(g, names, i)),
      ...rest.map((n) => (reservedParamMeta(n) ? loginGroup(n) : suppliedGroup(n))),
    ];
    outs = groups.filter((g) => g.step === i).map(outputGroup);
  } else {
    inputsTitle = 'Inputs · whole script';
    outputsTitle = 'Outputs · whole script';
    const supplied = [
      ...[...variables.entries()].filter(([n, info]) => info.consumers.length > 0 && !producedNames.has(n)).map(([n]) => n),
      ...Object.keys(params).filter((k) => !variables.has(k) && !producedNames.has(k) && !(k in outputs)),
    ];
    const loginNames = [...new Set([...supplied.filter((n) => reservedParamMeta(n)), ...(offered ?? [])])];
    inputs = [
      ...supplied.filter((n) => !reservedParamMeta(n)).map(suppliedGroup),
      ...loginNames.map(loginGroup),
    ];
    outs = groups.map(outputGroup);
  }

  return (
    <div className="px-1.5 py-1 space-y-1">
      <div className="flex items-center gap-0.5 px-1.5">
        {(['step', 'script'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] transition-colors',
              view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v === 'step' ? 'This step' : 'Whole script'}
          </button>
        ))}
      </div>

      <Section title={inputsTitle} empty={hasFocus ? 'This step reads nothing.' : 'Nothing to supply.'}>
        {inputs}
      </Section>
      {!hasFocus && (adding ? (
        <form
          className="mx-1.5 rounded border border-dashed border-border/60 px-2.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            const safe = newName.trim().replace(/\s+/g, '_').replace(/\W/g, '');
            if (safe && !isReservedParam(safe)) onParamsChange((p) => ({ ...p, [safe]: '' }));
            setNewName('');
            setAdding(false);
          }}
        >
          <input
            autoFocus
            placeholder="input_name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
            onBlur={() => { if (!newName.trim()) { setAdding(false); setNewName(''); } }}
            className="w-full text-xs font-mono bg-transparent border-none outline-none"
          />
        </form>
      ) : (
        <button
          className="mx-1.5 flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3" />
          Add input
        </button>
      ))}

      <Section title={outputsTitle} empty={hasFocus ? 'This step produces nothing.' : 'No step produces a value yet.'}>
        {outs}
      </Section>
    </div>
  );
}
