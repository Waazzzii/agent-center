'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getUser, updateUser, deleteUser } from '@/lib/api/users';
import { getGroups } from '@/lib/api/groups';
import { getUserGroups, addUserToGroup, removeUserFromGroup } from '@/lib/api/user-groups';
import type { User, UpdateUserDto, Group } from '@/types/api.types';
import type { GroupMembership } from '@/lib/api/user-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RelationshipManager } from '@/components/ui/relationship-manager';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [userGroups, setUserGroups] = useState<GroupMembership[]>([]);
  const [formData, setFormData] = useState<UpdateUserDto & { email: string }>({
    email: '',
    first_name: '',
    last_name: '',
    display_name: '',
    phone: '',
    is_active: true,
  });

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/users');
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, userId]);

  const loadData = async () => {
    if (!selectedOrgId) return;

    try {
      setInitialLoading(true);
      const [userData, allGroupsData, userGroupsData] = await Promise.all([
        getUser(selectedOrgId, userId),
        getGroups(selectedOrgId),
        getUserGroups(selectedOrgId, userId),
      ]);

      setUser(userData);
      setFormData({
        email: userData.email,
        first_name: userData.first_name || '',
        last_name: userData.last_name || '',
        display_name: userData.display_name || '',
        phone: userData.phone || '',
        is_active: userData.is_active,
      });

      setAllGroups(allGroupsData.groups);
      setUserGroups(userGroupsData.groups);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load user';
      toast.error(errorMessage);
      router.push('/users');
    } finally {
      setInitialLoading(false);
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

      // Update user details only
      await updateUser(selectedOrgId, userId, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        display_name: formData.display_name,
        phone: formData.phone,
        is_active: formData.is_active,
      });

      toast.success('User updated successfully');
      await loadData(); // Reload to refresh all tabs
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update user';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroups = async (groupIds: string[]) => {
    if (!selectedOrgId) return;
    try {
      await Promise.all(groupIds.map(groupId => addUserToGroup(selectedOrgId, userId, groupId)));
      toast.success(`${groupIds.length} group${groupIds.length !== 1 ? 's' : ''} added`);
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add groups';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this user from the group?')) return;

    try {
      await removeUserFromGroup(selectedOrgId, userId, groupId);
      toast.success('User removed from group');
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove from group';
      toast.error(errorMessage);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedOrgId || !user) return;
    if (!confirm(`Are you sure you want to delete user "${user.email}"? This action cannot be undone.`)) return;

    try {
      await deleteUser(selectedOrgId, userId);
      toast.success('User deleted successfully');
      router.push('/users');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete user';
      toast.error(errorMessage);
    }
  };

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
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/users')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{formData.email}</h1>
            <p className="text-muted-foreground">
              {formData.display_name || `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || 'User details'}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteUser}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete User
        </Button>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="groups">Groups ({userGroups.length})</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card className="max-w-2xl">
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
                      onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading}>
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

        {/* Groups Tab */}
        <TabsContent value="groups" className="mt-6">
          <RelationshipManager
            title="Group Memberships"
            description={`${userGroups.length} group${userGroups.length !== 1 ? 's' : ''} assigned to this user`}
            currentItems={userGroups.map((group) => ({
              id: group.id,
              primaryLabel: group.name,
              secondaryLabel: group.slug,
              status: {
                label: 'Member',
                variant: 'active',
              },
            }))}
            availableItems={allGroups.map((group) => ({
              id: group.id,
              primaryLabel: group.name,
              secondaryLabel: group.slug,
            }))}
            onAdd={handleAddGroups}
            onRemove={handleRemoveGroup}
            searchPlaceholder="Search groups by name or slug..."
            emptyCurrentMessage="User is not a member of any groups yet"
            emptyAvailableMessage="No groups available to add"
            addButtonLabel="Add to Groups"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
