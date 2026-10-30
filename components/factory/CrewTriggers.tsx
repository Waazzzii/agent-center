'use client';

/**
 * How a crew's jobs start — the crew page's Triggers tab — plus the Start job
 * dialog the header uses.
 *
 * Every way in creates the job's parent ticket in the tracker:
 *   Tracker label   always on: a ticket labelled with the intake label
 *   Schedules       cron (UTC), optionally with a source that writes the brief
 *                   (Monitoring errors: one job for all open errors; super admins only)
 *   API             POST /v1/crews/:id/jobs with an API client token (crews:run)
 *   Start job       the header button, by hand
 */

import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, Code2, Copy, Loader2, Pencil, Play, Plus, Tag, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Field, FieldRow } from '@/components/ui/field';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/auth.store';
import {
  createCrewTrigger, deleteCrewTrigger, fireCrewTrigger, getCrewTriggers, startCrewJob, updateCrewTrigger,
  type CrewDetail, type CrewTrigger, type CrewTriggerInput,
} from '@/lib/api/factory';
import { ago } from './job-state';

// ── Schedules in words ──────────────────────────────────────────────────────

const PRESETS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Every Monday' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'custom', label: 'Custom (cron)' },
] as const;
type Preset = typeof PRESETS[number]['value'];

function toCron(preset: Preset, hour: number, custom: string): string {
  switch (preset) {
    case 'daily': return `0 ${hour} * * *`;
    case 'weekdays': return `0 ${hour} * * 1-5`;
    case 'weekly': return `0 ${hour} * * 1`;
    case 'hourly': return '0 * * * *';
    default: return custom.trim();
  }
}

function fromCron(expr: string): { preset: Preset; hour: number } {
  const m = expr.trim().match(/^0 (\d{1,2}) \* \* (\*|1-5|1)$/);
  if (m) return { preset: m[2] === '*' ? 'daily' : m[2] === '1-5' ? 'weekdays' : 'weekly', hour: Number(m[1]) };
  if (expr.trim() === '0 * * * *') return { preset: 'hourly', hour: 6 };
  return { preset: 'custom', hour: 6 };
}

export function describeCron(expr: string): string {
  const { preset, hour } = fromCron(expr);
  const at = `${String(hour).padStart(2, '0')}:00 UTC`;
  switch (preset) {
    case 'daily': return `Every day at ${at}`;
    case 'weekdays': return `Weekdays at ${at}`;
    case 'weekly': return `Mondays at ${at}`;
    case 'hourly': return 'Every hour';
    default: return `Cron: ${expr}`;
  }
}

// ── Start job ───────────────────────────────────────────────────────────────

export function StartJobDialog({ open, onOpenChange, orgId, crew, onStarted }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgId: string;
  crew: CrewDetail;
  onStarted: (jobId: string | null) => void;
}) {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => { if (open) { setTitle(''); setDescription(''); } }, [open]);

  const start = async () => {
    setSaving(true);
    try {
      const r = await startCrewJob(orgId, crew.id, { title, description });
      toast.success(`Started ${r.ticket.identifier}`);
      onOpenChange(false);
      onStarted(r.job_id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start the job');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Start a job</DialogTitle>
          <DialogDescription>
            Creates the job&apos;s ticket{crew.intake?.team ? ` in ${crew.intake.team}` : ''} with the crew&apos;s label, and the crew picks it up straight away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing" autoFocus />
          </Field>
          <Field label="Brief" hint="What's wrong, what good looks like, and where (repository, branch, file) if you know. Markdown.">
            <Textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={start} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Start job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Triggers tab ────────────────────────────────────────────────────────────

export function CrewTriggers({ orgId, crew, canEdit }: { orgId: string; crew: CrewDetail; canEdit: boolean }) {
  const [triggers, setTriggers] = React.useState<CrewTrigger[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<CrewTrigger | 'new' | null>(null);
  const [deleting, setDeleting] = React.useState<CrewTrigger | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try { setTriggers(await getCrewTriggers(orgId, crew.id)); setLoadError(null); }
    catch (err: any) { setLoadError(err?.response?.data?.message || 'Could not load schedules'); }
    finally { setLoading(false); }
  }, [orgId, crew.id]);
  React.useEffect(() => { load(); }, [load]);

  const toggle = async (t: CrewTrigger, enabled: boolean) => {
    setBusy(t.id);
    try { await updateCrewTrigger(orgId, crew.id, t.id, { enabled }); await load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to update'); }
    finally { setBusy(null); }
  };

  const runNow = async (t: CrewTrigger) => {
    setBusy(t.id);
    try { toast.info(await fireCrewTrigger(orgId, crew.id, t.id)); await load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to run'); }
    finally { setBusy(null); }
  };

  const remove = async () => {
    if (!deleting) return;
    try { await deleteCrewTrigger(orgId, crew.id, deleting.id); toast.success('Schedule deleted'); await load(); }
    catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to delete'); }
  };

  return (
    <div className="space-y-4">
      {/* Always-on ways in */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex gap-3 p-5">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">Tracker label</div>
              <p className="mt-1 text-muted-foreground">
                Any ticket{crew.intake?.team ? ` in ${crew.intake.team}` : ''} labelled <code>{crew.intake?.label}</code> that hasn&apos;t started becomes a job — a person or another agent can file it.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex gap-3 p-5">
            <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">API &amp; webhooks</div>
              <p className="mt-1 text-muted-foreground">
                <code>POST /v1/crews/{'{id}'}/jobs</code> with <code>{'{ title, description }'}</code>, using an API client token with the <code>crews:run</code> scope.
              </p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                onClick={() => { navigator.clipboard?.writeText(crew.id); toast.success('Crew id copied'); }}
              >
                <Copy className="h-3 w-3" /> Copy crew id
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedules */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Schedules</h2>
              <p className="mt-1 text-sm text-muted-foreground">Start a job on a schedule. With a source, the brief is written from live data — and nothing starts when there&apos;s nothing to report.</p>
            </div>
            {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" />Add schedule</Button>}
          </div>

          {loading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : loadError ? (
            <p className="rounded-lg border border-dashed border-destructive/40 p-6 text-center text-sm text-destructive">{loadError}</p>
          ) : triggers.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No schedules. Jobs start from the tracker label, the API, or Start job.</p>
          ) : (
            <ul className="space-y-3">
              {triggers.map((t) => (
                <li key={t.id} className="rounded-lg border bg-card/50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t.name}</span>
                          {t.source?.type === 'monitoring_errors' && <Badge variant="info">Monitoring errors · last {t.source.since_hours ?? 24}h</Badge>}
                          {!t.enabled && <Badge variant="neutral">Off</Badge>}
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{describeCron(t.cron_expr)} · “{t.job_title}”</div>
                        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                          {/* A time already passed means the factory tick hasn't run since — it fires on the next one. */}
                          <div>Next: {!t.enabled || !t.next_fire_at ? '—'
                            : new Date(t.next_fire_at).getTime() <= Date.now()
                              ? `due since ${new Date(t.next_fire_at).toLocaleString()} — fires on the next factory tick`
                              : new Date(t.next_fire_at).toLocaleString()}</div>
                          <div>
                            Last: {t.last_fired_at ? `${ago(t.last_fired_at)} — ${t.last_result ?? ''}` : 'never'}
                            {t.last_job_id && <> · <Link href={`/factory/jobs/${t.last_job_id}`} className="text-brand hover:underline">last job</Link></>}
                          </div>
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <Switch checked={t.enabled} disabled={busy === t.id} onCheckedChange={(v) => toggle(t, v)} aria-label="Schedule on/off" />
                        <Button variant="outline" size="sm" onClick={() => runNow(t)} disabled={busy === t.id || !crew.enabled}
                          title={crew.enabled ? 'Run this schedule now' : 'Turn the crew on first'}>
                          {busy === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}Run now
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(t)} aria-label="Edit schedule"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" className="text-danger" onClick={() => setDeleting(t)} aria-label="Delete schedule"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <TriggerDialog
          orgId={orgId}
          crewId={crew.id}
          trigger={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        onConfirm={remove}
        title="Delete this schedule?"
        description="Jobs it already started carry on. It won't start any more."
        confirmText="Delete"
      />
    </div>
  );
}

function TriggerDialog({ orgId, crewId, trigger, onClose, onSaved }: {
  orgId: string;
  crewId: string;
  trigger: CrewTrigger | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin());
  const initial = fromCron(trigger?.cron_expr ?? '0 6 * * *');
  const [name, setName] = React.useState(trigger?.name ?? 'Daily');
  const [preset, setPreset] = React.useState<Preset>(initial.preset);
  const [hour, setHour] = React.useState(initial.hour);
  const [custom, setCustom] = React.useState(trigger?.cron_expr ?? '0 6 * * *');
  const [title, setTitle] = React.useState(trigger?.job_title ?? 'Daily job {{date}}');
  const [brief, setBrief] = React.useState(trigger?.job_brief ?? '');
  const [monitoring, setMonitoring] = React.useState(trigger?.source?.type === 'monitoring_errors');
  const [sinceHours, setSinceHours] = React.useState(trigger?.source?.since_hours ?? 24);
  const [skipIfActive, setSkipIfActive] = React.useState(trigger?.skip_if_active ?? true);
  const [saving, setSaving] = React.useState(false);
  const canUseMonitoring = isSuperAdmin || trigger?.source?.type === 'monitoring_errors';

  const save = async () => {
    const input: CrewTriggerInput = {
      name,
      cron_expr: toCron(preset, hour, custom),
      job_title: title,
      job_brief: brief || null,
      skip_if_active: skipIfActive,
      ...(canUseMonitoring ? { source: monitoring ? { type: 'monitoring_errors', since_hours: sinceHours } : null } : {}),
    };
    setSaving(true);
    try {
      if (trigger) await updateCrewTrigger(orgId, crewId, trigger.id, input);
      else await createCrewTrigger(orgId, crewId, input);
      toast.success(trigger ? 'Schedule saved' : 'Schedule added');
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save the schedule');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{trigger ? 'Edit schedule' : 'Add schedule'}</DialogTitle>
          <DialogDescription>Times are UTC. Each run creates one job&apos;s ticket for this crew.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FieldRow>
            <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="When" required>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </FieldRow>
          {preset === 'custom' ? (
            <Field label="Cron expression" hint="5 fields, UTC — e.g. 30 5 * * * is 05:30 every day.">
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" />
            </Field>
          ) : preset !== 'hourly' && (
            <Field label="At (UTC hour)">
              <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))} />
            </Field>
          )}
          <Field label="Job title" required hint="{{date}} becomes today's date. With a source, the number of items is added.">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Brief" hint="Instructions every job from this schedule starts with. Markdown.">
            <Textarea rows={5} value={brief} onChange={(e) => setBrief(e.target.value)} />
          </Field>

          {canUseMonitoring && (
            <div className="rounded-lg border p-4">
              <label className="flex items-start justify-between gap-4">
                <span>
                  <span className="text-sm font-medium">Source: monitoring errors</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Lists every open error group seen in the window into ONE job&apos;s brief. Left out: errors another of this crew&apos;s jobs is on or waiting for, and errors an earlier job reviewed that haven&apos;t happened again since. No errors, no job. Wazzi platform data — super admins only.
                  </span>
                </span>
                <Switch checked={monitoring} onCheckedChange={setMonitoring} />
              </label>
              {monitoring && (
                <div className="mt-3 max-w-[200px]">
                  <Field label="Look back (hours)">
                    <Input type="number" min={1} max={336} value={sinceHours} onChange={(e) => setSinceHours(Math.max(1, Math.min(336, Number(e.target.value) || 24)))} />
                  </Field>
                </div>
              )}
            </div>
          )}

          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Skip while its last job is still running
              <span className="block text-xs text-muted-foreground">So a slow job isn&apos;t joined by a second one with the same work.</span>
            </span>
            <Switch checked={skipIfActive} onCheckedChange={setSkipIfActive} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim() || !title.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
