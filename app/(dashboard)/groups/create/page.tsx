'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { createGroup } from '@/lib/api/groups';
import { getUsers } from '@/lib/api/users';
import { getConnectors } from '@/lib/api/connectors';
import { addUserToGroup } from '@/lib/api/user-groups';
import { addConnectorToGroup } from '@/lib/api/group-connectors';
import type { User, OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { CreateGroupDto } from '@/types/api.types';

export default function CreateGroupPage() {
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [loading, setLoading] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [formData, setFormData] = useState<CreateGroupDto>({
    name: '',
    slug: '',
    description: '',
    is_active: true,
  });
  const [users, setUsers] = useState<User[]>([]);
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedConnectors, setSelectedConnectors] = useState<string[]>([]);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/groups');
      return;
    }
    loadData();
  }, [isOrgAdminView, selectedOrgId, router]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    try {
      const [usersData, connectorsData] = await Promise.all([
        getUsers(selectedOrgId),
        getConnectors(selectedOrgId),
      ]);
      setUsers(usersData.users);
      setConnectors(connectorsData.connectors);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load data');
    }
  };

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManuallyEdited && formData.name) {
      const autoSlug = formData.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
        .trim();

      setFormData(prev => ({ ...prev, slug: autoSlug }));
    }
  }, [formData.name, slugManuallyEdited]);

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
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
      const group = await createGroup(selectedOrgId, formData);

      // Assign selected users to the group
      if (selectedUsers.length > 0) {
        await Promise.all(
          selectedUsers.map(userId =>
            addUserToGroup(selectedOrgId, userId, group.id)
          )
        );
      }

      // Assign selected connectors to the group
      if (selectedConnectors.length > 0) {
        await Promise.all(
          selectedConnectors.map(connectorId =>
            addConnectorToGroup(selectedOrgId, group.id, {
              connector_id: connectorId,
              authorized_endpoints: [],
              is_enabled: true,
            })
          )
        );
      }

      toast.success('Group created successfully');
      router.push('/groups');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  if (!isOrgAdminView() || !selectedOrgId) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Group</h1>
          <p className="text-muted-foreground">Add a new group to the organization</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Group Details</CardTitle>
          <CardDescription>Enter the information for the new group</CardDescription>
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
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setSlugManuallyEdited(false);
                  }}
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

              {/* Users Selection */}
              <div className="space-y-2">
                <Label>Assign Users (Optional)</Label>
                <div className="rounded-lg border p-4 max-h-64 overflow-y-auto">
                  {users.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users available</p>
                  ) : (
                    <div className="space-y-3">
                      {users.map((user) => (
                        <div key={user.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`user-${user.id}`}
                            checked={selectedUsers.includes(user.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedUsers([...selectedUsers, user.id]);
                              } else {
                                setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                              }
                            }}
                          />
                          <label
                            htmlFor={`user-${user.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email}
                            <span className="text-muted-foreground ml-2">({user.email})</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Connectors Selection */}
              <div className="space-y-2">
                <Label>Assign Connectors (Optional)</Label>
                <div className="rounded-lg border p-4 max-h-64 overflow-y-auto">
                  {connectors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No connectors available</p>
                  ) : (
                    <div className="space-y-3">
                      {connectors.map((connector) => (
                        <div key={connector.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`connector-${connector.id}`}
                            checked={selectedConnectors.includes(connector.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedConnectors([...selectedConnectors, connector.id]);
                              } else {
                                setSelectedConnectors(selectedConnectors.filter(id => id !== connector.id));
                              }
                            }}
                          />
                          <label
                            htmlFor={`connector-${connector.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {connector.connector_name}
                            <span className="text-muted-foreground ml-2">({connector.connector_key})</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedConnectors.length} connector{selectedConnectors.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Group'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
