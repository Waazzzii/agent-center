'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  getAgentAccessGroups,
  createAgentAccessGroup,
  deleteAgentAccessGroup,
  getAgentGroupMembers,
  addAgentGroupMember,
  removeAgentGroupMember,
  getAgentOrgUsers,
  type AgentAccessGroup,
  type AgentAccessGroupMember,
  type AgentOrgUser,
} from '@/lib/api/agent-access-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Users,
  ShieldCheck,
  AlertTriangle,
  Search,
  ChevronRight,
  Check,
  X,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AccessPage() {
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();

  const [groups, setGroups]               = useState<AgentAccessGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AgentAccessGroup | null>(null);
  // savedMembers = what's persisted in the DB for the selected group
  const [savedMembers, setSavedMembers]   = useState<AgentAccessGroupMember[]>([]);
  // pendingIds = local checkbox state (not yet saved)
  const [pendingIds, setPendingIds]       = useState<Set<string>>(new Set());
  const [orgUsers, setOrgUsers]           = useState<AgentOrgUser[]>([]);
  const [loading, setLoading]             = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving]               = useState(false);

  // Create group inline form
  const [showNewGroup, setShowNewGroup]   = useState(false);
  const [newGroupName, setNewGroupName]   = useState('');
  const [creating, setCreating]           = useState(false);
  const newGroupInputRef                  = useRef<HTMLInputElement>(null);

  // Member list search
  const [memberSearch, setMemberSearch]   = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadGroups = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      const [g, u] = await Promise.all([
        getAgentAccessGroups(selectedOrgId),
        getAgentOrgUsers(selectedOrgId),
      ]);
      setGroups(g);
      setOrgUsers(u);
    } catch {
      toast.error('Failed to load access groups');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    setLoading(true);
    loadGroups();
  }, [loadGroups]);

  const loadMembers = useCallback(async (group: AgentAccessGroup) => {
    if (!selectedOrgId) return;
    setMembersLoading(true);
    try {
      const m = await getAgentGroupMembers(selectedOrgId, group.id);
      setSavedMembers(m);
      // Only track IDs that are currently valid (active org_users, non-super-admins).
      // Stale members (e.g. users who became org_admin) are excluded here so they
      // appear in toRemove on save, effectively overriding the stored list.
      const validIds = new Set(orgUsers.map((u) => u.id));
      setPendingIds(new Set(m.map((x) => x.id).filter((id) => validIds.has(id))));
    } catch {
      toast.error('Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  }, [selectedOrgId, orgUsers]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const savedIds = new Set(savedMembers.map((m) => m.id));

  const hasChanges = (() => {
    if (pendingIds.size !== savedIds.size) return true;
    for (const id of pendingIds) if (!savedIds.has(id)) return true;
    return false;
  })();

  const toAdd    = [...pendingIds].filter((id) => !savedIds.has(id));
  const toRemove = [...savedIds].filter((id) => !pendingIds.has(id));

  const filteredUsers = orgUsers.filter((u) => {
    if (memberSearch === '') return true;
    const q = memberSearch.toLowerCase();
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ').toLowerCase();
    return u.email.toLowerCase().includes(q) || name.includes(q);
  });

  const allFilteredSelected  = filteredUsers.length > 0 && filteredUsers.every((u) => pendingIds.has(u.id));
  const someFilteredSelected = filteredUsers.some((u) => pendingIds.has(u.id));

  // ── Helpers ───────────────────────────────────────────────────────────────

  const displayName = (first: string | null, last: string | null, email: string) => {
    const full = [first, last].filter(Boolean).join(' ');
    return full || email;
  };

  const guardUnsaved = async (): Promise<boolean> => {
    if (!hasChanges) return true;
    return confirm({
      title: 'Unsaved changes',
      description: 'You have unsaved member changes. Discard them?',
      confirmText: 'Discard',
      variant: 'destructive',
    });
  };

  // ── Group actions ─────────────────────────────────────────────────────────

  const selectGroup = async (group: AgentAccessGroup) => {
    if (selectedGroup?.id === group.id) return;
    if (!(await guardUnsaved())) return;
    setSelectedGroup(group);
    setMemberSearch('');
    loadMembers(group);
  };

  const handleShowNewGroup = () => {
    setShowNewGroup(true);
    setTimeout(() => newGroupInputRef.current?.focus(), 0);
  };

  const handleCancelNewGroup = () => {
    setShowNewGroup(false);
    setNewGroupName('');
  };

  const handleCreateGroup = async () => {
    if (!selectedOrgId || !newGroupName.trim()) return;
    try {
      setCreating(true);
      const g = await createAgentAccessGroup(selectedOrgId, newGroupName.trim());
      setGroups((prev) => [...prev, { ...g, member_count: 0 }]);
      setNewGroupName('');
      setShowNewGroup(false);
      toast.success('Group created');
    } catch {
      toast.error('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = async (group: AgentAccessGroup) => {
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      description: 'This will remove the group and all its members. Agent assignments will also be removed.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok || !selectedOrgId) return;
    try {
      await deleteAgentAccessGroup(selectedOrgId, group.id);
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(null);
        setSavedMembers([]);
        setPendingIds(new Set());
      }
      toast.success('Group deleted');
    } catch {
      toast.error('Failed to delete group');
    }
  };

  // ── Pending-state toggles (no API calls) ──────────────────────────────────

  const handleToggle = (userId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.delete(u.id));
      return next;
    });
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selectedOrgId || !selectedGroup || !hasChanges) return;
    setSaving(true);
    try {
      await Promise.all([
        ...toAdd.map((id)    => addAgentGroupMember(selectedOrgId, selectedGroup.id, id)),
        ...toRemove.map((id) => removeAgentGroupMember(selectedOrgId, selectedGroup.id, id)),
      ]);

      // Rebuild savedMembers from pending state
      const userMap = new Map(orgUsers.map((u) => [u.id, u]));
      const newSaved: AgentAccessGroupMember[] = [...pendingIds].map((id) => {
        const existing = savedMembers.find((m) => m.id === id);
        if (existing) return existing;
        const u = userMap.get(id)!;
        return { id: u.id, email: u.email, first_name: u.first_name, last_name: u.last_name, added_at: new Date().toISOString(), has_product_access: u.has_product_access };
      });

      setSavedMembers(newSaved);
      setGroups((prev) =>
        prev.map((g) => g.id === selectedGroup.id ? { ...g, member_count: newSaved.length } : g)
      );
      toast.success(`Saved — ${toAdd.length} added, ${toRemove.length} removed`);
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Access</h1>
          <p className="text-sm text-muted-foreground">
            Manage groups of users who can interact with agent HITL steps (login &amp; approval pauses).
          </p>
        </div>
      </div>

      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', selectedGroup ? 'items-start' : 'items-stretch')}>

        {/* ── Left: Group list ─────────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <CardTitle className="text-base">Groups</CardTitle>
          </CardHeader>
          <CardContent className={cn('flex flex-col pb-3 min-h-0', !selectedGroup && 'flex-1')}>
            {/* Group list — scrollable */}
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {groups.length === 0 && !showNewGroup && (
                <p className="text-sm text-muted-foreground py-2">No groups yet.</p>
              )}
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => selectGroup(group)}
                  className={cn(
                    'group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors',
                    selectedGroup?.id === group.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{group.name}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{group.member_count}</Badge>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group); }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className={cn(
                      'h-4 w-4 transition-colors',
                      selectedGroup?.id === group.id ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  </div>
                </div>
              ))}
            </div>

            {/* New group — inline input or button */}
            <div className="shrink-0 pt-2 border-t mt-2">
              {showNewGroup ? (
                <div className="flex gap-1.5">
                  <Input
                    ref={newGroupInputRef}
                    placeholder="Group name…"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateGroup();
                      if (e.key === 'Escape') handleCancelNewGroup();
                    }}
                    className="h-8 text-sm flex-1"
                  />
                  <button
                    onClick={handleCreateGroup}
                    disabled={!newGroupName.trim() || creating}
                    className="p-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    title="Save"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleCancelNewGroup}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleShowNewGroup}>
                  <Plus className="h-4 w-4" />
                  New group
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Right: Members panel ─────────────────────────────────────────── */}
        <div className="md:col-span-2 flex flex-col">
          {!selectedGroup ? (
            <Card className="border-dashed h-full flex items-center justify-center">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Select a group to manage its members.
              </CardContent>
            </Card>
          ) : (
            <Card className="flex flex-col">
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {selectedGroup.name}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {hasChanges && (
                      <span className="text-xs text-muted-foreground">
                        {toAdd.length > 0 && `+${toAdd.length}`}
                        {toAdd.length > 0 && toRemove.length > 0 && ' · '}
                        {toRemove.length > 0 && `-${toRemove.length}`}
                      </span>
                    )}
                    <Button
                      size="sm"
                      className="h-7 gap-1.5"
                      disabled={!hasChanges || saving}
                      onClick={handleSave}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                    <Badge variant="outline">{pendingIds.size} member{pendingIds.size !== 1 ? 's' : ''}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 min-h-0 space-y-3">

                {/* Search + select-all bar */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search users…"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0 text-xs"
                    onClick={allFilteredSelected ? handleDeselectAll : handleSelectAll}
                    disabled={filteredUsers.length === 0 || membersLoading}
                  >
                    {allFilteredSelected ? 'Deselect all' : someFilteredSelected ? 'Select rest' : 'Select all'}
                  </Button>
                </div>

                {/* Full user list with checkboxes */}
                {membersLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-0">
                    {filteredUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-3 py-4 text-center">
                        {memberSearch ? 'No users match your search.' : 'No users in this organisation.'}
                      </p>
                    ) : (
                      filteredUsers.map((user) => {
                        const isPending  = pendingIds.has(user.id);
                        const wasSaved   = savedIds.has(user.id);
                        const isDirty    = isPending !== wasSaved;
                        return (
                          <button
                            key={user.id}
                            onClick={() => handleToggle(user.id)}
                            className={cn(
                              'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                              isPending ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                            )}
                          >
                            {/* Checkbox */}
                            <div className={cn(
                              'h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors',
                              isPending
                                ? 'bg-primary border-primary text-primary-foreground'
                                : 'border-muted-foreground/40'
                            )}>
                              {isPending && <Check className="h-3 w-3" />}
                            </div>

                            {/* Name + email */}
                            <div className="flex-1 min-w-0">
                              <div className={cn('text-sm font-medium truncate', isDirty && 'italic')}>
                                {displayName(user.first_name, user.last_name, user.email)}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                            </div>

                            {/* Unsaved change indicator */}
                            {isDirty && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {isPending ? '+ unsaved' : '− unsaved'}
                              </span>
                            )}

                            {/* No-access warning */}
                            {!user.has_product_access && (
                              <div
                                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 shrink-0"
                                title="This user doesn't have agent_center_user permission"
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">No access</span>
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

              </CardContent>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
