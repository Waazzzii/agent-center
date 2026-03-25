'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { usePermission } from '@/lib/hooks/use-permission';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, Save, UserPlus, Trash2, ShieldCheck, Plug, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECTION_DESCRIPTIONS: Record<string, string> = {
  'Users':           'Manage user accounts and invitations within this organization',
  'Access Groups':   'Control access group presets and member assignments',
  'OAuth Clients':   'Manage OAuth 2.0 client applications for this organization',
  'Settings':        'View and edit organization configuration and settings',
  'Audit Logs':      'Access audit log entries and event history',
  'MCP Connections': 'Configure and manage MCP connector integrations',
  'Knowledge Base':  'Manage knowledge base articles, categories and content',
  'Skills':          'Build and manage reusable AI skills',
  'Agents':          'Configure and deploy AI agents',
  'Approvals':       'Handle human-in-the-loop approval and review workflows',
};

function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => a.localeCompare(b));
}

// ─── Permission section (subcategory-grouped) ─────────────────────────────────

function PermissionSection({
  sectionName,
  definitions,
  access,
  onChange,
  readOnly,
}: {
  sectionName: string;
  definitions: PermissionDefinition[];
  access: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  readOnly?: boolean;
}) {
  const enabledCount = definitions.filter((d) => access[d.key] ?? false).length;
  const allEnabled = enabledCount === definitions.length && definitions.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{sectionName}</h3>
          {SECTION_DESCRIPTIONS[sectionName] && (
            <p className="text-sm text-muted-foreground mt-0.5">{SECTION_DESCRIPTIONS[sectionName]}</p>
          )}
        </div>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => definitions.forEach((d) => onChange(d.key, !allEnabled))}
          className="shrink-0 text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          {allEnabled ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {definitions.map((def) => {
          const enabled = access[def.key] ?? false;
          return (
            <button
              key={def.key}
              type="button"
              disabled={readOnly}
              onClick={() => onChange(def.key, !enabled)}
              className={cn(
                'text-left rounded-lg border p-3 transition-colors',
                enabled ? 'border-primary/50 bg-primary/5' : readOnly ? 'border-border' : 'border-border hover:bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{def.label}</span>
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors shrink-0 ml-2',
                  enabled ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                )} />
              </div>
              {def.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{def.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Flat permission list (connector categories) ───────────────────────────────

function FlatPermissionList({
  definitions,
  access,
  onChange,
  title,
  readOnly,
}: {
  definitions: PermissionDefinition[];
  access: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  title?: string;
  readOnly?: boolean;
}) {
  const enabled = definitions.filter((d) => access[d.key]).length;
  const allEnabled = enabled === definitions.length && definitions.length > 0;

  if (definitions.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions defined for this connector yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {title && <span className="font-medium text-foreground mr-2">{title}</span>}
          {enabled} of {definitions.length} enabled
        </p>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => definitions.forEach((d) => onChange(d.key, !allEnabled))}
          className="text-xs font-medium text-primary hover:underline"
        >
          {allEnabled ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
        {definitions.map((def) => {
          const isEnabled = access[def.key] ?? false;
          return (
            <button
              key={def.key}
              type="button"
              disabled={readOnly}
              onClick={() => onChange(def.key, !isEnabled)}
              className={cn(
                'text-left rounded-lg border p-3 transition-colors',
                isEnabled ? 'border-primary/50 bg-primary/5' : readOnly ? 'border-border' : 'border-border hover:bg-muted/40'
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{def.label}</span>
                <div className={cn(
                  'h-3.5 w-3.5 rounded-full border-2 transition-colors shrink-0 ml-2',
                  isEnabled ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                )} />
              </div>
              {def.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{def.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Access tab content ───────────────────────────────────────────────────────

function AccessTab({
  definitions,
  access,
  onPermissionChange,
  saving,
  onSave,
  initialCategory,
  readOnly,
}: {
  definitions: PermissionDefinition[];
  access: Record<string, boolean>;
  onPermissionChange: (key: string, value: boolean) => void;
  saving: boolean;
  onSave: () => void;
  initialCategory: string;
  readOnly?: boolean;
}) {
  const allCategories = sortCategories([...new Set(definitions.map((d) => d.category))]);
  const [selectedCategory, setSelectedCategory] = useState(
    allCategories.includes(initialCategory) ? initialCategory : (allCategories[0] ?? '')
  );

  // Enabled count per category
  const enabledPerCategory = new Map(
    allCategories.map((cat) => [
      cat,
      definitions.filter((d) => d.category === cat && (access[d.key] ?? false)).length,
    ])
  );

  // Split standard categories from connector categories (connector names start with "Connector - ")
  const builtinCategories = allCategories.filter((c) => !c.startsWith('Connector - '));
  const connectorCategories = allCategories.filter((c) => c.startsWith('Connector - '));
  const selectedIsConnector = connectorCategories.includes(selectedCategory);
  // Strip "Connector - " prefix for display in dropdown
  const connectorLabel = (cat: string) => cat.replace(/^Connector - /, '');

  // Definitions for the currently selected category
  const catDefs = definitions
    .filter((d) => d.category === selectedCategory)
    .sort((a, b) => a.sort_order - b.sort_order);

  // Connector categories have one subcategory = connector name; built-ins have multiple
  const uniqueSubcategories = [...new Set(catDefs.map((d) => d.subcategory).filter(Boolean))];
  const hasMultipleSubcategories = uniqueSubcategories.length > 1;
  const sections: Record<string, PermissionDefinition[]> = {};
  for (const def of catDefs) {
    const s = def.subcategory || '_flat';
    if (!sections[s]) { sections[s] = []; }
    sections[s].push(def);
  }
  const sectionOrder = Object.keys(sections).sort((a, b) => a.localeCompare(b));

  const totalConnectorEnabled = connectorCategories.reduce((sum, cat) => sum + (enabledPerCategory.get(cat) ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Category filter — pills for built-ins, select for connectors */}
      <div className="flex items-center gap-2 flex-wrap">
        {builtinCategories.map((cat) => {
          const count = enabledPerCategory.get(cat) ?? 0;
          const isSelected = cat === selectedCategory;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
              )}
            >
              {cat}
              {count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center rounded-full text-[10px] font-semibold px-1.5 min-w-[18px]',
                  isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/15 text-primary'
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {connectorCategories.length > 0 && (
          <Select
            value={selectedIsConnector ? selectedCategory : ''}
            onValueChange={(v) => v && setSelectedCategory(v)}
          >
            <SelectTrigger className={cn(
              'h-8 rounded-full border px-3 text-sm font-medium w-auto gap-1.5 transition-colors',
              selectedIsConnector
                ? 'border-primary bg-primary text-primary-foreground [&>svg]:text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
            )}>
              <Plug className="h-3.5 w-3.5 shrink-0" />
              <SelectValue placeholder="Connectors">
                {selectedIsConnector ? connectorLabel(selectedCategory) : 'Connectors'}
              </SelectValue>
              {!selectedIsConnector && totalConnectorEnabled > 0 && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 min-w-[18px]">
                  {totalConnectorEnabled}
                </span>
              )}
            </SelectTrigger>
            <SelectContent>
              {connectorCategories.map((cat) => {
                const count = enabledPerCategory.get(cat) ?? 0;
                return (
                  <SelectItem key={cat} value={cat}>
                    <span className="flex items-center gap-2">
                      {connectorLabel(cat)}
                      {count > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 min-w-[18px]">
                          {count}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Permission grid */}
      <div className="space-y-8">
        {hasMultipleSubcategories ? (
          sectionOrder.map((section) => (
            <PermissionSection
              key={section}
              sectionName={section}
              definitions={sections[section]}
              access={access}
              onChange={onPermissionChange}
              readOnly={readOnly}
            />
          ))
        ) : (
          <FlatPermissionList
            definitions={catDefs}
            access={access}
            onChange={onPermissionChange}
            title={uniqueSubcategories[0]}
            readOnly={readOnly}
          />
        )}
      </div>

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
  const searchParams = useSearchParams();
  const { selectedOrgId } = useAdminViewStore();
  const accessGroupId = params.id as string;
  const permitted = useRequirePermission('access_groups_read');
  const canUpdate = usePermission('access_groups_update');
  const canDelete = usePermission('access_groups_delete');
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
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [memberFilter, setMemberFilter] = useState('');
  const [memberSortKey, setMemberSortKey] = useState<string>('email');
  const [memberSortDir, setMemberSortDir] = useState<'asc' | 'desc'>('asc');

  const initialCategory = searchParams.get('category') ?? 'Administration';

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

  const handleSave = async () => {
    if (!selectedOrgId || !accessGroup) return;
    try {
      setSaving(true);
      // Build a complete access map from all known definitions so stale/removed
      // permissions are explicitly set to false rather than silently persisting.
      const fullAccess = Object.fromEntries(
        definitions.map((d) => [d.key, access[d.key] ?? false])
      );
      await Promise.all([
        updateAccessGroup(selectedOrgId, accessGroupId, {
          name: name.trim(),
          description: description.trim() || undefined,
        }),
        updateAccessGroupAccess(selectedOrgId, accessGroupId, fullAccess),
      ]);
      toast.success('Changes saved');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/access-groups')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-3xl font-bold">{name || accessGroup.name}</h1>
        </div>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={!canDelete}
          title={!canDelete ? "You don't have permission to perform this action" : undefined}
          className="w-full sm:w-auto"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Group
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="access">
        <TabsList>
          <TabsTrigger value="access">Access</TabsTrigger>
          <TabsTrigger value="members">
            Members
            {members.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold px-1.5 min-w-[18px]">
                {members.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <AccessTab
                definitions={definitions}
                access={access}
                onPermissionChange={handlePermissionChange}
                saving={saving}
                onSave={handleSave}
                initialCategory={initialCategory}
                readOnly={!canUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Members</CardTitle>
              <Button variant="outline" size="sm" onClick={handleOpenAddMember} disabled={!canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined}>
                <UserPlus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </CardHeader>
            <CardContent>
              <div className="relative mb-3">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter members…"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  className="pl-8"
                />
              </div>
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
                  { key: 'granted_at', label: 'Since', sortable: true, render: (m) => <span className="text-xs text-muted-foreground">{m.granted_at ? new Date(m.granted_at).toLocaleDateString() : '—'}</span> },
                  {
                    key: 'actions',
                    label: '',
                    desktopRender: (m) => (m.role === 'super_admin' || m.role === 'org_admin') ? null : (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.id); }} disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ),
                    render: (m) => (m.role === 'super_admin' || m.role === 'org_admin') ? null : (
                      <Button
                        variant="outline" size="sm"
                        disabled={!canDelete}
                        title={!canDelete ? "You don't have permission to perform this action" : undefined}
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-name">Name</Label>
                    <Input
                      id="ag-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Access group name"
                      disabled={!canUpdate}
                      readOnly={!canUpdate}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ag-desc">Description</Label>
                    <Textarea
                      id="ag-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description"
                      rows={3}
                      disabled={!canUpdate}
                      readOnly={!canUpdate}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving || !canUpdate}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving…' : 'Save Details'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add member dialog */}
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
                    aria-disabled={!canUpdate}
                    onClick={() =>
                      canUpdate && setPendingUserIds((prev) =>
                        prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                    onKeyDown={(e) =>
                      e.key === 'Enter' && canUpdate && setPendingUserIds((prev) =>
                        prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                      )
                    }
                  >
                    <Checkbox
                      checked={pendingUserIds.includes(u.id)}
                      disabled={!canUpdate}
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
            <Button onClick={handleAddMembers} disabled={pendingUserIds.length === 0 || !canUpdate}>
              <UserPlus className="h-4 w-4 mr-2" />
              Add{pendingUserIds.length > 0 ? ` (${pendingUserIds.length})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
