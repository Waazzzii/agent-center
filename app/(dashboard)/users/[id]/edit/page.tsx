'use client';

import { use, useEffect, useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Trash2, Search, Plus, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [userGroups, setUserGroups] = useState<GroupMembership[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]); // For add dropdown
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]); // For bulk remove
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [activeTab, setActiveTab] = useState('details');
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

    const confirmed = await confirm({
      title: 'Remove from Group',
      description: 'Are you sure you want to remove this user from the group?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

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

    const confirmed = await confirm({
      title: 'Delete User',
      description: `Are you sure you want to delete user "${user.email}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteUser(selectedOrgId, userId);
      toast.success('User deleted successfully');
      router.push('/users');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete user';
      toast.error(errorMessage);
    }
  };

  // Available groups (not currently members) for add dropdown
  const availableGroups = useMemo(() => {
    const userGroupIds = new Set(userGroups.map(g => g.id));
    const query = groupSearch.toLowerCase().trim();

    return allGroups
      .filter(group => !userGroupIds.has(group.id))
      .filter(group => {
        if (!query) return true;
        return group.name.toLowerCase().includes(query) || group.slug.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, userGroups, groupSearch]);

  // Current members filtered by search
  const filteredMembers = useMemo(() => {
    const query = memberSearch.toLowerCase().trim();
    return userGroups
      .filter(group => {
        if (!query) return true;
        return group.name.toLowerCase().includes(query) || group.slug.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [userGroups, memberSearch]);

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleToggleMember = (groupId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSelectAllAvailable = () => {
    setSelectedGroupIds(availableGroups.map(g => g.id));
  };

  const handleDeselectAllAvailable = () => {
    setSelectedGroupIds([]);
  };

  const handleSelectAllMembers = () => {
    setSelectedMemberIds(filteredMembers.map(g => g.id));
  };

  const handleDeselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  const handleAddSelected = async () => {
    if (selectedGroupIds.length === 0) return;
    try {
      await handleAddGroups(selectedGroupIds);
      setSelectedGroupIds([]);
      setGroupSearch('');
      setAddDropdownOpen(false);
    } catch {
      // Error already handled by handleAddGroups
    }
  };

  const handleBulkRemove = async () => {
    if (selectedMemberIds.length === 0) return;

    const confirmed = await confirm({
      title: 'Remove from Groups',
      description: `Are you sure you want to remove this user from ${selectedMemberIds.length} group${selectedMemberIds.length !== 1 ? 's' : ''}?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    if (!selectedOrgId) return;
    try {
      await Promise.all(selectedMemberIds.map(groupId => removeUserFromGroup(selectedOrgId, userId, groupId)));
      toast.success(`User removed from ${selectedMemberIds.length} group${selectedMemberIds.length !== 1 ? 's' : ''}`);
      setSelectedMemberIds([]);
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove from groups';
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Group Memberships</CardTitle>
                  <CardDescription>
                    {userGroups.length} group{userGroups.length !== 1 ? 's' : ''} assigned to this user
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemove}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addDropdownOpen} onOpenChange={setAddDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Groups
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="end">
                      <div className="flex flex-col max-h-[500px]">
                        {/* Search and controls */}
                        <div className="p-4 border-b space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search groups..."
                              value={groupSearch}
                              onChange={(e) => setGroupSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              {selectedGroupIds.length} selected
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleSelectAllAvailable}
                                disabled={availableGroups.length === 0}
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                All
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDeselectAllAvailable}
                                disabled={selectedGroupIds.length === 0}
                              >
                                <Square className="h-4 w-4 mr-1" />
                                None
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Available groups list */}
                        <div className="flex-1 overflow-y-auto p-2">
                          {availableGroups.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                              {groupSearch ? 'No matching groups found' : 'All groups are already assigned'}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {availableGroups.map((group) => (
                                <div
                                  key={group.id}
                                  className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                  onClick={() => handleToggleGroup(group.id)}
                                >
                                  <Checkbox
                                    checked={selectedGroupIds.includes(group.id)}
                                    onCheckedChange={() => handleToggleGroup(group.id)}
                                    className="pointer-events-none"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{group.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{group.slug}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Add button */}
                        <div className="p-3 border-t">
                          <Button
                            onClick={handleAddSelected}
                            disabled={selectedGroupIds.length === 0}
                            className="w-full"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Selected ({selectedGroupIds.length})
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search current members */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search assigned groups..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllMembers}
                    disabled={filteredMembers.length === 0}
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAllMembers}
                    disabled={selectedMemberIds.length === 0}
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Current members table */}
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {memberSearch ? 'No matching groups found' : 'User is not a member of any groups yet'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedMemberIds.includes(group.id)}
                            onCheckedChange={() => handleToggleMember(group.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-muted-foreground">{group.slug}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveGroup(group.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
