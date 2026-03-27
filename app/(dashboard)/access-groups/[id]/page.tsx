'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAccessGroup,
  updateAccessGroup,
  updateAccessGroupAccess,
  deleteAccessGroup,
  getAccessGroupUsers,
  addUsersToAccessGroup,
  removeUsersFromAccessGroup,
} from '@/lib/api/access-groups';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { getAccessDefinitions } from '@/lib/api/permissions';
import { getUsers } from '@/lib/api/users';
import type { AccessGroup, PermissionDefinition, User } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Save, UserPlus, Trash2, ShieldCheck, Search, Pencil, Plug, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

// ─── Permission row ────────────────────────────────────────────────────────────

function PermissionRow({
  def,
  enabled,
  onChange,
  readOnly,
}: {
  def: PermissionDefinition;
  enabled: boolean;
  onChange: (key: string, value: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium">{def.label}</p>
        {def.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
        )}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(v) => onChange(def.key, v)}
        disabled={readOnly}
      />
    </div>
  );
}

// ─── Permission group (subcategory section) ────────────────────────────────────

function PermissionGroup({
  title,
  definitions,
  access,
  onChange,
  readOnly,
}: {
  title: string;
  definitions: PermissionDefinition[];
  access: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  readOnly?: boolean;
}) {
  const allEnabled = definitions.length > 0 && definitions.every((d) => access[d.key] ?? false);

  if (definitions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        {title && <h3 className="text-sm font-semibold">{title}</h3>}
        <button
          type="button"
          disabled={readOnly}
          onClick={() => definitions.forEach((d) => onChange(d.key, !allEnabled))}
          className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50 ml-auto"
        >
          {allEnabled ? 'Disable all' : 'Enable all'}
        </button>
      </div>
      <div className="divide-y rounded-lg border px-4">
        {definitions.map((def) => (
          <PermissionRow
            key={def.key}
            def={def}
            enabled={access[def.key] ?? false}
            onChange={onChange}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Permission tab content ────────────────────────────────────────────────────

function PermissionTabContent({
  definitions,
  access,
  onPermissionChange,
  saving,
  onSave,
  readOnly,
  emptyMessage,
}: {
  definitions: PermissionDefinition[];
  access: Record<string, boolean>;
  onPermissionChange: (key: string, value: boolean) => void;
  saving: boolean;
  onSave: () => void;
  readOnly?: boolean;
  emptyMessage?: string;
}) {
  const subcategories = [...new Set(definitions.map((d) => d.subcategory).filter(Boolean))].sort(
    (a, b) => {
      // Sort by min sort_order within each subcategory
      const minA = Math.min(...definitions.filter((d) => d.subcategory === a).map((d) => d.sort_order));
      const minB = Math.min(...definitions.filter((d) => d.subcategory === b).map((d) => d.sort_order));
      return minA - minB;
    }
  );

  const groups: Record<string, PermissionDefinition[]> = {};
  for (const def of definitions) {
    const key = def.subcategory || '_flat';
    if (!groups[key]) groups[key] = [];
    groups[key].push(def);
  }
  // Sort within each group
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.sort_order - b.sort_order);
  }

  if (definitions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {emptyMessage ?? 'No permissions defined.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {subcategories.map((sub) => (
        <PermissionGroup
          key={sub}
          title={sub}
          definitions={groups[sub] ?? []}
          access={access}
          onChange={onPermissionChange}
          readOnly={readOnly}
        />
      ))}
      {groups['_flat'] && (
        <PermissionGroup
          key="_flat"
          title=""
          definitions={groups['_flat']}
          access={access}
          onChange={onPermissionChange}
          readOnly={readOnly}
        />
      )}
      <div className="flex justify-end pt-2">
        <Button onClick={onSave} disabled={saving || readOnly}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccessGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const accessGroupId = params.id as string;
  const permitted = useRequirePermission('admin_groups');
  const { confirm } = useConfirmDialog();

  const [accessGroup, setAccessGroup] = useState<AccessGroup | null>(null);
  const [definitions, setDefinitions] = useState<PermissionDefinition[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<Record<string, boolean>>({});
  const [members, setMembers] = useState<any[]>([]);
  const [orgUsers, setOrgUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Details modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Members modal
  const [membersOpen, setMembersOpen] = useState(false);

  // Add member modal
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);

  // MCP connector selector
  const [selectedConnector, setSelectedConnector] = useState<string | null>(null);

  // Members table
  const [memberFilter, setMemberFilter] = useState('');
  const [memberSortKey, setMemberSortKey] = useState<string>('email');
  const [memberSortDir, setMemberSortDir] = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    if (!selectedOrgId || !permitted) return;
    try {
      setLoading(true);
      const [ag, defs, mem] = await Promise.all([
        getAccessGroup(selectedOrgId, accessGroupId),
        getAccessDefinitions(selectedOrgId),
        getAccessGroupUsers(selectedOrgId, accessGroupId),
      ]);
      setAccessGroup(ag);
      setDefinitions(defs);
      setName(ag.name);
      setDescription(ag.description ?? '');
      setAccess(ag.access);
      setMembers(mem.users);
    } catch {
      toast.error('Failed to load access group');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, accessGroupId]);

  useEffect(() => { load(); }, [load]);

  const handlePermissionChange = (key: string, value: boolean) => {
    setAccess((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAccess = async () => {
    if (!selectedOrgId || !accessGroup) return;
    try {
      setSaving(true);
      const fullAccess = Object.fromEntries(
        definitions.map((d) => [d.key, access[d.key] ?? false])
      );
      await updateAccessGroupAccess(selectedOrgId, accessGroupId, fullAccess);
      toast.success('Permissions saved');
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDetails = () => {
    setEditName(name);
    setEditDesc(description);
    setDetailsOpen(true);
  };

  const handleSaveDetails = async () => {
    if (!selectedOrgId || !accessGroup) return;
    try {
      setSavingDetails(true);
      await updateAccessGroup(selectedOrgId, accessGroupId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      setName(editName.trim());
      setDescription(editDesc.trim());
      setDetailsOpen(false);
      toast.success('Details saved');
    } catch {
      toast.error('Failed to save details');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedOrgId || !accessGroup) return;
    const confirmed = await confirm({
      title: 'Delete Access Group',
      description: `Are you sure you want to delete "${accessGroup.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    try {
      await deleteAccessGroup(selectedOrgId, accessGroupId);
      toast.success('Access group deleted');
      router.push('/access-groups');
    } catch {
      toast.error('Failed to delete access group');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrgId) return;
    try {
      await removeUsersFromAccessGroup(selectedOrgId, accessGroupId, [userId]);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      toast.success('User removed');
    } catch {
      toast.error('Failed to remove user');
    }
  };

  const handleOpenAddMember = async () => {
    if (!selectedOrgId) return;
    try {
      const data = await getUsers(selectedOrgId);
      const memberIds = new Set(members.map((m) => m.id));
      setOrgUsers((data.users ?? []).filter((u: User) => !memberIds.has(u.id) && u.role === 'org_user'));
    } catch {
      toast.error('Failed to load users');
    }
    setPendingUserIds([]);
    setSearchQuery('');
    setAddMemberOpen(true);
  };

  const handleAddMembers = async () => {
    if (!selectedOrgId || pendingUserIds.length === 0) return;
    try {
      await addUsersToAccessGroup(selectedOrgId, accessGroupId, pendingUserIds);
      const now = new Date().toISOString();
      const newMembers = pendingUserIds.flatMap((id) => {
        const user = orgUsers.find((u) => u.id === id);
        return user ? [{ id: user.id, email: user.email, granted_at: now }] : [];
      });
      setMembers((prev) => [...prev, ...newMembers]);
      setOrgUsers((prev) => prev.filter((u) => !pendingUserIds.includes(u.id)));
      setPendingUserIds([]);
      setAddMemberOpen(false);
      toast.success(`${newMembers.length} user${newMembers.length !== 1 ? 's' : ''} added`);
    } catch {
      toast.error('Failed to add users');
    }
  };

  const filteredOrgUsers = orgUsers.filter(
    (u) => !searchQuery || u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const allFilteredSelected = filteredOrgUsers.length > 0 && filteredOrgUsers.every((u) => pendingUserIds.includes(u.id));
  const someFilteredSelected = !allFilteredSelected && filteredOrgUsers.some((u) => pendingUserIds.includes(u.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setPendingUserIds((prev) => prev.filter((id) => !filteredOrgUsers.some((u) => u.id === id)));
    } else {
      const toAdd = filteredOrgUsers.map((u) => u.id).filter((id) => !pendingUserIds.includes(id));
      setPendingUserIds((prev) => [...prev, ...toAdd]);
    }
  };

  const handleMemberSort = (key: string) => {
    if (memberSortKey === key) {
      setMemberSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setMemberSortKey(key);
      setMemberSortDir('asc');
    }
  };

  const displayedMembers = useMemo(() => {
    let result = members;
    if (memberFilter) {
      const q = memberFilter.toLowerCase();
      result = result.filter((m) => m.email?.toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const valA = memberSortKey === 'granted_at' ? (a.granted_at ?? '') : (a.email ?? '');
      const valB = memberSortKey === 'granted_at' ? (b.granted_at ?? '') : (b.email ?? '');
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return memberSortDir === 'asc' ? cmp : -cmp;
    });
  }, [members, memberFilter, memberSortKey, memberSortDir]);

  // ── Categorise definitions into tabs ──────────────────────────────────────
  const adminDefs    = definitions.filter((d) => d.category === 'Administration');
  const centersDefs  = definitions.filter((d) => d.category === 'Centers');
  const mcpDefs      = definitions.filter((d) => d.category === 'Connector');

  // MCP: group by subcategory (connector name)
  const mcpConnectors = [...new Set(mcpDefs.map((d) => d.subcategory))].sort();
  const mcpByConnector: Record<string, PermissionDefinition[]> = {};
  for (const def of mcpDefs) {
    if (!mcpByConnector[def.subcategory]) mcpByConnector[def.subcategory] = [];
    mcpByConnector[def.subcategory].push(def);
  }

  if (!permitted) return <NoPermissionContent />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!accessGroup) return null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/access-groups')} className="shrink-0 mt-0.5">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground shrink-0" />
              <h1 className="text-3xl font-bold">{name || accessGroup.name}</h1>
            </div>
            {description && (
              <p className="text-sm text-muted-foreground mt-1 ml-7">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setMembersOpen(true)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Members
            {members.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold px-1.5 min-w-[18px]">
                {members.length}
              </span>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenDetails}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Details
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="administration">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="administration">Administration</TabsTrigger>
          <TabsTrigger value="centers">Centers</TabsTrigger>
          <TabsTrigger value="mcp">MCP</TabsTrigger>
        </TabsList>

        {/* ── Administration ── */}
        <TabsContent value="administration" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <PermissionTabContent
                definitions={adminDefs}
                access={access}
                onPermissionChange={handlePermissionChange}
                saving={saving}
                onSave={handleSaveAccess}

                emptyMessage="No administration permissions defined."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Centers ── */}
        <TabsContent value="centers" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <PermissionTabContent
                definitions={centersDefs}
                access={access}
                onPermissionChange={handlePermissionChange}
                saving={saving}
                onSave={handleSaveAccess}

                emptyMessage="No Centers permissions defined."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MCP ── */}
        <TabsContent value="mcp" className="mt-6">
          {mcpConnectors.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No MCP connectors configured. Set up connectors in the Connectors section.
                </p>
              </CardContent>
            </Card>
          ) : selectedConnector ? (
            /* ── Selected connector permissions ── */
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedConnector(null)}
                    className="h-8 px-2 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    All Connectors
                  </Button>
                  <span className="text-muted-foreground">/</span>
                  <div className="flex items-center gap-2">
                    <Plug className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{selectedConnector}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <PermissionGroup
                  title=""
                  definitions={mcpByConnector[selectedConnector] ?? []}
                  access={access}
                  onChange={handlePermissionChange}
                />
                <div className="flex justify-end pt-4">
                  <Button onClick={handleSaveAccess} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* ── Connector picker ── */
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a connector to manage its MCP access permissions.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mcpConnectors.map((connector) => {
                  const defs = mcpByConnector[connector] ?? [];
                  const enabledCount = defs.filter((d) => access[d.key]).length;
                  return (
                    <button
                      key={connector}
                      type="button"
                      onClick={() => setSelectedConnector(connector)}
                      className="group flex items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                          <Plug className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{connector}</p>
                          <p className="text-xs text-muted-foreground">
                            {enabledCount === 0
                              ? 'No access granted'
                              : `${enabledCount} of ${defs.length} permission${defs.length !== 1 ? 's' : ''} enabled`}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ── Members modal ── */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Members — {accessGroup.name}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenAddMember}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Add User
              </Button>
            </div>
          </DialogHeader>
          <div className="relative mt-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter members…"
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="mt-2 max-h-[400px] overflow-y-auto">
            <ResponsiveTable
              data={displayedMembers}
              sortKey={memberSortKey}
              sortDir={memberSortDir}
              onSort={handleMemberSort}
              columns={[
                {
                  key: 'email',
                  label: 'User',
                  sortable: true,
                  render: (m) => (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{m.email}</span>
                      {(m.role === 'super_admin' || m.role === 'org_admin') && (
                        <Badge variant="secondary" className="text-[10px] font-normal">Admin</Badge>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'granted_at',
                  label: 'Since',
                  sortable: true,
                  render: (m) => (
                    <span className="text-xs text-muted-foreground">
                      {m.granted_at ? new Date(m.granted_at).toLocaleDateString() : '—'}
                    </span>
                  ),
                },
                {
                  key: 'actions',
                  label: '',
                  desktopRender: (m) => (m.role === 'super_admin' || m.role === 'org_admin') ? null : (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.id); }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ),
                  render: (m) => (m.role === 'super_admin' || m.role === 'org_admin') ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.id); }}
                      className="flex-1 rounded-none rounded-tr-lg rounded-br-lg border-r-0 border-t-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ),
                },
              ]}
              emptyMessage={memberFilter ? 'No members match your filter.' : 'No members yet.'}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Details modal ── */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Details</DialogTitle>
            <DialogDescription>Update the name and description for this access group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Access group name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDetails} disabled={savingDetails || !editName.trim()}>
              {savingDetails ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add member modal ── */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Users to {accessGroup.name}</DialogTitle>
            <DialogDescription>Select one or more users to add to this access group.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mt-2"
          />
          <div className="border rounded-md mt-2 overflow-hidden">
            {filteredOrgUsers.length > 0 && (
              <div
                role="button"
                tabIndex={0}
                className="flex w-full items-center gap-3 px-3 py-2 bg-muted/50 border-b text-sm font-medium hover:bg-muted cursor-pointer"
                onClick={toggleSelectAll}
                onKeyDown={(e) => e.key === 'Enter' && toggleSelectAll()}
              >
                <Checkbox
                  checked={allFilteredSelected || (someFilteredSelected ? 'indeterminate' : false)}
                  onCheckedChange={toggleSelectAll}
                  onClick={(e) => e.stopPropagation()}
                />
                <span>{allFilteredSelected ? 'Deselect all' : 'Select all'}</span>
                {pendingUserIds.length > 0 && (
                  <span className="ml-auto text-xs text-muted-foreground">{pendingUserIds.length} selected</span>
                )}
              </div>
            )}
            <div className="max-h-56 overflow-y-auto divide-y">
              {filteredOrgUsers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No users available.</p>
              ) : (
                filteredOrgUsers.map((u) => (
                  <div
                    key={u.id}
                    role="button"
                    tabIndex={0}
                    className="flex w-full items-center gap-3 px-3 py-2.5 hover:bg-muted text-sm cursor-pointer"
                    onClick={() =>
                      setPendingUserIds((prev) =>
                        prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                    onKeyDown={(e) =>
                      e.key === 'Enter' && setPendingUserIds((prev) =>
                        prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                  >
                    <Checkbox
                      checked={pendingUserIds.includes(u.id)}
                      onCheckedChange={() =>
                        setPendingUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        )
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{u.email}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMembers} disabled={pendingUserIds.length === 0}>
              Add {pendingUserIds.length > 0 ? `${pendingUserIds.length} ` : ''}User{pendingUserIds.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
