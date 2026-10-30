'use client';

/**
 * One crew.
 *
 *   Jobs      every job this crew has taken on; a row opens the job page
 *   Roles     the agent in each task's role
 *   Settings  name, template, intake, and deleting the crew
 *
 * The header carries the On/Off switch and Run now (runs the coordinator for
 * this crew immediately, instead of waiting for its schedule).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Briefcase, CalendarClock, Loader2, Play, Plus, RefreshCw, Settings2, Trash2, UserCog, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Tabs, TabsList, TabsTrigger, TabsPanel, TabsContent, TabsCount } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, type Agent } from '@/lib/api/agents';
import {
  deleteCrew, getCrew, getFactoryTemplates, getFactoryTrackers, getJobs, runCrewNow, updateCrew,
  type CrewDetail, type FactoryJob, type FactoryTemplate, type FactoryTracker,
} from '@/lib/api/factory';
import {
  CrewBasicsSection, CrewIntakeSection, CrewRolesSection, crewToForm, formToInput, type CrewFormValue,
} from '@/components/factory/CrewForm';
import { JobsTable } from '@/components/factory/JobsTable';
import { rangeParams } from '@/lib/time-range';
import { CrewTriggers, StartJobDialog } from '@/components/factory/CrewTriggers';

type Tab = 'jobs' | 'triggers' | 'roles' | 'settings';
const TRACKER_NAMES: Record<string, string> = { linear: 'Linear' };

export default function CrewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const canEdit = useRequirePermission('agent_center_manager');

  const initialTab = (['jobs', 'triggers', 'roles', 'settings'] as Tab[]).find((t) => t === params.get('tab')) ?? 'jobs';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [crew, setCrew] = useState<CrewDetail | null>(null);
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [trackers, setTrackers] = useState<FactoryTracker[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<CrewFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // When this crew's jobs started; Any time by default (see the Jobs page).
  const [range, setRange] = useState({ from: '', to: '' });

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/factory/crews/${id}${t === 'jobs' ? '' : `?tab=${t}`}`, { scroll: false });
  };

  const loadJobs = useCallback(async () => {
    if (!selectedOrgId) return;
    setRefreshing(true);
    try { setJobs(await getJobs(selectedOrgId, { crewId: id, ...rangeParams(range.from, range.to) })); } catch { /* keep the last list */ }
    finally { setRefreshing(false); }
  }, [selectedOrgId, id, range]);

  // A new window reloads the list (the initial load below covers the first one).
  const firstRange = useRef(true);
  useEffect(() => {
    if (firstRange.current) { firstRange.current = false; return; }
    loadJobs();
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedOrgId || !canView) return;
    setLoading(true);
    Promise.all([
      getCrew(selectedOrgId, id),
      getJobs(selectedOrgId, { crewId: id }),
      getFactoryTemplates(selectedOrgId),
      getFactoryTrackers(selectedOrgId),
      getAgents(selectedOrgId),
    ])
      .then(([c, j, t, tr, a]) => {
        setCrew(c); setJobs(j); setTemplates(t); setTrackers(tr); setAgents(a.agents); setForm(crewToForm(c));
      })
      .catch(() => toast.error('Failed to load the crew'))
      .finally(() => setLoading(false));
  }, [selectedOrgId, canView, id]);

  // Keep the jobs current while someone is watching them.
  useEffect(() => {
    if (tab !== 'jobs' || !crew?.enabled) return;
    const t = setInterval(loadJobs, 30_000);
    return () => clearInterval(t);
  }, [tab, crew?.enabled, loadJobs]);

  const unassigned = useMemo(() => (crew ? crew.tasks.filter((t) => !crew.roles[t.key]).length : 0), [crew]);
  const dirty = useMemo(() => !!crew && !!form && JSON.stringify(formToInput(form)) !== JSON.stringify(formToInput(crewToForm(crew))), [crew, form]);

  if (!canView) return <NoPermissionContent />;

  const toggle = async (enabled: boolean) => {
    if (!selectedOrgId) return;
    setToggling(true);
    try {
      setCrew(await updateCrew(selectedOrgId, id, { enabled }));
      toast.success(enabled ? 'Crew on — it picks up jobs on its next run.' : 'Crew off.');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update');
    } finally { setToggling(false); }
  };

  const runNow = async () => {
    if (!selectedOrgId) return;
    setRunning(true);
    try {
      const r = await runCrewNow(selectedOrgId, id);
      if (r.skipped) toast.info('A run is already in progress.');
      else if (r.errors?.length) toast.error(r.errors[0]!.error);
      else toast.success(`Picked up ${r.claimed} · started ${r.started} · finished ${r.finished}`);
      await loadJobs();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to run');
    } finally { setRunning(false); }
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
    <div className={cn('flex items-center justify-end gap-2', !dirty && 'opacity-60')}>
      {dirty && <span className="mr-auto text-sm text-muted-foreground">Unsaved changes</span>}
      {dirty && <Button variant="ghost" onClick={() => setForm(crewToForm(crew))}>Discard</Button>}
      <Button onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</Button>
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
            {crew.intake?.team ? ` · ${crew.intake.team}` : ''} · takes <code>{crew.intake?.label}</code> · up to {crew.max_active_jobs} at once
          </span>
        )}
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-[var(--r-md)] border bg-card px-3 py-1.5 text-sm">
              {crew.enabled ? 'On' : 'Off'}
              <Switch checked={crew.enabled} disabled={toggling} onCheckedChange={toggle} />
            </label>
            <Button onClick={() => setStartOpen(true)} disabled={!crew.enabled} title={crew.enabled ? 'Start a job by hand' : 'Turn the crew on first'}>
              <Plus className="h-4 w-4" />Start job
            </Button>
            <Button variant="outline" onClick={runNow} disabled={running || !crew.enabled}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run now
            </Button>
          </div>
        ) : undefined}
      />

      <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="jobs"><Briefcase className="h-3.5 w-3.5" /> Jobs<TabsCount>{jobs.length}</TabsCount></TabsTrigger>
          <TabsTrigger value="triggers"><CalendarClock className="h-3.5 w-3.5" /> Triggers</TabsTrigger>
          <TabsTrigger value="roles">
            <UserCog className="h-3.5 w-3.5" /> Roles
            {unassigned > 0 && <TabsCount>{unassigned}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="settings"><Settings2 className="h-3.5 w-3.5" /> Settings</TabsTrigger>
        </TabsList>
        <TabsPanel className="p-4">
          <TabsContent value="jobs" className="mt-0">
            <JobsTable
              jobs={jobs}
              showCrew={false}
              range={{ ...range, onApply: (from, to) => setRange({ from, to }) }}
              toolbarRight={(
                <Button variant="ghost" size="sm" onClick={loadJobs} disabled={refreshing}>
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />Refresh
                </Button>
              )}
              emptyMessage={crew.enabled
                ? `No jobs yet. Add the label "${crew.intake?.label}" to a parent ticket${crew.intake?.team ? ` in ${crew.intake.team}` : ''} — it becomes a job on the next run.`
                : 'No jobs yet. Turn the crew on to start picking them up.'}
            />
          </TabsContent>

          <TabsContent value="triggers" className="mt-0">
            {selectedOrgId && <CrewTriggers orgId={selectedOrgId} crew={crew} canEdit={canEdit} />}
          </TabsContent>

          <TabsContent value="roles" className="mt-0 space-y-4">
            <CrewRolesSection value={form} onChange={setForm} tasks={crew.tasks} agents={agents} readOnly={!canEdit} />
            {saveBar}
          </TabsContent>

          <TabsContent value="settings" className="mt-0 space-y-4">
            <CrewBasicsSection value={form} onChange={setForm} templates={templates} lockTemplate readOnly={!canEdit} />
            <CrewIntakeSection value={form} onChange={setForm} trackers={trackers} readOnly={!canEdit} />
            {saveBar}
            {canEdit && (
              <Card className="border-danger/30">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-6">
                  <div>
                    <h2 className="text-base font-semibold">Delete this crew</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Its job history goes with it. Tickets and pull requests in your tracker and repositories are not touched.</p>
                  </div>
                  <Button variant="outline" className="text-danger" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" />Delete crew
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </TabsPanel>
      </Tabs>

      {selectedOrgId && (
        <StartJobDialog
          open={startOpen}
          onOpenChange={setStartOpen}
          orgId={selectedOrgId}
          crew={crew}
          onStarted={(jobId) => { if (jobId) router.push(`/factory/jobs/${jobId}`); else loadJobs(); }}
        />
      )}

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
