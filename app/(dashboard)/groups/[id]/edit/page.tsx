'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getGroup, updateGroup, deleteGroup } from '@/lib/api/groups';
import { getUsers } from '@/lib/api/users';
import { getConnectors } from '@/lib/api/connectors';
import { getConnector as getBaseConnector } from '@/lib/api/connectors-base';
import { getGroupUsers, addUsersToGroup, removeUsersFromGroup } from '@/lib/api/user-groups';
import { getGroupConnectors, addConnectorToGroup, removeConnectorFromGroup, updateGroupConnector } from '@/lib/api/group-connectors';
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
import { ArrowLeft, Trash2, Search, Plus, CheckSquare, Square, Pencil, MinusSquare } from 'lucide-react';
import { toast } from 'sonner';
import { EndpointSelectionModal } from '@/components/endpoint-selection-modal';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
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

  // Endpoint management state
  const [connectorEndpoints, setConnectorEndpoints] = useState<Record<string, string[]>>({});
  const [endpointModalOpen, setEndpointModalOpen] = useState(false);
  const [currentConnectorForEndpoints, setCurrentConnectorForEndpoints] = useState<{
    id: string;
    name: string;
    availableEndpoints: string[];
  } | null>(null);
  const [isAddingConnectors, setIsAddingConnectors] = useState(false);
  const [pendingConnectorIds, setPendingConnectorIds] = useState<string[]>([]);

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

      // Store authorized endpoints for each connector
      const endpointsMap: Record<string, string[]> = {};
      groupConnectorsData.connectors.forEach((connector: any) => {
        endpointsMap[connector.organization_connector_id] = connector.authorized_endpoints || [];
      });
      setConnectorEndpoints(endpointsMap);
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
    if (!selectedOrgId || userIds.length === 0) return;
    try {
      await addUsersToGroup(selectedOrgId, groupId, userIds);
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

    const confirmed = await confirm({
      title: 'Remove User',
      description: 'Are you sure you want to remove this user from the group?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await removeUsersFromGroup(selectedOrgId, groupId, [userId]);
      toast.success('User removed from group');
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove user';
      toast.error(errorMessage);
    }
  };

  const handleAddConnectors = async (orgConnectorIds: string[], authorizedEndpoints: string[]) => {
    if (!selectedOrgId) return;
    try {
      await Promise.all(
        orgConnectorIds.map(orgConnectorId =>
          addConnectorToGroup(selectedOrgId, groupId, {
            organization_connector_id: orgConnectorId,
            authorized_endpoints: authorizedEndpoints,
            is_enabled: true,
          })
        )
      );
      toast.success(`${orgConnectorIds.length} connector${orgConnectorIds.length !== 1 ? 's' : ''} added to group`);
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add connectors';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleRemoveConnector = async (connectorId: string) => {
    if (!selectedOrgId) return;

    const confirmed = await confirm({
      title: 'Remove Connector',
      description: 'Are you sure you want to remove this connector from the group?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

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

  // Calculate available users selection state
  const availableUsersSelectionState = useMemo(() => {
    if (availableUsers.length === 0) return 'none';
    const selectedCount = selectedUserIds.filter(id =>
      availableUsers.some(u => u.id === id)
    ).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === availableUsers.length) return 'all';
    return 'some';
  }, [selectedUserIds, availableUsers]);

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

  // Available connectors (not currently assigned) for add dropdown
  const availableConnectors = useMemo(() => {
    const orgConnectorIds = new Set(connectors.map(c => c.organization_connector_id));
    const query = connectorSearch.toLowerCase().trim();

    return allConnectors
      .filter(conn => !orgConnectorIds.has(conn.id))
      .filter(conn => {
        if (!query) return true;
        return conn.connector_name.toLowerCase().includes(query) ||
               conn.connector_key.toLowerCase().includes(query);
      })
      .sort((a, b) => a.connector_name.localeCompare(b.connector_name));
  }, [allConnectors, connectors, connectorSearch]);

  // Calculate available connectors selection state
  const availableConnectorsSelectionState = useMemo(() => {
    if (availableConnectors.length === 0) return 'none';
    const selectedCount = selectedConnectorIds.filter(id =>
      availableConnectors.some(c => c.id === id)
    ).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === availableConnectors.length) return 'all';
    return 'some';
  }, [selectedConnectorIds, availableConnectors]);

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

  // Calculate connector member selection state
  const connectorMemberSelectionState = useMemo(() => {
    if (filteredConnectors.length === 0) return 'none';
    const selectedCount = selectedConnectorMemberIds.filter(id =>
      filteredConnectors.some(c => c.organization_connector_id === id)
    ).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === filteredConnectors.length) return 'all';
    return 'some';
  }, [selectedConnectorMemberIds, filteredConnectors]);

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

  const handleToggleSelectAllAvailableUsers = () => {
    if (availableUsersSelectionState === 'all') {
      setSelectedUserIds(prev =>
        prev.filter(id => !availableUsers.some(u => u.id === id))
      );
    } else {
      const availableIds = availableUsers.map(u => u.id);
      setSelectedUserIds(prev => {
        const newIds = availableIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
  };

  const handleToggleSelectAllMembers = () => {
    if (memberSelectionState === 'all') {
      setSelectedMemberIds(prev =>
        prev.filter(id => !filteredMembers.some(m => m.id === id))
      );
    } else {
      const filteredIds = filteredMembers.map(m => m.id);
      setSelectedMemberIds(prev => {
        const newIds = filteredIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
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

    const confirmed = await confirm({
      title: 'Remove Users',
      description: `Are you sure you want to remove ${selectedMemberIds.length} user${selectedMemberIds.length !== 1 ? 's' : ''} from this group?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    if (!selectedOrgId || selectedMemberIds.length === 0) return;
    try {
      await removeUsersFromGroup(selectedOrgId, groupId, selectedMemberIds);
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
      prev.includes(connectorId) ? [] : [connectorId]
    );
  };

  const handleToggleConnectorMember = (connectorId: string) => {
    setSelectedConnectorMemberIds(prev =>
      prev.includes(connectorId) ? prev.filter(id => id !== connectorId) : [...prev, connectorId]
    );
  };

  const handleToggleSelectAllAvailableConnectors = () => {
    if (availableConnectorsSelectionState === 'all') {
      setSelectedConnectorIds(prev =>
        prev.filter(id => !availableConnectors.some(c => c.id === id))
      );
    } else {
      const availableIds = availableConnectors.map(c => c.id);
      setSelectedConnectorIds(prev => {
        const newIds = availableIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
  };

  const handleToggleSelectAllConnectorMembers = () => {
    if (connectorMemberSelectionState === 'all') {
      setSelectedConnectorMemberIds(prev =>
        prev.filter(id => !filteredConnectors.some(c => c.organization_connector_id === id))
      );
    } else {
      const filteredIds = filteredConnectors.map(c => c.organization_connector_id);
      setSelectedConnectorMemberIds(prev => {
        const newIds = filteredIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
    }
  };

  const handleAddSelectedConnectors = async () => {
    if (selectedConnectorIds.length === 0) return;

    try {
      // Get the first connector's details for endpoint selection
      const firstConnectorId = selectedConnectorIds[0];
      const firstConnector = allConnectors.find(c => c.id === firstConnectorId);

      if (!firstConnector) {
        toast.error('Connector not found');
        return;
      }

      // Fetch base connector details to get available endpoints
      const baseConnector = await getBaseConnector(firstConnector.connector_id);

      // Show endpoint modal
      setIsAddingConnectors(true);
      setPendingConnectorIds(selectedConnectorIds);
      setCurrentConnectorForEndpoints({
        id: firstConnector.id,
        name: firstConnector.connector_name,
        availableEndpoints: baseConnector.available_endpoints || [],
      });
      setEndpointModalOpen(true);
      setAddConnectorsDropdownOpen(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load connector details');
    }
  };

  const handleEndpointsConfirmed = async (authorizedEndpoints: string[]) => {
    if (isAddingConnectors) {
      // Adding new connectors
      try {
        await handleAddConnectors(pendingConnectorIds, authorizedEndpoints);
        setSelectedConnectorIds([]);
        setConnectorSearch('');
        setPendingConnectorIds([]);
        setIsAddingConnectors(false);
      } catch {
        // Error already handled by handleAddConnectors
      }
    } else if (currentConnectorForEndpoints) {
      // Editing existing connector
      await handleUpdateConnectorEndpoints(currentConnectorForEndpoints.id, authorizedEndpoints);
    }
  };

  const handleEditConnectorEndpoints = (orgConnectorId: string) => {
    const connector = connectors.find(c => c.organization_connector_id === orgConnectorId);
    if (!connector) return;

    setIsAddingConnectors(false);
    setCurrentConnectorForEndpoints({
      id: connector.organization_connector_id,
      name: connector.connector_name || 'Unknown Connector',
      availableEndpoints: connector.connector_available_endpoints || [],
    });
    setEndpointModalOpen(true);
  };

  const handleUpdateConnectorEndpoints = async (connectorId: string, authorizedEndpoints: string[]) => {
    if (!selectedOrgId) return;

    try {
      await updateGroupConnector(selectedOrgId, groupId, connectorId, {
        authorized_endpoints: authorizedEndpoints,
      });
      toast.success('Endpoints updated successfully');
      await loadGroup();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update endpoints';
      toast.error(errorMessage);
    }
  };

  const handleBulkRemoveConnectors = async () => {
    if (selectedConnectorMemberIds.length === 0) return;

    const confirmed = await confirm({
      title: 'Remove Connectors',
      description: `Are you sure you want to remove ${selectedConnectorMemberIds.length} connector${selectedConnectorMemberIds.length !== 1 ? 's' : ''} from this group?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

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

    const confirmed = await confirm({
      title: 'Delete Group',
      description: `Are you sure you want to delete the group "${group.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/groups')} className="w-fit">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{group?.name || 'Edit Group'}</h1>
            <p className="text-sm md:text-base text-muted-foreground">{group?.description || 'Manage group details and relationships'}</p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteGroup} className="w-full sm:w-auto">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Group
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
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
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Group Members</CardTitle>
                  <CardDescription>
                    {members.length} member{members.length !== 1 ? 's' : ''} in this group
                  </CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {selectedMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemoveMembers}
                      variant="destructive"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addUsersDropdownOpen} onOpenChange={setAddUsersDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" className="flex-1 sm:flex-none">
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleSelectAllAvailableUsers}
                              disabled={availableUsers.length === 0}
                              title={
                                availableUsersSelectionState === 'all'
                                  ? 'Deselect all'
                                  : availableUsersSelectionState === 'some'
                                  ? 'Select all'
                                  : 'Select all'
                              }
                            >
                              {availableUsersSelectionState === 'all' ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : availableUsersSelectionState === 'some' ? (
                                <MinusSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </Button>
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
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {memberSearch ? 'No matching members found' : 'No members in this group yet'}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden space-y-3">
                    {filteredMembers.map((member) => {
                      const displayName = member.display_name ||
                        `${member.first_name || ''} ${member.last_name || ''}`.trim() ||
                        member.email;
                      return (
                        <Card key={member.id} className="p-4">
                          <div className="flex items-stretch gap-3">
                            <Checkbox
                              checked={selectedMemberIds.includes(member.id)}
                              onCheckedChange={() => handleToggleMember(member.id)}
                              className="self-center"
                            />
                            <div className="flex-1 min-w-0 space-y-3 py-1 pr-4">
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex-1 min-w-[120px]">
                                  <div className="text-sm font-medium text-muted-foreground">Name</div>
                                  <div className="font-medium">{displayName}</div>
                                </div>
                                <div className="flex-1 min-w-[120px]">
                                  <div className="text-sm font-medium text-muted-foreground">Email</div>
                                  <div className="text-muted-foreground truncate">{member.email}</div>
                                </div>
                                <div className="w-auto">
                                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                                  {member.is_active ? (
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                      Inactive
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col w-12 -mr-4 -my-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRemoveMember(member.id)}
                                className="flex-1 rounded-none rounded-r-lg border-l border-r-0 border-y-0 border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
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
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Connectors Tab */}
        <TabsContent value="connectors" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Group Connectors</CardTitle>
                  <CardDescription>
                    {connectors.length} connector{connectors.length !== 1 ? 's' : ''} accessible to this group
                  </CardDescription>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {selectedConnectorMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemoveConnectors}
                      variant="destructive"
                      size="sm"
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedConnectorMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addConnectorsDropdownOpen} onOpenChange={setAddConnectorsDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" className="flex-1 sm:flex-none">
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
                              {selectedConnectorIds.length === 1 ? '1 selected' : 'Select one connector'}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={handleToggleSelectAllAvailableConnectors}
                              disabled={availableConnectors.length === 0}
                              title={
                                availableConnectorsSelectionState === 'all'
                                  ? 'Deselect all'
                                  : availableConnectorsSelectionState === 'some'
                                  ? 'Select all'
                                  : 'Select all'
                              }
                            >
                              {availableConnectorsSelectionState === 'all' ? (
                                <CheckSquare className="h-4 w-4" />
                              ) : availableConnectorsSelectionState === 'some' ? (
                                <MinusSquare className="h-4 w-4" />
                              ) : (
                                <Square className="h-4 w-4" />
                              )}
                            </Button>
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
                            Add Connector
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
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleToggleSelectAllConnectorMembers}
                  disabled={filteredConnectors.length === 0}
                  title={
                    connectorMemberSelectionState === 'all'
                      ? 'Deselect all'
                      : connectorMemberSelectionState === 'some'
                      ? 'Select all'
                      : 'Select all'
                  }
                >
                  {connectorMemberSelectionState === 'all' ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : connectorMemberSelectionState === 'some' ? (
                    <MinusSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {filteredConnectors.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {connectorMemberSearch ? 'No matching connectors found' : 'No connectors assigned to this group yet'}
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden space-y-3">
                    {filteredConnectors.map((connector) => {
                      const endpoints = connectorEndpoints[connector.organization_connector_id] || [];
                      const displayEndpoints = endpoints.slice(0, 2);
                      const remainingCount = Math.max(0, endpoints.length - 2);

                      return (
                        <Card
                          key={connector.id}
                          className="p-4 cursor-pointer hover:bg-muted/50"
                          onClick={() => handleEditConnectorEndpoints(connector.organization_connector_id)}
                        >
                          <div className="flex items-stretch gap-3">
                            <Checkbox
                              checked={selectedConnectorMemberIds.includes(connector.organization_connector_id)}
                              onCheckedChange={() => handleToggleConnectorMember(connector.organization_connector_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="self-center"
                            />
                            <div className="flex-1 min-w-0 space-y-3 py-1 pr-4">
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                <div className="flex-1 min-w-[120px]">
                                  <div className="text-sm font-medium text-muted-foreground">Name</div>
                                  <div className="font-medium">{connector.connector_name}</div>
                                </div>
                                <div className="flex-1 min-w-[120px]">
                                  <div className="text-sm font-medium text-muted-foreground">Key</div>
                                  <div className="text-sm text-muted-foreground">{connector.connector_key}</div>
                                </div>
                                <div className="w-auto">
                                  <div className="text-sm font-medium text-muted-foreground">Status</div>
                                  {connector.is_enabled ? (
                                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                      Enabled
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                      Disabled
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-muted-foreground mb-1">Authorized Endpoints</div>
                                {endpoints.length === 0 ? (
                                  <span className="text-xs text-muted-foreground italic">No endpoints</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {displayEndpoints.map((endpoint, idx) => (
                                      <code key={idx} className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {endpoint}
                                      </code>
                                    ))}
                                    {remainingCount > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{remainingCount} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col w-12 -mr-4 -my-4" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditConnectorEndpoints(connector.organization_connector_id);
                                }}
                                className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveConnector(connector.organization_connector_id);
                                }}
                                className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Key</TableHead>
                          <TableHead>Authorized Endpoints</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredConnectors.map((connector) => {
                          const endpoints = connectorEndpoints[connector.organization_connector_id] || [];
                          const displayEndpoints = endpoints.slice(0, 2);
                          const remainingCount = Math.max(0, endpoints.length - 2);

                          return (
                            <TableRow
                              key={connector.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => handleEditConnectorEndpoints(connector.organization_connector_id)}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedConnectorMemberIds.includes(connector.organization_connector_id)}
                                  onCheckedChange={() => handleToggleConnectorMember(connector.organization_connector_id)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">{connector.connector_name}</div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-muted-foreground">{connector.connector_key}</div>
                              </TableCell>
                              <TableCell>
                                {endpoints.length === 0 ? (
                                  <span className="text-xs text-muted-foreground italic">No endpoints</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1">
                                    {displayEndpoints.map((endpoint, idx) => (
                                      <code key={idx} className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {endpoint}
                                      </code>
                                    ))}
                                    {remainingCount > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{remainingCount} more
                                      </span>
                                    )}
                                  </div>
                                )}
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
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditConnectorEndpoints(connector.organization_connector_id);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveConnector(connector.organization_connector_id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Endpoint Selection Modal */}
      {currentConnectorForEndpoints && (
        <EndpointSelectionModal
          open={endpointModalOpen}
          onOpenChange={setEndpointModalOpen}
          availableEndpoints={currentConnectorForEndpoints.availableEndpoints}
          initialSelected={
            isAddingConnectors
              ? currentConnectorForEndpoints.availableEndpoints
              : connectorEndpoints[currentConnectorForEndpoints.id] || []
          }
          onConfirm={handleEndpointsConfirmed}
          title={
            isAddingConnectors
              ? `Select Endpoints for ${currentConnectorForEndpoints.name}`
              : `Edit Endpoints for ${currentConnectorForEndpoints.name}`
          }
          description={
            isAddingConnectors
              ? 'Select which endpoints this connector can access in this group. At least one endpoint must be selected.'
              : 'Update which endpoints this connector can access in this group.'
          }
        />
      )}
    </div>
  );
}
