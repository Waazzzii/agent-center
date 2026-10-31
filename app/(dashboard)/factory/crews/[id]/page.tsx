'use client';

/**
 * One crew.
 *
 *   Tasks     the agent that performs each of the template's tasks
 *   Settings  name, template, where its jobs come from, when they start, and
 *             deleting the crew
 *
 * Its jobs are on the Jobs page, with every other crew's.
 *
 * The header carries the On/Off switch and Start now — what its schedule or
 * the API would do.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ListChecks, Loader2, Play, Settings2, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Tabs, TabsList, TabsTrigger, TabsPanel, TabsContent, TabsCount } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InfoHint } from '@/components/ui/info-hint';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, type Agent } from '@/lib/api/agents';
import {
  deleteCrew, getCrew, getFactoryTemplates, getFactoryTrackers, startCrewJobs, updateCrew,
  type CrewDetail, type FactoryTemplate, type FactoryTracker,
} from '@/lib/api/factory';
import {
  CrewBasicsSection, CrewIntakeSection, CrewRolesSection, CrewScheduleSection, crewFormValid, crewToForm, scheduleLabel,
  formToInput, type CrewFormValue,
} from '@/components/factory/CrewForm';

type Tab = 'tasks' | 'settings';
const TRACKER_NAMES: Record<string, string> = { linear: 'Linear' };

export default function CrewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const canEdit = useRequirePermission('agent_center_manager');

  const initialTab = (['tasks', 'settings'] as Tab[]).find((t) => t === params.get('tab')) ?? 'tasks';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [trackers, setTrackers] = useState<FactoryTracker[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<CrewFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/factory/crews/${id}${t === 'tasks' ? '' : `?tab=${t}`}`, { scroll: false });
  };

  useEffect(() => {
    if (!selectedOrgId || !canView) return;
    setLoading(true);
    Promise.all([
      getCrew(selectedOrgId, id),
      getFactoryTemplates(selectedOrgId),
      getFactoryTrackers(selectedOrgId),
      getAgents(selectedOrgId),
    ])
      .then(([c, t, tr, a]) => {
        setCrew(c); setTemplates(t); setTrackers(tr); setAgents(a.agents); setForm(crewToForm(c));
      })
      .catch(() => toast.error('Failed to load the crew'))
      .finally(() => setLoading(false));
  }, [selectedOrgId, canView, id]);

  const unassigned = useMemo(() => (crew ? crew.tasks.filter((t) => !crew.roles[t.key]).length : 0), [crew]);
  const dirty = useMemo(() => !!crew && !!form && JSON.stringify(formToInput(form)) !== JSON.stringify(formToInput(crewToForm(crew))), [crew, form]);

  if (!canView) return <NoPermissionContent />;

  const toggle = async (enabled: boolean) => {
    if (!selectedOrgId) return;
    setToggling(true);
    try {
      setCrew(await updateCrew(selectedOrgId, id, { enabled }));
      toast.success(enabled ? 'Crew on.' : 'Crew off.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally { setToggling(false); }
  };

  const startNow = async () => {
    if (!selectedOrgId) return;
    setStarting(true);
    try {
      const r = await startCrewJobs(selectedOrgId, id);
      if (r.started) toast.success(r.result);
      else if (r.result.startsWith('Failed')) toast.error(r.result);
      else toast.info(r.result);
      // A single new job: open it. Otherwise refresh (the Last line).
      if (r.job_ids.length === 1) router.push(`/factory/jobs/${r.job_ids[0]}`);
      else setCrew(await getCrew(selectedOrgId, id));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to start jobs');
    } finally { setStarting(false); }
  };

  const save = async () => {
    if (!selectedOrgId || !form) return;
    setSaving(true);
    try {
      const { template_id: _fixed, ...input } = formToInput(form);
      const c = await updateCrew(selectedOrgId, id, input);
      setCrew(c); setForm(crewToForm(c));
      toast.success('Saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!selectedOrgId) return;
    try {
      await deleteCrew(selectedOrgId, id);
      toast.success('Crew deleted');
      router.push('/factory/crews');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete');
    }
  };

  if (loading || !crew || !form) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const saveBar = canEdit && (
    <div className={cn('mt-5 flex items-center justify-end gap-2 border-t pt-4', !dirty && 'opacity-60')}>
      {dirty && <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>}
      {dirty && <Button variant="ghost" onClick={() => setForm(crewToForm(crew))}>Discard</Button>}
      <Button onClick={save} disabled={saving || !dirty || !crewFormValid(form)}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Users}
        title={crew.name}
        breadcrumbs={[{ label: 'Crews', href: '/factory/crews' }, { label: crew.name }]}
        badge={<Badge variant={crew.enabled ? 'success' : 'neutral'}>{crew.enabled ? 'On' : 'Off'}</Badge>}
        description={crew.description || undefined}
        meta={(
          <span className="text-xs text-muted-foreground">
            {crew.template_name} · {TRACKER_NAMES[crew.tracker_connector_key] ?? crew.tracker_connector_key}
            {crew.intake?.team ? ` · ${crew.intake.team}` : ''}
            {crew.start_mode === 'discover'
              ? ` · ${crew.tasks[0]?.name ?? 'Discover'} creates the ticket`
              : <> · picks up <code>{crew.intake?.label}</code></>}
            {' · '}{scheduleLabel(crew.schedule_cron)} · up to {crew.max_active_jobs} at once
          </span>
        )}
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-[var(--r-md)] border bg-card px-3 py-1.5 text-sm">
              {crew.enabled ? 'On' : 'Off'}
              <Switch checked={crew.enabled} disabled={toggling} onCheckedChange={toggle} />
            </label>
            <Button variant="outline" onClick={startNow} disabled={starting || !crew.enabled}
              title={crew.enabled ? 'What its schedule or the API would do, now' : 'Turn the crew on first'}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Start now
            </Button>
          </div>
        ) : undefined}
      />

      <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="tasks">
            <ListChecks className="h-3.5 w-3.5" /> Tasks
            {unassigned > 0 && <TabsCount>{unassigned}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="settings"><Settings2 className="h-3.5 w-3.5" /> Settings</TabsTrigger>
        </TabsList>
        <TabsPanel className="p-5">
          <TabsContent value="tasks" className="mt-0">
            <CrewRolesSection value={form} onChange={setForm} tasks={crew.tasks} agents={agents} readOnly={!canEdit} />
            {saveBar}
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <CrewBasicsSection value={form} onChange={setForm} templates={templates} lockTemplate readOnly={!canEdit} />
            <CrewIntakeSection value={form} onChange={setForm} trackers={trackers} readOnly={!canEdit} />
            <CrewScheduleSection value={form} onChange={setForm} crew={crew} readOnly={!canEdit} />
            {saveBar}
            {canEdit && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 px-4 py-3">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="font-medium">Delete this crew</span>
                  <InfoHint>Its job history goes with it. Tickets and pull requests in your tracker and repositories are not touched.</InfoHint>
                </div>
                <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Delete crew
                </Button>
              </div>
            )}
          </TabsContent>
        </TabsPanel>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title="Delete this crew?"
        description="Its job history goes with it. Tickets and pull requests in your tracker and repositories are not touched."
        confirmText="Delete"
      />
    </div>
  );
}
