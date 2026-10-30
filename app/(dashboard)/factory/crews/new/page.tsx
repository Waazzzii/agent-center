'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Button } from '@/components/ui/button';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getAgents, type Agent } from '@/lib/api/agents';
import { createCrew, getFactoryTemplates, getFactoryTrackers, type FactoryTemplate, type FactoryTracker } from '@/lib/api/factory';
import {
  CrewBasicsSection, CrewIntakeSection, CrewRolesSection, emptyCrewForm, formToInput, type CrewFormValue,
} from '@/components/factory/CrewForm';

export default function NewCrewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { selectedOrgId } = useAdminViewStore();
  const canEdit = useRequirePermission('agent_center_manager');
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [trackers, setTrackers] = useState<FactoryTracker[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState<CrewFormValue>(emptyCrewForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selectedOrgId || !canEdit) return;
    setLoading(true);
    Promise.all([getFactoryTemplates(selectedOrgId), getFactoryTrackers(selectedOrgId), getAgents(selectedOrgId)])
      .then(([t, tr, a]) => {
        setTemplates(t);
        setTrackers(tr);
        setAgents(a.agents);
        const wanted = t.find((x) => x.id === params.get('template')) ?? t.find((x) => x.is_recommended) ?? t[0];
        setForm(emptyCrewForm(wanted));
      })
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoading(false));
  }, [selectedOrgId, canEdit, params]);

  const tasks = useMemo(() => templates.find((t) => t.id === form.template_id)?.tasks ?? [], [templates, form.template_id]);

  if (!canEdit) return <NoPermissionContent />;

  const save = async () => {
    if (!selectedOrgId) return;
    setSaving(true);
    try {
      const c = await createCrew(selectedOrgId, formToInput(form));
      toast.success('Crew created — turn it on when every role has an agent.');
      router.push(`/factory/crews/${c.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create crew');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[900px] mx-auto">
      <PageHeader
        icon={Users}
        title="New crew"
        breadcrumbs={[{ label: 'Crews', href: '/factory/crews' }, { label: 'New crew' }]}
        description="Pick a template, say which tickets it takes, and put an agent in each role. A new crew starts switched off."
      />
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <CrewBasicsSection value={form} onChange={setForm} templates={templates} />
          <CrewIntakeSection value={form} onChange={setForm} trackers={trackers} />
          <CrewRolesSection value={form} onChange={setForm} tasks={tasks} agents={agents} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => router.push('/factory/crews')}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create crew'}</Button>
          </div>
        </>
      )}
    </div>
  );
}
