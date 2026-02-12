'use client';

import { use, useEffect, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Trash2, UserPlus, Cable } from 'lucide-react';
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
  const [currentUserIds, setCurrentUserIds] = useState<string[]>([]);
  const [currentConnectorIds, setCurrentConnectorIds] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/groups');
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

      const userIds = groupUsersData.users.map(u => u.id);
      const connectorIds = groupConnectorsData.connectors.map(c => c.connector_id);

      setCurrentUserIds(userIds);
      setCurrentConnectorIds(connectorIds);
      setSelectedUsers(userIds);
      setSelectedConnectors(connectorIds);
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

      // Update group details
      await updateGroup(selectedOrgId, groupId, {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        is_active: formData.is_active,
      });

      // Calculate user changes
      const usersToAdd = selectedUsers.filter(id => !currentUserIds.includes(id));
      const usersToRemove = currentUserIds.filter(id => !selectedUsers.includes(id));

      // Calculate connector changes
      const connectorsToAdd = selectedConnectors.filter(id => !currentConnectorIds.includes(id));
      const connectorsToRemove = currentConnectorIds.filter(id => !selectedConnectors.includes(id));

      // Apply user changes
      await Promise.all([
        ...usersToAdd.map(userId => addUserToGroup(selectedOrgId, userId, groupId)),
        ...usersToRemove.map(userId => removeUserFromGroup(selectedOrgId, userId, groupId)),
      ]);

      // Apply connector changes
      await Promise.all([
        ...connectorsToAdd.map(connectorId =>
          addConnectorToGroup(selectedOrgId, groupId, {
            connector_id: connectorId,
            authorized_endpoints: [],
            is_enabled: true,
          })
        ),
        ...connectorsToRemove.map(connectorId => removeConnectorFromGroup(selectedOrgId, groupId, connectorId)),
      ]);

      toast.success('Group updated successfully');
      await loadGroup(); // Reload to refresh all tabs
    } catch (error: any) {
      toast.error(error.message || 'Failed to update group');
    } finally {
      setLoading(false);
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

      <Tabs defaultValue="details" className="w-full">
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
              <CardTitle>Group Members</CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? 's' : ''} in this group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No members in this group yet. Add members from the Details tab.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {member.display_name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
                            </div>
                            <div className="text-sm text-muted-foreground">{member.email}</div>
                          </div>
                        </TableCell>
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
                    ))}
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
              <CardTitle>Group Connectors</CardTitle>
              <CardDescription>
                {connectors.length} connector{connectors.length !== 1 ? 's' : ''} accessible to this group
              </CardDescription>
            </CardHeader>
            <CardContent>
              {connectors.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No connectors assigned to this group. Add connectors from the Details tab.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectors.map((connector) => (
                      <TableRow key={connector.id}>
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
