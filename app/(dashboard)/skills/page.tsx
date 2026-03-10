'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { usePermission } from '@/lib/hooks/use-permission';
import { getSkills, deleteSkill, importSkills, type Skill } from '@/lib/api/skills';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Upload } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

export default function SkillsPage() {
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('skills_read');
  const canCreate = usePermission('skills_create');
  const canUpdate = usePermission('skills_update');
  const canDelete = usePermission('skills_delete');
  const { confirm } = useConfirmDialog();

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (selectedOrgId) loadSkills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadSkills = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getSkills(selectedOrgId);
      setSkills(data.skills);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (skillId: string, name: string) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Delete Skill',
      description: `Are you sure you want to delete "${name}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteSkill(selectedOrgId, skillId);
      toast.success('Skill deleted');
      await loadSkills();
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
      toast.success(`Imported ${result.created} skill(s)`);
      if (result.errors.length) toast.warning(`${result.errors.length} error(s) during import`);
      setImportOpen(false);
      setImportJson('');
      await loadSkills();
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
          <h1 className="text-2xl md:text-3xl font-bold">Skills</h1>
          <p className="text-sm text-muted-foreground">Reusable prompt instructions synced with the Anthropic Prompt Library</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!selectedOrgId || !canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button disabled={!selectedOrgId || !canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined} onClick={() => router.push('/skills/create')}>
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
            <CardDescription>{skills.length} skill{skills.length !== 1 ? 's' : ''}</CardDescription>
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
                  key: 'synced',
                  label: 'Anthropic ID',
                  render: (s) => s.external_ref
                    ? <span className="text-xs font-mono text-muted-foreground">{s.external_ref.slice(0, 16)}…</span>
                    : <span className="text-xs text-muted-foreground">—</span>,
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
                      <Button variant="ghost" size="sm" disabled={!canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); router.push(`/skills/${s.id}/edit`); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                  render: (s) => (
                    <>
                      <Button variant="outline" size="sm" disabled={!canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); router.push(`/skills/${s.id}/edit`); }} className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined} onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.name); }} className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ),
                },
              ]}
            />
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
            <Button onClick={handleImport} disabled={importing || !importJson.trim() || !canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
