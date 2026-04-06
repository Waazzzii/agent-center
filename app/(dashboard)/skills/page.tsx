'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getSkills, deleteSkill, getSkillUsages, type Skill, type SkillUsage } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

const PAGE_SIZE = 20;

function AssignedTo({ usages }: { usages: SkillUsage[] }) {
  if (!usages || usages.length === 0) {
    return <span className="text-muted-foreground text-sm">None</span>;
  }
  const MAX_SHOW = 2;
  const shown = usages.slice(0, MAX_SHOW);
  const extra = usages.length - MAX_SHOW;
  return (
    <span className="text-sm">
      {shown.map((u, i) => (
        <span key={u.action_id}>
          {i > 0 && <span className="text-muted-foreground">, </span>}
          <span className="font-medium">{u.agent_name}</span>
          <span className="text-muted-foreground"> ({u.action_name})</span>
        </span>
      ))}
      {extra > 0 && <span className="text-muted-foreground"> +{extra} more</span>}
    </span>
  );
}

export default function SkillsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (selectedOrgId) loadSkills(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadSkills = async (pg = page) => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getSkills(selectedOrgId, { page: pg, limit: PAGE_SIZE });
      setSkills(data.items ?? []);
      setTotal(data.total);
      setTotalPages(data.pages);
      setPage(pg);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (pg: number) => loadSkills(pg);

  const handleDelete = async (skillId: string, name: string) => {
    if (!selectedOrgId) return;

    let usages: SkillUsage[] = [];
    try {
      usages = await getSkillUsages(selectedOrgId, skillId);
    } catch {
      // non-fatal
    }

    const description = (
      <div className="space-y-3">
        <p>Are you sure you want to delete <span className="font-medium text-foreground">"{name}"</span>? This cannot be undone.</p>
        {usages.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">Currently assigned to:</p>
            <ul className="space-y-1">
              {usages.map((u) => (
                <li key={u.action_id} className="flex items-baseline gap-1.5 text-xs">
                  <span className="shrink-0 text-muted-foreground">•</span>
                  <span>
                    <span className="font-medium text-foreground">{u.agent_name}</span>
                    <span className="text-muted-foreground"> → {u.action_name}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Those steps will lose this skill.</p>
          </div>
        )}
      </div>
    );

    const confirmed = await confirm({
      title: 'Delete Skill',
      description,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteSkill(selectedOrgId, skillId);
      toast.success('Skill deleted');
      await loadSkills(page);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete skill');
    }
  };


  if (loading && selectedOrgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Skills</h1>
          <p className="text-muted-foreground">Reusable prompt instructions for agent steps</p>
        </div>
        <Button size="sm" disabled={!selectedOrgId} onClick={() => router.push('/skills/create')}>
          <Plus className="mr-2 h-4 w-4" />
          New Skill
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to manage skills.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
            <CardDescription>{total} skill{total !== 1 ? 's' : ''}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={skills}
              getRowKey={(s) => s.id}
              onRowClick={(s) => router.push(`/skills/${s.id}/edit`)}
              emptyMessage="No skills yet. Create one or import from JSON."
              columns={[
                {
                  key: 'name',
                  label: 'Name',
                  render: (s) => <span className="font-medium">{s.name}</span>,
                },
                {
                  key: 'description',
                  label: 'Description',
                  render: (s) => (
                    <span className="text-muted-foreground text-sm">
                      {s.description ? (s.description.length > 60 ? s.description.slice(0, 60) + '…' : s.description) : '—'}
                    </span>
                  ),
                },
                {
                  key: 'assigned_to',
                  label: 'Assigned To',
                  render: (s) => <AssignedTo usages={s.usages ?? []} />,
                },
                {
                  key: 'actions',
                  label: '',
                  desktopRender: (s) => (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/skills/${s.id}/edit`); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                  render: (s) => (
                    <>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/skills/${s.id}/edit`); }} className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }} className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ),
                },
              ]}
            />
            {totalPages > 1 && !loading && (
              <div className="flex items-center justify-between border-t px-2 pt-3 mt-3">
                <span className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pg: number;
                    if (totalPages <= 7) { pg = i + 1; }
                    else if (page <= 4) { pg = i + 1; if (i === 6) pg = totalPages; if (i === 5) pg = -1; }
                    else if (page >= totalPages - 3) { pg = i === 0 ? 1 : i === 1 ? -1 : totalPages - (6 - i); }
                    else { const map = [1, -1, page - 1, page, page + 1, -2, totalPages]; pg = map[i]!; }
                    if (pg < 0) return <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>;
                    return (
                      <Button key={pg} variant={pg === page ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => goToPage(pg)}>
                        {pg}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
