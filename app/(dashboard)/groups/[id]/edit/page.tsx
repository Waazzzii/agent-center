'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getGroup, updateGroup, deleteGroup } from '@/lib/api/groups';
import { getUsers } from '@/lib/api/users';
import { getConnectors } from '@/lib/api/connectors';
import { getGroupUsers, addUserToGroup, removeUserFromGroup } from '@/lib/api/user-groups';
import { getGroupConnectors, addConnectorToGroup, removeConnectorFromGroup } from '@/lib/api/group-connectors';
import type { UpdateGroupDto, User, OrganizationConnector, Group } from '@/types/api.types';
import type { UserMembership } from '@/lib/api/user-groups';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState<UpdateGroupDto & { name: string; slug: string }>({
    name: '',
    slug: '',
    description: '',
    is_active: true,
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allConnectors, setAllConnectors] = useState<OrganizationConnector[]>([]);
  const [members, setMembers] = useState<UserMembership[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);

  // Users (Members) tab state
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]); // For add dropdown
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]); // For bulk remove
  const [addUsersDropdownOpen, setAddUsersDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  // Connectors tab state
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]); // For add dropdown
  const [selectedConnectorMemberIds, setSelectedConnectorMemberIds] = useState<string[]>([]); // For bulk remove
  const [addConnectorsDropdownOpen, setAddConnectorsDropdownOpen] = useState(false);
  const [connectorSearch, setConnectorSearch] = useState('');
  const [connectorMemberSearch, setConnectorMemberSearch] = useState('');

  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      return;
    }

    loadGroup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, groupId]);

  const loadGroup = async () => {
    if (!selectedOrgId) return;

    try {
      setInitialLoading(true);
      const [groupData, allUsersData, allConnectorsData, groupUsersData, groupConnectorsData] = await Promise.all([
        getGroup(selectedOrgId, groupId),
        getUsers(selectedOrgId),
        getConnectors(selectedOrgId),
        getGroupUsers(selectedOrgId, groupId),
        getGroupConnectors(selectedOrgId, groupId),
      ]);

      setGroup(groupData);
      setFormData({
        name: groupData.name,
        slug: groupData.slug,
        description: groupData.description || '',
        is_active: groupData.is_active,
      });

      setAllUsers(allUsersData.users);
      setAllConnectors(allConnectorsData.connectors);
      setMembers(groupUsersData.users);
      setConnectors(groupConnectorsData.connectors);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load group');
      router.push('/groups');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSlugChange = (value: string) => {
    // Enforce slug format
    const cleanSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    setFormData({ ...formData, slug: cleanSlug });
  };

  const validateSlug = (slug: string): boolean => {
    // Slug should only contain lowercase letters, numbers, and hyphens
    const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    return slugRegex.test(slug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      toast.error('Name is required');
      return;
    }

    if (!formData.slug) {
      toast.error('Slug is required');
      return;
    }

    if (!validateSlug(formData.slug)) {
      toast.error('Slug must contain only lowercase letters, numbers, and hyphens');
      return;
    }

    if (!selectedOrgId) {
      toast.error('No organization selected');
      return;
    }

    try {
      setLoading(true);

      // Update group details only
      await updateGroup(selectedOrgId, groupId, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        is_active: formData.is_active,
      });

      toast.success('Group updated successfully');
      await loadGroup(); // Reload to refresh all tabs
    } catch (error: any) {
      toast.error(error.message || 'Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUsers = async (userIds: string[]) => {
    if (!selectedOrgId) return;
    try {
      await Promise.all(userIds.map(userId => addUserToGroup(selectedOrgId, userId, groupId)));
      toast.success(`${userIds.length} user${userIds.length !== 1 ? 's' : ''} added to group`);
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add users';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this user from the group?')) return;

    try {
      await removeUserFromGroup(selectedOrgId, userId, groupId);
      toast.success('User removed from group');
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove user';
      toast.error(errorMessage);
    }
  };

  const handleAddConnectors = async (connectorIds: string[]) => {
    if (!selectedOrgId) return;
    try {
      await Promise.all(
        connectorIds.map(connectorId =>
          addConnectorToGroup(selectedOrgId, groupId, {
            connector_id: connectorId,
            authorized_endpoints: [],
            is_enabled: true,
          })
        )
      );
      toast.success(`${connectorIds.length} connector${connectorIds.length !== 1 ? 's' : ''} added to group`);
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add connectors';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleRemoveConnector = async (connectorId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this connector from the group?')) return;

    try {
      await removeConnectorFromGroup(selectedOrgId, groupId, connectorId);
      toast.success('Connector removed from group');
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove connector';
      toast.error(errorMessage);
    }
  };

  // Available users (not currently members) for add dropdown
  const availableUsers = useMemo(() => {
    const memberUserIds = new Set(members.map(m => m.id));
    const query = userSearch.toLowerCase().trim();

    return allUsers
      .filter(user => !memberUserIds.has(user.id))
      .filter(user => {
        if (!query) return true;
        return user.email.toLowerCase().includes(query) ||
               user.first_name?.toLowerCase().includes(query) ||
               user.last_name?.toLowerCase().includes(query) ||
               user.display_name?.toLowerCase().includes(query);
      })
      .sort((a, b) => (a.email).localeCompare(b.email));
  }, [allUsers, members, userSearch]);

  // Current members filtered by search
  const filteredMembers = useMemo(() => {
    const query = memberSearch.toLowerCase().trim();
    return members
      .filter(user => {
        if (!query) return true;
        return user.email.toLowerCase().includes(query) ||
               user.first_name?.toLowerCase().includes(query) ||
               user.last_name?.toLowerCase().includes(query) ||
               user.display_name?.toLowerCase().includes(query);
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [members, memberSearch]);

  // Available connectors (not currently assigned) for add dropdown
  const availableConnectors = useMemo(() => {
    const connectorIds = new Set(connectors.map(c => c.connector_id));
    const query = connectorSearch.toLowerCase().trim();

    return allConnectors
      .filter(conn => !connectorIds.has(conn.id))
      .filter(conn => {
        if (!query) return true;
        return conn.connector_name.toLowerCase().includes(query) ||
               conn.connector_key.toLowerCase().includes(query);
      })
      .sort((a, b) => a.connector_name.localeCompare(b.connector_name));
  }, [allConnectors, connectors, connectorSearch]);

  // Current connectors filtered by search
  const filteredConnectors = useMemo(() => {
    const query = connectorMemberSearch.toLowerCase().trim();
    return connectors
      .filter(conn => {
        if (!query) return true;
        return conn.connector_name.toLowerCase().includes(query) ||
               conn.connector_key.toLowerCase().includes(query);
      })
      .sort((a, b) => a.connector_name.localeCompare(b.connector_name));
  }, [connectors, connectorMemberSearch]);

  // User handlers
  const handleToggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllAvailableUsers = () => {
    setSelectedUserIds(availableUsers.map(u => u.id));
  };

  const handleDeselectAllAvailableUsers = () => {
    setSelectedUserIds([]);
  };

  const handleSelectAllMembers = () => {
    setSelectedMemberIds(filteredMembers.map(u => u.id));
  };

  const handleDeselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  const handleAddSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;
    try {
      await handleAddUsers(selectedUserIds);
      setSelectedUserIds([]);
      setUserSearch('');
      setAddUsersDropdownOpen(false);
    } catch {
      // Error already handled by handleAddUsers
    }
  };

  const handleBulkRemoveMembers = async () => {
    if (selectedMemberIds.length === 0) return;
    if (!confirm(`Are you sure you want to remove ${selectedMemberIds.length} user${selectedMemberIds.length !== 1 ? 's' : ''} from this group?`)) return;

    if (!selectedOrgId) return;
    try {
      await Promise.all(selectedMemberIds.map(userId => removeUserFromGroup(selectedOrgId, userId, groupId)));
      toast.success(`${selectedMemberIds.length} user${selectedMemberIds.length !== 1 ? 's' : ''} removed from group`);
      setSelectedMemberIds([]);
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove users';
      toast.error(errorMessage);
    }
  };

  // Connector handlers
  const handleToggleConnector = (connectorId: string) => {
    setSelectedConnectorIds(prev =>
      prev.includes(connectorId) ? prev.filter(id => id !== connectorId) : [...prev, connectorId]
    );
  };

  const handleToggleConnectorMember = (connectorId: string) => {
    setSelectedConnectorMemberIds(prev =>
      prev.includes(connectorId) ? prev.filter(id => id !== connectorId) : [...prev, connectorId]
    );
  };

  const handleSelectAllAvailableConnectors = () => {
    setSelectedConnectorIds(availableConnectors.map(c => c.id));
  };

  const handleDeselectAllAvailableConnectors = () => {
    setSelectedConnectorIds([]);
  };

  const handleSelectAllConnectorMembers = () => {
    setSelectedConnectorMemberIds(filteredConnectors.map(c => c.connector_id));
  };

  const handleDeselectAllConnectorMembers = () => {
    setSelectedConnectorMemberIds([]);
  };

  const handleAddSelectedConnectors = async () => {
    if (selectedConnectorIds.length === 0) return;
    try {
      await handleAddConnectors(selectedConnectorIds);
      setSelectedConnectorIds([]);
      setConnectorSearch('');
      setAddConnectorsDropdownOpen(false);
    } catch {
      // Error already handled by handleAddConnectors
    }
  };

  const handleBulkRemoveConnectors = async () => {
    if (selectedConnectorMemberIds.length === 0) return;
    if (!confirm(`Are you sure you want to remove ${selectedConnectorMemberIds.length} connector${selectedConnectorMemberIds.length !== 1 ? 's' : ''} from this group?`)) return;

    if (!selectedOrgId) return;
    try {
      await Promise.all(selectedConnectorMemberIds.map(connectorId => removeConnectorFromGroup(selectedOrgId, groupId, connectorId)));
      toast.success(`${selectedConnectorMemberIds.length} connector${selectedConnectorMemberIds.length !== 1 ? 's' : ''} removed from group`);
      setSelectedConnectorMemberIds([]);
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove connectors';
      toast.error(errorMessage);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedOrgId || !group) return;
    if (!confirm(`Are you sure you want to delete the group "${group.name}"? This action cannot be undone.`)) return;

    try {
      await deleteGroup(selectedOrgId, groupId);
      toast.success('Group deleted successfully');
      router.push('/groups');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete group';
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
          <Button variant="ghost" size="sm" onClick={() => router.push('/groups')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{group?.name || 'Edit Group'}</h1>
            <p className="text-muted-foreground">{group?.description || 'Manage group details and relationships'}</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteGroup}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Group
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
          <TabsTrigger value="connectors">Connectors ({connectors.length})</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Group Details</CardTitle>
              <CardDescription>Update the information for this group</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Engineering Team"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  required
                  placeholder="engineering-team"
                />
                <p className="text-sm text-muted-foreground">
                  URL-friendly identifier (lowercase letters, numbers, and hyphens only)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A brief description of this group..."
                  rows={4}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="text-base">Active Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Group is active and available for use
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
                  <Button type="button" variant="outline" onClick={() => router.push('/groups')}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Group Members</CardTitle>
                  <CardDescription>
                    {members.length} member{members.length !== 1 ? 's' : ''} in this group
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemoveMembers}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addUsersDropdownOpen} onOpenChange={setAddUsersDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Users
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="end">
                      <div className="flex flex-col max-h-[500px]">
                        <div className="p-4 border-b space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search users..."
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              {selectedUserIds.length} selected
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleSelectAllAvailableUsers}
                                disabled={availableUsers.length === 0}
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                All
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDeselectAllAvailableUsers}
                                disabled={selectedUserIds.length === 0}
                              >
                                <Square className="h-4 w-4 mr-1" />
                                None
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                          {availableUsers.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                              {userSearch ? 'No matching users found' : 'All users are already members'}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {availableUsers.map((user) => {
                                const displayName = user.display_name ||
                                  `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                                  user.email;
                                return (
                                  <div
                                    key={user.id}
                                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                    onClick={() => handleToggleUser(user.id)}
                                  >
                                    <Checkbox
                                      checked={selectedUserIds.includes(user.id)}
                                      onCheckedChange={() => handleToggleUser(user.id)}
                                      className="pointer-events-none"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{displayName}</div>
                                      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="p-3 border-t">
                          <Button
                            onClick={handleAddSelectedUsers}
                            disabled={selectedUserIds.length === 0}
                            className="w-full"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Selected ({selectedUserIds.length})
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search members..."
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
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {memberSearch ? 'No matching members found' : 'No members in this group yet'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => {
                      const displayName = member.display_name ||
                        `${member.first_name || ''} ${member.last_name || ''}`.trim() ||
                        member.email;
                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedMemberIds.includes(member.id)}
                              onCheckedChange={() => handleToggleMember(member.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{displayName}</TableCell>
                          <TableCell className="text-muted-foreground">{member.email}</TableCell>
                          <TableCell>
                            {member.is_active ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                Inactive
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveMember(member.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connectors Tab */}
        <TabsContent value="connectors" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Group Connectors</CardTitle>
                  <CardDescription>
                    {connectors.length} connector{connectors.length !== 1 ? 's' : ''} accessible to this group
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedConnectorMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemoveConnectors}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedConnectorMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addConnectorsDropdownOpen} onOpenChange={setAddConnectorsDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Connectors
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="end">
                      <div className="flex flex-col max-h-[500px]">
                        <div className="p-4 border-b space-y-3">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder="Search connectors..."
                              value={connectorSearch}
                              onChange={(e) => setConnectorSearch(e.target.value)}
                              className="pl-9"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                              {selectedConnectorIds.length} selected
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleSelectAllAvailableConnectors}
                                disabled={availableConnectors.length === 0}
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                All
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDeselectAllAvailableConnectors}
                                disabled={selectedConnectorIds.length === 0}
                              >
                                <Square className="h-4 w-4 mr-1" />
                                None
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                          {availableConnectors.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                              {connectorSearch ? 'No matching connectors found' : 'All connectors are already assigned'}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {availableConnectors.map((connector) => (
                                <div
                                  key={connector.id}
                                  className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                                  onClick={() => handleToggleConnector(connector.id)}
                                >
                                  <Checkbox
                                    checked={selectedConnectorIds.includes(connector.id)}
                                    onCheckedChange={() => handleToggleConnector(connector.id)}
                                    className="pointer-events-none"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{connector.connector_name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{connector.connector_key}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="p-3 border-t">
                          <Button
                            onClick={handleAddSelectedConnectors}
                            disabled={selectedConnectorIds.length === 0}
                            className="w-full"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Add Selected ({selectedConnectorIds.length})
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search connectors..."
                    value={connectorMemberSearch}
                    onChange={(e) => setConnectorMemberSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllConnectorMembers}
                    disabled={filteredConnectors.length === 0}
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDeselectAllConnectorMembers}
                    disabled={selectedConnectorMemberIds.length === 0}
                  >
                    <Square className="h-4 w-4 mr-1" />
                    Deselect All
                  </Button>
                </div>
              </div>
              {filteredConnectors.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {connectorMemberSearch ? 'No matching connectors found' : 'No connectors assigned to this group yet'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Connector</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredConnectors.map((connector) => (
                      <TableRow key={connector.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedConnectorMemberIds.includes(connector.connector_id)}
                            onCheckedChange={() => handleToggleConnectorMember(connector.connector_id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{connector.connector_name}</div>
                            <div className="text-sm text-muted-foreground">{connector.connector_key}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {connector.is_enabled ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Enabled
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                              Disabled
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveConnector(connector.connector_id)}
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
