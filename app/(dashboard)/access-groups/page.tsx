'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getAccessGroups, createAccessGroup, deleteAccessGroup } from '@/lib/api/access-groups';
import { getAccessDefinitions } from '@/lib/api/permissions';
import type { AccessGroup, PermissionDefinition } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus, Pencil, ShieldCheck, Users, Shield, BookOpen, Bot, Plug } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Category metadata ────────────────────────────────────────────────────────

const BUILTIN_CATEGORIES: Record<string, { icon: React.ReactNode; description: string }> = {
  Administration: {
    icon: <Shield className="h-5 w-5" />,
    description: 'User management, access control, MCP connections, audit logs, and system settings',
  },
  'Knowledge Base': {
    icon: <BookOpen className="h-5 w-5" />,
    description: 'Knowledge base content access — read, create, edit, and delete articles',
  },
  Agents: {
    icon: <Bot className="h-5 w-5" />,
    description: 'AI skills, agents, and human-in-the-loop approval workflows',
  },
};

function categoryIcon(category: string | null) {
  if (!category) return <ShieldCheck className="h-3.5 w-3.5" />;
  if (BUILTIN_CATEGORIES[category]) return BUILTIN_CATEGORIES[category].icon;
  return <Plug className="h-3.5 w-3.5" />;
}

/** Derives a group's effective category from its enabled permission keys + the definitions catalog. */
function deriveCategory(
  access: Record<string, boolean>,
  keyToCategory: Map<string, string>
): string | null {
  const cats = new Set(
    Object.entries(access)
      .filter(([, v]) => v)
      .map(([k]) => keyToCategory.get(k))
      .filter(Boolean) as string[]
  );
  return cats.size === 1 ? [...cats][0] : null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessGroupsPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('admin_groups');
  const { confirm } = useConfirmDialog();

  const [accessGroups, setAccessGroups] = useState<AccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create dialog state
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Definitions for category list + badge derivation
  const [definitions, setDefinitions] = useState<PermissionDefinition[]>([]);
  const [defsLoading, setDefsLoading] = useState(false);

  useEffect(() => {
    if (!admin) router.push('/login');
  }, [admin]);

  useEffect(() => {
    if (selectedOrgId) load();
  }, [selectedOrgId]);

  const load = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getAccessGroups(selectedOrgId);
      setAccessGroups(data.access_groups);
    } catch {
      toast.error('Failed to load access groups');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = useCallback(async () => {
    setSelectedCategory('');
    setNewName('');
    setNewDescription('');

    if (definitions.length === 0) {
      setDefsLoading(true);
      try {
        const data = await getAccessDefinitions(selectedOrgId ?? undefined);
        setDefinitions(data);
      } catch {
        toast.error('Failed to load categories');
      } finally {
        setDefsLoading(false);
      }
    }

    setCreateOpen(true);
  }, [definitions.length]);

  const handleCreate = async () => {
    if (!selectedOrgId || !newName.trim() || !selectedCategory) return;
    try {
      setCreating(true);
      const created = await createAccessGroup(selectedOrgId, {
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        access: {},
      });
      setAccessGroups((prev) => [...prev, { ...created, member_count: 0 }]);
      setCreateOpen(false);
      toast.success('Access group created');
      router.push(`/access-groups/${created.id}?category=${encodeURIComponent(selectedCategory)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create access group');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (ag: AccessGroup) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Delete Access Group',
      description: `Delete "${ag.name}"? Users with this access group will lose associated permissions.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteAccessGroup(selectedOrgId, ag.id);
      setAccessGroups((prev) => prev.filter((x) => x.id !== ag.id));
      toast.success('Access group deleted');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete access group');
    }
  };

  // Map permission key → category for badge derivation
  const keyToCategory = new Map(definitions.map((d) => [d.key, d.category]));

  // Derive unique categories from loaded definitions
  const categories = Array.from(new Set(definitions.map((d) => d.category))).sort((a, b) => {
    const order = ['Administration', 'Knowledge Base', 'Agents'];
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (ag: AccessGroup) => {
      const cat = deriveCategory(ag.access, keyToCategory);
      return (
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground shrink-0">{categoryIcon(cat)}</div>
          <div>
            <div className="font-medium">{ag.name}</div>
            {ag.description && (
              <div className="text-xs text-muted-foreground">{ag.description}</div>
            )}
          </div>
        </div>
      );
    },
    },
    {
      key: 'category',
      label: 'Type',
      render: (ag: AccessGroup) => {
        const cat = deriveCategory(ag.access, keyToCategory);
        return cat
          ? <Badge variant="outline" className="text-xs font-normal">MCP · {cat.replace(/^Connector - /, '')}</Badge>
          : <Badge variant="secondary" className="text-xs font-normal">Mixed</Badge>;
      },
    },
    {
      key: 'members',
      label: 'Members',
      render: (ag: AccessGroup) => (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {ag.member_count ?? 0}
        </div>
      ),
    },
    {
      key: 'permissions',
      label: 'Permissions',
      render: (ag: AccessGroup) => {
        const count = Object.values(ag.access).filter(Boolean).length;
        return <span className="text-sm text-muted-foreground">{count} enabled</span>;
      },
    },
    {
      key: 'actions',
      label: '',
      desktopRender: (ag: AccessGroup) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost" size="icon"
            onClick={(e) => { e.stopPropagation(); router.push(`/access-groups/${ag.id}`); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={(e) => { e.stopPropagation(); handleDelete(ag); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
      render: (ag: AccessGroup) => (
        <>
          <Button
            variant="outline" size="sm"
            onClick={(e) => { e.stopPropagation(); router.push(`/access-groups/${ag.id}`); }}
            className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={(e) => { e.stopPropagation(); handleDelete(ag); }}
            className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </>
      ),
    },
  ];

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Access Groups</h1>
          <p className="text-muted-foreground">
            Permission presets scoped to a functional category — assign multiple groups per user.
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Access Group
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Access Groups</CardTitle>
          <CardDescription>
            Each group is scoped to one category. A user's effective permissions are the union of all their assigned groups.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <ResponsiveTable
              data={accessGroups}
              columns={columns}
              emptyMessage="No access groups yet. Create one to get started."
              onRowClick={(ag) => router.push(`/access-groups/${ag.id}`)}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Create dialog ────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!creating) setCreateOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Access Group</DialogTitle>
            <DialogDescription>
              Name your group and select the functional area it covers. You'll configure permissions on the next page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Name + description */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ag-name">Name *</Label>
                <Input
                  id="ag-name"
                  placeholder={selectedCategory ? `e.g. ${selectedCategory.replace(/^Connector - /, '')} Viewer` : 'Access group name'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ag-desc">Description (optional)</Label>
                <Input
                  id="ag-desc"
                  placeholder="Brief description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Category cards */}
            <div className="space-y-2">
              <Label>Type *</Label>
              {defsLoading ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Loading categories…</div>
              ) : (() => {
                const builtinCats = categories.filter((c) => BUILTIN_CATEGORIES[c]);
                const connectorCats = categories.filter((c) => !BUILTIN_CATEGORIES[c]);
                const selectedConnector = connectorCats.includes(selectedCategory) ? selectedCategory : '';
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {builtinCats.map((cat) => {
                      const builtin = BUILTIN_CATEGORIES[cat];
                      const isSelected = selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategory(cat)}
                          className={cn(
                            'text-left rounded-lg border p-3.5 transition-colors space-y-1',
                            isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50 hover:border-primary/40'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className={cn('shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')}>
                              {builtin.icon}
                            </span>
                            <span className="font-semibold text-foreground text-sm">{cat}</span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{builtin.description}</p>
                        </button>
                      );
                    })}

                    {connectorCats.length > 0 && (
                      <div className={cn(
                        'rounded-lg border p-3.5 transition-colors space-y-2',
                        selectedConnector ? 'border-primary bg-primary/5' : 'border-border'
                      )}>
                        <div className="flex items-center gap-2">
                          <Plug className={cn('h-5 w-5 shrink-0', selectedConnector ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="font-semibold text-foreground text-sm">MCP</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">Control which MCP endpoints users can call for a specific connector</p>
                        <Select
                          value={selectedConnector}
                          onValueChange={(v) => setSelectedCategory(v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Select a connector…" />
                          </SelectTrigger>
                          <SelectContent>
                            {connectorCats.map((cat) => (
                              <SelectItem key={cat} value={cat} className="text-xs">
                                {cat.replace(/^Connector - /, '')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim() || !selectedCategory}>
              {creating ? 'Creating…' : 'Create Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
