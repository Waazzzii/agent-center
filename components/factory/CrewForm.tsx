'use client';

/**
 * Crew set-up, in sections that pages place where they fit:
 *
 *   CrewBasicsSection    name, template, description
 *   CrewIntakeSection    where jobs come from: waiting tickets (team + label)
 *                        or Discover creating the ticket; jobs at once
 *   CrewScheduleSection  when jobs start: one cron schedule (UTC), plus the API
 *                        and Start now
 *   CrewRolesSection     the agent that performs each task (shown as Tasks)
 *
 * Sections are titled groups, not cards: a page puts them in one card (new
 * crew) or a tab panel (a crew's Tasks / Settings tabs), and they divide
 * themselves with a rule. Explanations sit behind info icons. Whether a task
 * pauses for review is NOT set here — it is the task agent's own decision rule.
 */

import * as React from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup } from '@/components/ui/field';
import { InfoHint } from '@/components/ui/info-hint';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentPickerField } from '@/components/agents/AgentPicker';
import type { Agent } from '@/lib/api/agents';
import { describeCron, nextFirings } from '@/lib/cron';
import { cn } from '@/lib/utils';
import type { CrewDetail, CrewInput, FactoryTask, FactoryTemplate, FactoryTracker, StartMode } from '@/lib/api/factory';

export interface CrewFormValue {
  name: string;
  description: string;
  template_id: string;
  tracker_connector_key: string;
  start_mode: StartMode;
  team: string;
  label: string;
  max_active_jobs: number;
  schedule_cron: string;          // '' = no schedule
  roles: Record<string, string>;
}

export function emptyCrewForm(template?: FactoryTemplate): CrewFormValue {
  return {
    name: template?.name ?? '',
    description: '',
    template_id: template?.id ?? '',
    tracker_connector_key: 'linear',
    start_mode: 'tickets',
    team: '',
    label: template ? `factory:${template.key}` : '',
    max_active_jobs: 3,
    schedule_cron: '*/15 * * * *',
    roles: {},
  };
}

export function crewToForm(c: CrewDetail): CrewFormValue {
  return {
    name: c.name,
    description: c.description ?? '',
    template_id: c.template_id,
    tracker_connector_key: c.tracker_connector_key,
    start_mode: c.start_mode,
    team: c.intake?.team ?? '',
    label: c.intake?.label ?? '',
    max_active_jobs: c.max_active_jobs,
    schedule_cron: c.schedule_cron ?? '',
    roles: { ...c.roles },
  };
}

export function formToInput(v: CrewFormValue): CrewInput {
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    template_id: v.template_id,
    tracker_connector_key: v.tracker_connector_key,
    start_mode: v.start_mode,
    intake: { ...(v.label.trim() ? { label: v.label.trim() } : {}), ...(v.team.trim() ? { team: v.team.trim() } : {}) },
    max_active_jobs: v.max_active_jobs,
    schedule_cron: v.schedule_cron.trim() || null,
    roles: v.roles,
  };
}

/** Enough filled in to save: a tickets crew needs its label, and a schedule must read as cron. */
export function crewFormValid(v: CrewFormValue): boolean {
  return !!v.name.trim() && !!v.template_id && (v.start_mode !== 'tickets' || !!v.label.trim())
    && (!v.schedule_cron.trim() || describeCron(v.schedule_cron) !== null);
}

// ── Schedules in words ──────────────────────────────────────────────────────

const SCHEDULE_PRESETS: { label: string; expr: string }[] = [
  { label: 'Every 15 min', expr: '*/15 * * * *' },
  { label: 'Hourly', expr: '0 * * * *' },
  { label: 'Daily 06:00', expr: '0 6 * * *' },
  { label: 'Weekdays 06:00', expr: '0 6 * * 1-5' },
  { label: 'Mondays 06:00', expr: '0 6 * * 1' },
];

/** A crew's schedule in words, for headers and lists. */
export function scheduleLabel(expr: string | null): string {
  if (!expr) return 'No schedule';
  return describeCron(expr) ?? `Cron: ${expr}`;
}

const local = (d: Date) => d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const utc = (d: Date) => `${d.toISOString().slice(5, 10).replace('-', '/')} ${d.toISOString().slice(11, 16)} UTC`;

type SectionProps = {
  value: CrewFormValue;
  onChange: (v: CrewFormValue) => void;
  readOnly?: boolean;
};

export function CrewBasicsSection({ value, onChange, readOnly, templates, lockTemplate }: SectionProps & {
  templates: FactoryTemplate[];
  /** An existing crew: the template (and so its tasks) is fixed. */
  lockTemplate?: boolean;
}) {
  const set = <K extends keyof CrewFormValue>(k: K, v: CrewFormValue[K]) => onChange({ ...value, [k]: v });
  return (
    <FieldGroup title="Basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="Error Fixes" disabled={readOnly} />
        </Field>
        <Field label="Template" required info={lockTemplate ? 'Fixed once the crew exists — create a new crew to use another template.' : 'The tasks every job goes through, in order.'}>
          <Select
            value={value.template_id}
            onValueChange={(id) => {
              const t = templates.find((x) => x.id === id);
              onChange({ ...value, template_id: id, roles: {}, label: value.label || (t ? `factory:${t.key}` : '') });
            }}
            disabled={lockTemplate || readOnly}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose a template…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Textarea rows={2} value={value.description} onChange={(e) => set('description', e.target.value)}
          placeholder="What this crew takes on" disabled={readOnly} />
      </Field>
    </FieldGroup>
  );
}

const START_MODES: { value: StartMode; label: string; info: string }[] = [
  {
    value: 'tickets',
    label: 'Waiting tickets',
    info: 'A person or another agent files tickets with the label. Each time jobs start, the crew picks up the next waiting tickets — one job per ticket, as many as it has room for.',
  },
  {
    value: 'discover',
    label: 'Discover creates the ticket',
    info: 'The first task finds the work itself — e.g. reads open errors — and the crew creates the ticket from what it found. Nothing found, no ticket and no job.',
  },
];

/** Where jobs come from: waiting tickets, or Discover finding the work. */
export function CrewIntakeSection({ value, onChange, readOnly, trackers }: SectionProps & { trackers: FactoryTracker[] }) {
  const set = <K extends keyof CrewFormValue>(k: K, v: CrewFormValue[K]) => onChange({ ...value, [k]: v });
  const tracker = trackers.find((t) => t.key === value.tracker_connector_key);
  const tickets = value.start_mode === 'tickets';
  return (
    <FieldGroup title="Where jobs come from">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Each job starts from" info={START_MODES.find((m) => m.value === value.start_mode)!.info}>
          <Select value={value.start_mode} onValueChange={(v) => set('start_mode', v as StartMode)} disabled={readOnly}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{START_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Jobs at once" info={tickets
          ? 'How many tickets it works on at the same time. It picks up only as many as there is room for.'
          : 'No new job starts while the crew has this many going.'}>
          <Input type="number" min={1} max={50} value={value.max_active_jobs}
            onChange={(e) => set('max_active_jobs', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={readOnly} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tracker" required>
          <Select value={value.tracker_connector_key} onValueChange={(k) => set('tracker_connector_key', k)} disabled={readOnly}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {trackers.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.name}{t.connected ? '' : ' (not connected)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Team" info={tickets
          ? 'The team key — the prefix of its ticket ids (AGENT in AGENT-12). Blank = any team.'
          : 'Where the crew creates its tickets — the team key (AGENT in AGENT-12).'}>
          <Input value={value.team} onChange={(e) => set('team', e.target.value)} placeholder="AGENT" disabled={readOnly} />
        </Field>
        <Field label="Label" required={tickets} info={tickets
          ? "Tickets with this label that haven't started are this crew's to pick up."
          : 'Optional — added to the tickets this crew creates.'}>
          <Input value={value.label} onChange={(e) => set('label', e.target.value)} placeholder="factory:fix-to-staging" disabled={readOnly} />
        </Field>
      </div>
      {tracker && !tracker.connected && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The {tracker.name} connector isn&apos;t set up for this organization yet. Connect it in Wazzi admin before turning the crew on.</span>
        </div>
      )}
    </FieldGroup>
  );
}

/** When jobs start: one cron schedule, plus the API and Start now. */
export function CrewScheduleSection({ value, onChange, readOnly, crew }: SectionProps & {
  /** An existing crew: shows when it last started jobs and its id for the API. */
  crew?: CrewDetail;
}) {
  const expr = value.schedule_cron.trim();
  const words = expr ? describeCron(expr) : null;
  const next = React.useMemo(() => (words ? nextFirings(expr, 2) : []), [expr, words]);
  const set = (e: string) => onChange({ ...value, schedule_cron: e });
  return (
    <FieldGroup
      title="When jobs start"
      info="On this schedule, through the API, or with Start now. Waiting-ticket crews pick up the next tickets; Discover crews start one job."
    >
      <Field label="Schedule" info="5-field cron, evaluated in UTC — e.g. 30 5 * * 1-5 is 05:30 UTC on weekdays. Empty = no schedule.">
        <Input value={value.schedule_cron} onChange={(e) => set(e.target.value)} placeholder="No schedule — e.g. 0 6 * * *"
          className="font-mono" spellCheck={false} disabled={readOnly} />
        {!readOnly && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {[...SCHEDULE_PRESETS, { label: 'None', expr: '' }].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set(p.expr)}
                className={cn('rounded border px-1.5 py-0.5 text-[11px] transition-colors',
                  expr === p.expr ? 'border-brand text-brand' : 'text-muted-foreground hover:bg-surface-2')}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </Field>

      <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Starts</dt>
        <dd className={cn(expr && !words && 'text-danger')}>
          {!expr ? 'No schedule — jobs start through the API or Start now' : words ?? 'Not a valid 5-field cron expression'}
        </dd>
        {words && next.length > 0 && (
          <>
            <dt className="text-muted-foreground">Next</dt>
            <dd className="min-w-0">
              {crew && !crew.enabled ? 'The crew is off — ' : ''}
              {next.map((d) => `${local(d)} (${utc(d)})`).join(' · ')}
            </dd>
          </>
        )}
        {crew && (
          <>
            <dt className="text-muted-foreground">Last</dt>
            <dd className="min-w-0 truncate" title={crew.last_run_result ?? undefined}>
              {crew.last_run_at ? `${local(new Date(crew.last_run_at))} — ${crew.last_run_result ?? ''}` : 'Never'}
            </dd>
          </>
        )}
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          API
          <InfoHint>Start jobs from anywhere — the same as Start now: an API client token with the <code>crews:run</code> scope, no body.</InfoHint>
        </dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <code className="truncate">POST /v1/crews/{crew ? crew.id : '{id}'}/jobs</code>
          {crew && (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-brand hover:underline"
              onClick={() => { navigator.clipboard?.writeText(crew.id); toast.success('Crew id copied'); }}
            >
              <Copy className="h-3 w-3" /> Copy id
            </button>
          )}
        </dd>
      </dl>
    </FieldGroup>
  );
}

export function CrewRolesSection({ value, onChange, readOnly, tasks, agents }: SectionProps & { tasks: FactoryTask[]; agents: Agent[] }) {
  const setRole = (key: string, id: string) => onChange({ ...value, roles: { ...value.roles, [key]: id } });
  return (
    <FieldGroup
      title="Tasks"
      info="The agent that performs each task, in order. A task pauses for review only if its agent has a decision rule — open the agent to set one."
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Choose a template to see its tasks.</p>
      ) : (
        <ol className="divide-y rounded-lg border">
          {tasks.map((t) => (
            <li key={t.key} className="grid items-center gap-3 p-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-soft-fg">{t.position}</span>
                <span className="truncate text-sm font-semibold">{t.name}</span>
                {t.role_description && <InfoHint>{t.role_description}</InfoHint>}
                {value.roles[t.key] && (
                  <Link href={`/agents/${value.roles[t.key]}`} target="_blank" aria-label="Open agent" title="Open agent"
                    className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <AgentPickerField
                agents={agents}
                value={value.roles[t.key] ?? ''}
                onChange={(id) => setRole(t.key, id)}
                placeholder={`Choose the ${t.name} agent…`}
                dialogTitle={`${t.name} agent`}
                dialogDescription={t.role_description ?? undefined}
                disabled={readOnly}
              />
            </li>
          ))}
        </ol>
      )}
    </FieldGroup>
  );
}
