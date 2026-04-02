'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getSkills, deleteSkill, importSkills, getSkillUsages, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Upload, ChevronLeft, ChevronRight } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

const PAGE_SIZE = 20;

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

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

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

    // Fetch usages before confirming
    let usages: { action_id: string; action_name: string; agent_id: string; agent_name: string }[] = [];
    try {
      usages = await getSkillUsages(selectedOrgId, skillId);
    } catch {
      // non-fatal — proceed without usage info
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

  const handleImport = async () => {
    if (!selectedOrgId) return;
    let parsed: { name: string; description?: string; content: string }[];
    try {
      parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
    } catch {
      toast.error('Invalid JSON — expected an array of { name, content } objects');
      return;
    }
    try {
      setImporting(true);
      const result = await importSkills(selectedOrgId, parsed);
      toast.success(`Imported ${result.imported} skill(s)`);
      setImportOpen(false);
      setImportJson('');
      await loadSkills(1);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const sourceLabel: Record<Skill['source'], string> = {
    manual: 'Manual',
    anthropic_import: 'Anthropic',
    file_import: 'Import',
  };

  const sourceVariant: Record<Skill['source'], 'default' | 'secondary' | 'outline'> = {
    manual: 'default',
    anthropic_import: 'secondary',
    file_import: 'outline',
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
          <p className="text-muted-foreground">Reusable prompt instructions synced with the Anthropic Prompt Library</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!selectedOrgId}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button disabled={!selectedOrgId} onClick={() => router.push('/skills/create')}>
            <Plus className="mr-2 h-4 w-4" />
            New Skill
          </Button>
        </div>
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
              emptyMessage="No skills yet. Create one or sync from Anthropic."
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
                  key: 'source',
                  label: 'Source',
                  render: (s) => <Badge variant={sourceVariant[s.source]}>{sourceLabel[s.source]}</Badge>,
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (s) => s.is_active
                    ? <Badge variant="default">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>,
                },
                {
                  key: 'actions',
                  label: 'Actions',
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

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Skills</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Paste a JSON array of skills. Each item needs <code>name</code> and <code>content</code>.</p>
            <Textarea
              placeholder={'[\n  { "name": "Summarize", "content": "Summarize the following..." }\n]'}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={8}
              className="font-mono text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || !importJson.trim()}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
