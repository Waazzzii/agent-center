'use client';

/**
 * Crews — each one a template set up for this org: it takes parent tickets
 * from the tracker as jobs and works them through the template's tasks, one
 * agent per task. Cards, not a table: there are few crews and each one's
 * health (what's waiting on someone) is the point of the page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, LayoutTemplate, Loader2, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getCrews, type CrewSummary } from '@/lib/api/factory';
import { ago } from '@/components/factory/job-state';

const TRACKER_NAMES: Record<string, string> = { linear: 'Linear' };

export default function CrewsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const canEdit = useRequirePermission('agent_center_manager');
  const [crews, setCrews] = useState<CrewSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId || !canView) return;
    setLoading(true);
    getCrews(selectedOrgId).then(setCrews).catch(() => {}).finally(() => setLoading(false));
  }, [selectedOrgId, canView]);

  if (!canView) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Users}
        title="Crews"
        description="A crew takes tickets from your tracker as jobs and works each one through its template's tasks, with an agent in every role."
        actions={canEdit ? (
          <Button onClick={() => router.push('/factory/crews/new')}><Plus className="h-4 w-4" />New crew</Button>
        ) : undefined}
      />

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : crews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">No crews yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start one from a template — pick a tracker, a label, and an agent for each task.</p>
            </div>
            <Button variant="outline" onClick={() => router.push('/factory/templates')}>Browse templates</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crews.map((c) => (
            <Link key={c.id} href={`/factory/crews/${c.id}`} className="group">
              <Card className="h-full transition-colors group-hover:border-brand/40">
                <CardContent className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{c.name}</h3>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.template_name}</p>
                    </div>
                    <Badge variant={c.enabled ? 'success' : 'neutral'}>{c.enabled ? 'On' : 'Off'}</Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="Active" value={c.active_jobs} />
                    <Stat label="Stopped" value={c.stopped_jobs} tone={c.stopped_jobs > 0 ? 'text-warning' : undefined} />
                    <Stat label="Done" value={c.done_jobs} />
                  </div>

                  <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                    <div className="truncate">
                      {TRACKER_NAMES[c.tracker_connector_key] ?? c.tracker_connector_key}
                      {c.intake?.team ? ` · ${c.intake.team}` : ''} · <code>{c.intake?.label ?? '—'}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={c.roles_assigned < c.task_count ? 'text-warning' : ''}>
                        {c.roles_assigned < c.task_count ? `${c.task_count - c.roles_assigned} role(s) unassigned` : `${c.task_count} roles filled`}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        {c.last_activity_at ? `Active ${ago(c.last_activity_at)}` : 'No jobs yet'}
                        <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-2">
      <div className={`text-lg font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
