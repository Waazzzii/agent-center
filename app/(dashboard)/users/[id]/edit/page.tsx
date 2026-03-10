'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/lib/hooks/use-permission';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { getUser, getUsers, updateUser, deleteUser } from '@/lib/api/users';
import { getUserAccessGroups, getAccessGroups, assignAccessGroupsToUser, removeAccessGroupsFromUser } from '@/lib/api/access-groups';
import type { User, UpdateUserDto, AccessGroup } from '@/types/api.types';
import { AdminRole } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ArrowLeft, ExternalLink, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteUserDialog } from '@/components/users/delete-user-dialog';

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = use(params);
  const router = useRouter();
  const { selectedOrgId } = useAdminViewStore();
  const { admin } = useAuthStore();
  const canChangeRole = admin?.role === AdminRole.SUPER_ADMIN || admin?.role === AdminRole.ORG_ADMIN;
  const permitted = useRequirePermission('users_read');
  const canUpdate = usePermission('users_update');
  const canDelete = usePermission('users_delete');
  const canReadAccessGroups = usePermission('access_groups_read');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userAccessGroups, setUserAccessGroups] = useState<AccessGroup[]>([]);
  const [allAccessGroups, setAllAccessGroups] = useState<AccessGroup[]>([]);
  const [agLoading, setAgLoading] = useState(false);
  const [selectedAddGroupId, setSelectedAddGroupId] = useState<string>('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [formData, setFormData] = useState<UpdateUserDto & { email: string; role: 'org_admin' | 'org_user' }>({
    email: '',
    first_name: '',
    last_name: '',
    display_name: '',
    phone: '',
    is_active: true,
    role: 'org_user',
  });

  useEffect(() => {
    if (!selectedOrgId || !permitted) {
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, userId, permitted]);

  const loadData = async () => {
    if (!selectedOrgId) return;

    try {
      setInitialLoading(true);
      const [userData, allUsersData] = await Promise.all([
        getUser(selectedOrgId, userId),
        getUsers(selectedOrgId),
      ]);

      setUser(userData);
      setFormData({
        email: userData.email,
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        display_name: userData.display_name || '',
        phone: userData.phone || '',
        is_active: userData.is_active,
        role: userData.role,
      });

      setAllUsers(allUsersData.users);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load user';
      toast.error(errorMessage);
      router.push('/users');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadAccessGroups = async () => {
    if (!selectedOrgId) return;
    try {
      setAgLoading(true);
      const userAgs = await getUserAccessGroups(selectedOrgId, userId);
      setUserAccessGroups(userAgs.access_groups);

      if (canReadAccessGroups) {
        const allAgs = await getAccessGroups(selectedOrgId);
        setAllAccessGroups(allAgs.access_groups);
      } else {
        setAllAccessGroups([]);
      }
    } catch {
      toast.error('Failed to load access groups');
    } finally {
      setAgLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!selectedOrgId || !selectedAddGroupId) return;
    try {
      setAddingGroup(true);
      await assignAccessGroupsToUser(selectedOrgId, userId, [selectedAddGroupId]);
      setSelectedAddGroupId('');
      await loadAccessGroups();
      toast.success('Access group assigned');
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign access group');
    } finally {
      setAddingGroup(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!selectedOrgId) return;
    try {
      await removeAccessGroupsFromUser(selectedOrgId, userId, [groupId]);
      await loadAccessGroups();
      toast.success('Access group removed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove access group');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error('Email is required');
      return;
    }

    if (!selectedOrgId) {
      toast.error('No organization selected');
      return;
    }

    try {
      setLoading(true);

      await updateUser(selectedOrgId, userId, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        display_name: formData.display_name,
        phone: formData.phone,
        is_active: formData.is_active,
        role: formData.role,
      });

      toast.success('User updated successfully');
      await loadData();
    } catch (error: any) {
      const errorMessage = error?.response?.status === 403
        ? "You don't have permission to update users"
        : error.response?.data?.message || error.message || 'Failed to update user';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async (reassignToUserId: string) => {
    if (!selectedOrgId || !user) return;

    const result = await deleteUser(selectedOrgId, userId, reassignToUserId);

    const stats = result.reassigned;
    const statsMessage = [
      stats.kb_articles_authored > 0 && `${stats.kb_articles_authored} articles authored`,
      stats.kb_articles_reviewed > 0 && `${stats.kb_articles_reviewed} articles reviewed`,
      stats.kb_article_versions > 0 && `${stats.kb_article_versions} article versions`,
      stats.kb_media > 0 && `${stats.kb_media} media files`,
      stats.organization_connectors > 0 && `${stats.organization_connectors} connectors`,
    ]
      .filter(Boolean)
      .join(', ');

    if (statsMessage) {
      toast.success(`User deleted successfully. Reassigned: ${statsMessage}`);
    } else {
      toast.success('User deleted successfully');
    }

    router.push('/users');
  };

  if (!permitted) return <NoPermissionContent />;

  if (initialLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/users')} className="w-fit">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{formData.email}</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {formData.display_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || 'User details'}
            </p>
          </div>
        </div>
        <Button variant="destructive" disabled={!canDelete} title={!canDelete ? "You don't have permission to perform this action" : undefined} onClick={() => setDeleteDialogOpen(true)} className="w-full sm:w-auto">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete User
        </Button>
      </div>

      <Tabs defaultValue="details" className="max-w-2xl" onValueChange={(v) => { if (v === 'access-groups') loadAccessGroups(); }}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="access-groups">Access Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>User Details</CardTitle>
              <CardDescription>Update the information for this user</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                    <p className="text-sm text-muted-foreground">
                      Email cannot be changed
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder="John"
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      placeholder="Doe"
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      type="text"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="John Doe"
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1 (555) 123-4567"
                      disabled={!canUpdate}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_active" className="text-base">Active Status</Label>
                      <p className="text-sm text-muted-foreground">
                        User can access the system when active
                      </p>
                    </div>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      disabled={!canUpdate}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base">Role</Label>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                        formData.role === 'org_admin'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                      )}>
                        {formData.role === 'org_admin' ? 'Administrator' : 'User'}
                      </span>
                      {canChangeRole && (
                        <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as 'org_admin' | 'org_user' })}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="org_user">User</SelectItem>
                            <SelectItem value="org_admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading || !canUpdate} title={!canUpdate ? "You don't have permission to perform this action" : undefined}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push('/users')}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access-groups">
          <Card>
            <CardHeader>
              <CardTitle>Access Groups</CardTitle>
              <CardDescription>Manage which access groups this user belongs to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  {userAccessGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No access groups assigned</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {userAccessGroups.map((ag) => (
                        <div key={ag.id} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{ag.name}</p>
                            {ag.description && (
                              <p className="text-xs text-muted-foreground truncate">{ag.description}</p>
                            )}
                          </div>
                          <div className="ml-4 flex items-center gap-2 flex-shrink-0">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/access-groups/${ag.id}`}>
                                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                Manage
                              </Link>
                            </Button>
                            {canUpdate && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveGroup(ag.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {canUpdate && canReadAccessGroups && (() => {
                    const assignedIds = new Set(userAccessGroups.map((g) => g.id));
                    const available = allAccessGroups.filter((g) => !assignedIds.has(g.id));
                    if (available.length === 0) return null;
                    return (
                      <div className="flex items-center gap-2 pt-2">
                        <Select value={selectedAddGroupId} onValueChange={setSelectedAddGroupId}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select a group to add..." />
                          </SelectTrigger>
                          <SelectContent>
                            {available.map((ag) => (
                              <SelectItem key={ag.id} value={ag.id}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{ag.name}</span>
                                  {ag.description && (
                                    <span className="text-xs text-muted-foreground">{ag.description}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!selectedAddGroupId || addingGroup}
                          onClick={handleAddGroup}
                        >
                          <UserPlus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {user && (
        <DeleteUserDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          userToDelete={user}
          availableUsers={allUsers}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
