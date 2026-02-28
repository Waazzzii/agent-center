'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getUser, getUsers, updateUser, deleteUser } from '@/lib/api/users';
import { getGroups } from '@/lib/api/groups';
import { getUserGroups, addGroupsToUser, removeGroupsFromUser } from '@/lib/api/user-groups';
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
import { ArrowLeft, Trash2, Search, Plus, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { toast } from 'sonner';
import { DeleteUserDialog } from '@/components/users/delete-user-dialog';

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: userId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [userGroups, setUserGroups] = useState<GroupMembership[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]); // For add dropdown
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]); // For bulk remove
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [activeTab, setActiveTab] = useState('details');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
      const [userData, allUsersData, allGroupsData, userGroupsData] = await Promise.all([
        getUser(selectedOrgId, userId),
        getUsers(selectedOrgId),
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

      setAllUsers(allUsersData.users);
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
    if (!selectedOrgId || groupIds.length === 0) return;
    try {
      await addGroupsToUser(selectedOrgId, userId, groupIds);
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

    try {
      await removeGroupsFromUser(selectedOrgId, userId, [groupId]);
      toast.success('User removed from group');
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove from group';
      toast.error(errorMessage);
    }
  };

  const handleDeleteConfirm = async (reassignToUserId: string) => {
    if (!selectedOrgId || !user) return;

    const result = await deleteUser(selectedOrgId, userId, reassignToUserId);

    // Show success message with reassignment stats
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

  // Calculate available groups selection state
  const availableSelectionState = useMemo(() => {
    if (availableGroups.length === 0) return 'none';
    const selectedCount = selectedGroupIds.filter(id =>
      availableGroups.some(g => g.id === id)
    ).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === availableGroups.length) return 'all';
    return 'some';
  }, [selectedGroupIds, availableGroups]);

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

  // Calculate member selection state
  const memberSelectionState = useMemo(() => {
    if (filteredMembers.length === 0) return 'none';
    const selectedCount = selectedMemberIds.filter(id =>
      filteredMembers.some(m => m.id === id)
    ).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === filteredMembers.length) return 'all';
    return 'some';
  }, [selectedMemberIds, filteredMembers]);

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

  const handleToggleSelectAllAvailable = () => {
    if (availableSelectionState === 'all') {
      // Deselect all available groups
      setSelectedGroupIds(prev =>
        prev.filter(id => !availableGroups.some(g => g.id === id))
      );
    } else {
      // Select all available groups
      const availableIds = availableGroups.map(g => g.id);
      setSelectedGroupIds(prev => {
        const newIds = availableIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
  };

  const handleToggleSelectAllMembers = () => {
    if (memberSelectionState === 'all') {
      // Deselect all filtered members
      setSelectedMemberIds(prev =>
        prev.filter(id => !filteredMembers.some(m => m.id === id))
      );
    } else {
      // Select all filtered members (add to existing selection)
      const filteredIds = filteredMembers.map(m => m.id);
      setSelectedMemberIds(prev => {
        const newIds = filteredIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
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
    if (!selectedOrgId || selectedMemberIds.length === 0) return;
    try {
      await removeGroupsFromUser(selectedOrgId, userId, selectedMemberIds);
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
        <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="w-full sm:w-auto">
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Group Memberships</CardTitle>
                  <CardDescription>
                    {userGroups.length} group{userGroups.length !== 1 ? 's' : ''} assigned to this user
                  </CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {selectedMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemove}
                      variant="destructive"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addDropdownOpen} onOpenChange={setAddDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" className="flex-1 sm:flex-none">
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleSelectAllAvailable}
                              disabled={availableGroups.length === 0}
                              title={
                                availableSelectionState === 'all'
                                  ? 'Deselect all'
                                  : availableSelectionState === 'some'
                                  ? 'Select all'
                                  : 'Select all'
                              }
                            >
                              {availableSelectionState === 'all' ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : availableSelectionState === 'some' ? (
                                <MinusSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </Button>
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleToggleSelectAllMembers}
                  disabled={filteredMembers.length === 0}
                  title={
                    memberSelectionState === 'all'
                      ? 'Deselect all'
                      : memberSelectionState === 'some'
                      ? 'Select all'
                      : 'Select all'
                  }
                >
                  {memberSelectionState === 'all' ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : memberSelectionState === 'some' ? (
                    <MinusSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Current members table */}
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {memberSearch ? 'No matching groups found' : 'User is not a member of any groups yet'}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden space-y-3">
                    {filteredMembers.map((group) => (
                      <Card key={group.id} className="p-4">
                        <div className="flex items-stretch gap-3">
                          <Checkbox
                            checked={selectedMemberIds.includes(group.id)}
                            onCheckedChange={() => handleToggleMember(group.id)}
                            className="self-center"
                          />
                          <div className="flex-1 min-w-0 space-y-3 py-1 pr-4">
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              <div className="flex-1 min-w-[120px]">
                                <div className="text-sm font-medium text-muted-foreground">Name</div>
                                <div className="font-medium">{group.name}</div>
                              </div>
                              <div className="flex-1 min-w-[120px]">
                                <div className="text-sm font-medium text-muted-foreground">Slug</div>
                                <div className="text-muted-foreground">{group.slug}</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col w-12 -mr-4 -my-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveGroup(group.id)}
                              className="flex-1 rounded-none rounded-r-lg border-l border-r-0 border-y-0 border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <Table className="hidden sm:table">
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
