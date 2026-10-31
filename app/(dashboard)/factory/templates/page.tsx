'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LayoutTemplate, Loader2, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getFactoryTemplates, type FactoryTemplate } from '@/lib/api/factory';

export default function TemplatesPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const canView = useRequirePermission(['agent_center_user', 'agent_center_manager']);
  const canEdit = useRequirePermission('agent_center_manager');
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedOrgId || !canView) return;
    setLoading(true);
    getFactoryTemplates(selectedOrgId).then(setTemplates).catch(() => {}).finally(() => setLoading(false));
  }, [selectedOrgId, canView]);

  if (!canView) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={LayoutTemplate}
        title="Templates"
        description="A template is an ordered list of tasks. A crew uses one, with an agent of your choosing for each task."
      />
      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No templates yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="py-0">
              <CardContent className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{t.name}</h3>
                      {t.is_recommended && <Badge variant="brand">Recommended</Badge>}
                    </div>
                    {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                  </div>
                </div>
                <ol className="space-y-2">
                  {t.tasks.map((task) => (
                    <li key={task.key} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-soft-fg">
                        {task.position}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {task.name}
                          {(task.start_after_minutes ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                              <Clock className="h-3 w-3" /> waits {task.start_after_minutes} min
                            </span>
                          )}
                        </div>
                        {task.role_description && <p className="text-xs text-muted-foreground">{task.role_description}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                {canEdit && (
                  <div className="mt-auto flex justify-end">
                    <Button variant="outline" onClick={() => router.push(`/factory/crews/new?template=${t.id}`)}>
                      <Plus className="h-4 w-4" />Use template
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
