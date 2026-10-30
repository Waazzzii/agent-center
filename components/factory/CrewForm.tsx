'use client';

/**
 * Crew set-up, in three sections that pages place where they fit:
 *
 *   CrewBasicsSection  name, description, template
 *   CrewIntakeSection  which tickets become jobs: tracker, team, label, how many at once
 *   CrewRolesSection   the agent that performs each task
 *
 * New crew shows all three; a crew's page shows Roles on its Roles tab and the
 * other two on Settings. Whether a task pauses for review is NOT set here — it
 * is the task agent's own decision rule.
 */

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldRow } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AgentPickerField } from '@/components/agents/AgentPicker';
import type { Agent } from '@/lib/api/agents';
import type { CrewDetail, CrewInput, FactoryTask, FactoryTemplate, FactoryTracker } from '@/lib/api/factory';

export interface CrewFormValue {
  name: string;
  description: string;
  template_id: string;
  tracker_connector_key: string;
  team: string;
  label: string;
  max_active_jobs: number;
  roles: Record<string, string>;
}

export function emptyCrewForm(template?: FactoryTemplate): CrewFormValue {
  return {
    name: template?.name ?? '',
    description: '',
    template_id: template?.id ?? '',
    tracker_connector_key: 'linear',
    team: '',
    label: template ? `factory:${template.key}` : '',
    max_active_jobs: 3,
    roles: {},
  };
}

export function crewToForm(c: CrewDetail): CrewFormValue {
  return {
    name: c.name,
    description: c.description ?? '',
    template_id: c.template_id,
    tracker_connector_key: c.tracker_connector_key,
    team: c.intake?.team ?? '',
    label: c.intake?.label ?? '',
    max_active_jobs: c.max_active_jobs,
    roles: { ...c.roles },
  };
}

export function formToInput(v: CrewFormValue): CrewInput {
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    template_id: v.template_id,
    tracker_connector_key: v.tracker_connector_key,
    intake: { label: v.label.trim(), ...(v.team.trim() ? { team: v.team.trim() } : {}) },
    max_active_jobs: v.max_active_jobs,
    roles: v.roles,
  };
}

type SectionProps = {
  value: CrewFormValue;
  onChange: (v: CrewFormValue) => void;
  readOnly?: boolean;
};

function Section({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function CrewBasicsSection({ value, onChange, readOnly, templates, lockTemplate }: SectionProps & {
  templates: FactoryTemplate[];
  /** An existing crew: the template (and so its tasks) is fixed. */
  lockTemplate?: boolean;
}) {
  const set = <K extends keyof CrewFormValue>(k: K, v: CrewFormValue[K]) => onChange({ ...value, [k]: v });
  return (
    <Section title="Basics" description="What this crew is called and which template its jobs follow.">
      <FieldRow>
        <Field label="Name" required>
          <Input value={value.name} onChange={(e) => set('name', e.target.value)} placeholder="Error Fixes" disabled={readOnly} />
        </Field>
        <Field label="Template" required hint={lockTemplate ? 'Fixed once the crew exists — create a new crew to use another template.' : undefined}>
          <Select
            value={value.template_id}
            onValueChange={(id) => {
              const t = templates.find((x) => x.id === id);
              onChange({ ...value, template_id: id, roles: {}, label: value.label || (t ? `factory:${t.key}` : '') });
            }}
            disabled={lockTemplate || readOnly}
          >
            <SelectTrigger><SelectValue placeholder="Choose a template…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </FieldRow>
      <Field label="Description">
        <Textarea rows={2} value={value.description} onChange={(e) => set('description', e.target.value)}
          placeholder="What this crew takes on" disabled={readOnly} />
      </Field>
    </Section>
  );
}

export function CrewIntakeSection({ value, onChange, readOnly, trackers }: SectionProps & { trackers: FactoryTracker[] }) {
  const set = <K extends keyof CrewFormValue>(k: K, v: CrewFormValue[K]) => onChange({ ...value, [k]: v });
  const tracker = trackers.find((t) => t.key === value.tracker_connector_key);
  return (
    <Section
      title="Intake"
      description="Which tickets become jobs. A person or an agent creates a parent ticket with the label; the crew picks it up and adds a sub-task for each task."
    >
      <FieldRow>
        <Field label="Tracker" required>
          <Select value={value.tracker_connector_key} onValueChange={(k) => set('tracker_connector_key', k)} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {trackers.map((t) => (
                <SelectItem key={t.key} value={t.key}>{t.name}{t.connected ? '' : ' (not connected)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Team" hint="The team key — the prefix of its ticket ids (AGENT in AGENT-12). Blank = any team.">
          <Input value={value.team} onChange={(e) => set('team', e.target.value)} placeholder="AGENT" disabled={readOnly} />
        </Field>
      </FieldRow>
      {tracker && !tracker.connected && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>The {tracker.name} connector isn&apos;t set up for this organization yet. Connect it in Wazzi admin before turning the crew on.</span>
        </div>
      )}
      <FieldRow>
        <Field label="Intake label" required hint="Parent tickets with this label that haven't started are picked up as jobs.">
          <Input value={value.label} onChange={(e) => set('label', e.target.value)} placeholder="factory:fix-to-staging" disabled={readOnly} />
        </Field>
        <Field label="Jobs at once" hint="How many jobs this crew works on at the same time.">
          <Input type="number" min={1} max={50} value={value.max_active_jobs}
            onChange={(e) => set('max_active_jobs', Math.max(1, Math.min(50, Number(e.target.value) || 1)))} disabled={readOnly} />
        </Field>
      </FieldRow>
    </Section>
  );
}

export function CrewRolesSection({ value, onChange, readOnly, tasks, agents }: SectionProps & { tasks: FactoryTask[]; agents: Agent[] }) {
  const setRole = (key: string, id: string) => onChange({ ...value, roles: { ...value.roles, [key]: id } });
  return (
    <Section
      title="Roles"
      description="The agent that performs each task, in order. A task pauses for review only if its agent has a decision rule — open the agent to set one."
    >
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Choose a template to see its tasks.</p>
      ) : (
        <ol className="space-y-3">
          {tasks.map((t) => (
            <li key={t.key} className="rounded-lg border bg-card/50 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg">{t.position}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.name}</div>
                    {t.role_description && <p className="mt-0.5 text-xs text-muted-foreground">{t.role_description}</p>}
                  </div>
                </div>
                {value.roles[t.key] && (
                  <Link href={`/agents/${value.roles[t.key]}`} target="_blank" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    Open agent <ExternalLink className="h-3 w-3" />
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
    </Section>
  );
}
