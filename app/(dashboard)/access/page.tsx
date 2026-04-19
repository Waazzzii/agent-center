'use client';

/**
 * Access Groups — manage who can interact with HITL steps.
 *
 * Clean table layout:
 *   - Group list with member count
 *   - Click group → dialog to manage members
 *   - Create/delete via top actions
 */

import { useCallback, useEffect, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getAgentAccessGroups,
  createAgentAccessGroup,
  deleteAgentAccessGroup,
  getAgentGroupMembers,
  addAgentGroupMember,
  removeAgentGroupMember,
  getAgentOrgUsers,
  getGroupUsage,
  type AgentAccessGroup,
  type AgentAccessGroupMember,
  type AgentOrgUser,
  type GroupUsageLogin,
  type GroupUsageApproval,
} from '@/lib/api/agent-access-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Plus, Trash2, Users, ShieldCheck, Search, Loader2, Check, X, UserPlus, LogIn, PauseCircle, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

export default function AccessPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');
  const { confirm } = useConfirmDialog();

  const [groups, setGroups] = useState<AgentAccessGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Member management dialog
  const [editingGroup, setEditingGroup] = useState<AgentAccessGroup | null>(null);
  const [members, setMembers] = useState<AgentAccessGroupMember[]>([]);
  const [orgUsers, setOrgUsers] = useState<AgentOrgUser[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Usage detail modal
  const [usageGroup, setUsageGroup] = useState<AgentAccessGroup | null>(null);
  const [usageType, setUsageType] = useState<'logins' | 'approvals'>('logins');
  const [usageLogins, setUsageLogins] = useState<GroupUsageLogin[]>([]);
  const [usageApprovals, setUsageApprovals] = useState<GroupUsageApproval[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      setGroups(await getAgentAccessGroups(selectedOrgId));
    } catch { toast.error('Failed to load groups'); }
    finally { setLoading(false); }
  }, [selectedOrgId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleCreate = async () => {
    if (!selectedOrgId || !newGroupName.trim()) return;
    setCreating(true);
    try {
      await createAgentAccessGroup(selectedOrgId, newGroupName.trim());
      setNewGroupName('');
      toast.success('Group created');
      await loadGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create group');
    } finally { setCreating(false); }
  };

  const handleDelete = async (group: AgentAccessGroup) => {
    if (!selectedOrgId) return;
    const ok = await confirm({
      title: 'Delete group?',
      description: `"${group.name}" will be removed. Any actions using this group will become open to all users.`,
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteAgentAccessGroup(selectedOrgId, group.id);
      toast.success('Group deleted');
      await loadGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  // ── Member dialog ──

  const openMembers = async (group: AgentAccessGroup) => {
    if (!selectedOrgId) return;
    setEditingGroup(group);
    setMemberSearch('');
    setLoadingMembers(true);
    try {
      const [m, u] = await Promise.all([
        getAgentGroupMembers(selectedOrgId, group.id),
        getAgentOrgUsers(selectedOrgId),
      ]);
      setMembers(m);
      setOrgUsers(u);
      setPendingIds(new Set(m.map((x) => x.id)));
    } catch { toast.error('Failed to load members'); }
    finally { setLoadingMembers(false); }
  };

  const toggleUser = (userId: string) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const savedIds = new Set(members.map((m) => m.id));
  const hasChanges = pendingIds.size !== savedIds.size || [...pendingIds].some((id) => !savedIds.has(id));
  const toAdd = [...pendingIds].filter((id) => !savedIds.has(id));
  const toRemove = [...savedIds].filter((id) => !pendingIds.has(id));

  const handleSaveMembers = async () => {
    if (!selectedOrgId || !editingGroup) return;
    setSaving(true);
    try {
      await Promise.all([
        ...toAdd.map((uid) => addAgentGroupMember(selectedOrgId, editingGroup.id, uid)),
        ...toRemove.map((uid) => removeAgentGroupMember(selectedOrgId, editingGroup.id, uid)),
      ]);
      toast.success(`${toAdd.length + toRemove.length} change(s) saved`);
      setEditingGroup(null);
      await loadGroups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const filteredUsers = orgUsers.filter((u) => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return (u.email?.toLowerCase().includes(q)) ||
           (u.first_name?.toLowerCase().includes(q)) ||
           (u.last_name?.toLowerCase().includes(q));
  });

  const openUsage = async (group: AgentAccessGroup, type: 'logins' | 'approvals') => {
    if (!selectedOrgId) return;
    setUsageGroup(group);
    setUsageType(type);
    setLoadingUsage(true);
    try {
      const usage = await getGroupUsage(selectedOrgId, group.id);
      setUsageLogins(usage.logins);
      setUsageApprovals(usage.approvals);
    } catch { toast.error('Failed to load usage'); }
    finally { setLoadingUsage(false); }
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand" /> Access
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage groups of users who can interact with login and approval steps.
          </p>
        </div>
      </div>

      {/* Create group */}
      <Card className="py-0">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="New group name…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              className="h-8 text-sm max-w-xs"
            />
            <Button size="sm" onClick={handleCreate} disabled={creating || !newGroupName.trim()}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span className="ml-1">Create Group</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Groups table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No access groups yet. Create one above to control who can approve or log in during agent runs.
        </CardContent></Card>
      ) : (
        <Card className="overflow-hidden py-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Group</th>
                  <th className="text-right font-medium px-4 py-2.5 w-24">Members</th>
                  <th className="text-right font-medium px-4 py-2.5 w-24">Logins</th>
                  <th className="text-right font-medium px-4 py-2.5 w-24">Approvals</th>
                  <th className="text-right font-medium px-4 py-2.5 w-28">Created</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => openMembers(group)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{group.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Badge variant="outline" className="text-[10px]">{group.member_count}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {(group.login_count ?? 0) > 0 ? (
                        <button onClick={() => openUsage(group, 'logins')} className="text-xs tabular-nums text-brand hover:underline">{group.login_count}</button>
                      ) : <span className="text-xs text-muted-foreground/40">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {(group.approval_count ?? 0) > 0 ? (
                        <button onClick={() => openUsage(group, 'approvals')} className="text-xs tabular-nums text-brand hover:underline">{group.approval_count}</button>
                      ) : <span className="text-xs text-muted-foreground/40">0</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground text-xs">
                      {new Date(group.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/50 hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(group); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </Card>
      )}

      {/* Member management dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => { if (!open) setEditingGroup(null); }}>
        <DialogContent className="max-w-lg h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-brand" />
              {editingGroup?.name} — Members
            </DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search users…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* User list */}
          <div className="flex-1 overflow-auto min-h-0 space-y-0.5">
            {loadingMembers ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-6 text-center">No users found.</p>
            ) : (
              filteredUsers.map((user) => {
                const isMember = pendingIds.has(user.id);
                const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
                return (
                  <button
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                      isMember ? 'bg-brand/5 border border-brand/20' : 'hover:bg-muted/40 border border-transparent',
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded border flex items-center justify-center shrink-0',
                      isMember ? 'bg-brand border-brand' : 'border-border',
                    )}>
                      {isMember && <Check className="h-3 w-3 text-brand-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name || user.email}</div>
                      {name && <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>}
                    </div>
                    {!user.has_product_access && (
                      <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300 shrink-0">No access</Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="border-t pt-3">
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                {pendingIds.size} member{pendingIds.size !== 1 ? 's' : ''} selected
                {hasChanges && <span className="text-brand ml-1">· unsaved changes</span>}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingGroup(null)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveMembers} disabled={!hasChanges || saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage detail modal — shows which logins/approvals use a group */}
      <Dialog open={!!usageGroup} onOpenChange={(open) => { if (!open) setUsageGroup(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {usageType === 'logins' ? <LogIn className="h-4 w-4 text-brand" /> : <PauseCircle className="h-4 w-4 text-brand" />}
              {usageGroup?.name} — {usageType === 'logins' ? 'Logins' : 'Approvals'}
            </DialogTitle>
          </DialogHeader>
          {loadingUsage ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-1 max-h-[50vh] overflow-auto">
              {usageType === 'logins' ? (
                usageLogins.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">No logins using this group.</p>
                ) : (
                  usageLogins.map((login) => (
                    <Link
                      key={login.id}
                      href={`/actions/logins/${login.id}`}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/30 transition-colors group"
                    >
                      <LogIn className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{login.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{login.url}</div>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0" />
                    </Link>
                  ))
                )
              ) : (
                usageApprovals.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic py-4 text-center">No approval actions using this group.</p>
                ) : (
                  usageApprovals.map((approval) => (
                    <Link
                      key={approval.id}
                      href={`/agents/${approval.agent_id}?action=${approval.id}`}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/30 transition-colors group"
                    >
                      <PauseCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{approval.action_name}</div>
                        <div className="text-[10px] text-muted-foreground">on {approval.agent_name}</div>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0" />
                    </Link>
                  ))
                )
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
