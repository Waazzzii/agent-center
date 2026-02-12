'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnector, updateConnector, deleteConnector } from '@/lib/api/connectors';
import { getGroups } from '@/lib/api/groups';
import { getGroupConnectors, addConnectorToGroup, removeConnectorFromGroup } from '@/lib/api/group-connectors';
import type { UpdateConnectorConfigDto, Group } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ArrowLeft, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface GroupWithConnectorAccess extends Group {
  hasAccess: boolean;
}

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connectorInfo, setConnectorInfo] = useState<{
    connector_name: string;
    connector_key: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    configuration: '',
    secrets: '',
    is_enabled: true,
    updateSecrets: false,
  });
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [groupsWithAccess, setGroupsWithAccess] = useState<GroupWithConnectorAccess[]>([]);
  const [currentGroupIds, setCurrentGroupIds] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/connectors');
      return;
    }

    loadConnector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, connectorId]);

  const loadConnector = async () => {
    if (!selectedOrgId) return;

    try {
      setInitialLoading(true);
      const [connectorData, allGroupsData] = await Promise.all([
        getConnector(selectedOrgId, connectorId),
        getGroups(selectedOrgId),
      ]);

      setConnectorInfo({
        connector_name: connectorData.connector_name,
        connector_key: connectorData.connector_key,
      });
      setFormData({
        configuration: JSON.stringify(connectorData.configuration || {}, null, 2),
        secrets: '', // Don't load secrets for security
        is_enabled: connectorData.is_enabled,
        updateSecrets: false,
      });

      setAllGroups(allGroupsData.groups);

      // Check which groups have access to this connector
      const groupAccessChecks = await Promise.all(
        allGroupsData.groups.map(async (group) => {
          try {
            const groupConnectorsData = await getGroupConnectors(selectedOrgId, group.id);
            const hasAccess = groupConnectorsData.connectors.some(
              (gc) => gc.connector_id === connectorId
            );
            return { ...group, hasAccess };
          } catch {
            return { ...group, hasAccess: false };
          }
        })
      );

      setGroupsWithAccess(groupAccessChecks);
      const groupIds = groupAccessChecks.filter((g) => g.hasAccess).map((g) => g.id);
      setCurrentGroupIds(groupIds);
      setSelectedGroups(groupIds);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load connector');
      router.push('/connectors');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrgId) {
      toast.error('No organization selected');
      return;
    }

    let parsedConfig: Record<string, any> | undefined;
    let parsedSecrets: Record<string, string> | undefined;

    // Parse JSON configuration
    if (formData.configuration.trim()) {
      try {
        parsedConfig = JSON.parse(formData.configuration);
      } catch (e) {
        toast.error('Invalid JSON in configuration');
        return;
      }
    }

    // Parse JSON secrets if user wants to update them
    if (formData.updateSecrets && formData.secrets.trim()) {
      try {
        parsedSecrets = JSON.parse(formData.secrets);
      } catch (e) {
        toast.error('Invalid JSON in secrets');
        return;
      }
    }

    try {
      setLoading(true);

      // Update connector configuration
      await updateConnector(selectedOrgId, connectorId, {
        config: parsedConfig,
        secrets: formData.updateSecrets ? parsedSecrets : undefined,
        is_enabled: formData.is_enabled,
      });

      // Calculate group changes
      const groupsToAdd = selectedGroups.filter(id => !currentGroupIds.includes(id));
      const groupsToRemove = currentGroupIds.filter(id => !selectedGroups.includes(id));

      // Apply group changes
      await Promise.all([
        ...groupsToAdd.map(groupId =>
          addConnectorToGroup(selectedOrgId, groupId, {
            connector_id: connectorId,
            authorized_endpoints: [],
            is_enabled: true,
          })
        ),
        ...groupsToRemove.map(groupId => removeConnectorFromGroup(selectedOrgId, groupId, connectorId)),
      ]);

      toast.success('Connector updated successfully');
      await loadConnector(); // Reload to refresh tabs
    } catch (error: any) {
      toast.error(error.message || 'Failed to update connector');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this group\'s access to the connector?')) return;

    try {
      await removeConnectorFromGroup(selectedOrgId, groupId, connectorId);
      toast.success('Group access removed');
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove group';
      toast.error(errorMessage);
    }
  };

  const handleDeleteConnector = async () => {
    if (!selectedOrgId || !connectorInfo) return;
    if (!confirm(`Are you sure you want to delete this connector? This action cannot be undone.`)) return;

    try {
      await deleteConnector(selectedOrgId, connectorId);
      toast.success('Connector deleted successfully');
      router.push('/connectors');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete connector';
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

  const groupsWithAccessList = groupsWithAccess.filter(g => g.hasAccess);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/connectors')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{connectorInfo?.connector_name || 'Edit Connector'}</h1>
            <p className="text-muted-foreground">
              {connectorInfo?.connector_key || 'Connector configuration'}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteConnector}>
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Connector
        </Button>
      </div>

      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="groups">Groups ({groupsWithAccessList.length})</TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="mt-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Connector Configuration</CardTitle>
              <CardDescription>
                {connectorInfo?.connector_name} ({connectorInfo?.connector_key})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="configuration">Configuration (JSON)</Label>
                    <Textarea
                      id="configuration"
                      value={formData.configuration}
                      onChange={(e) => setFormData({ ...formData, configuration: e.target.value })}
                      placeholder='{"api_url": "https://api.example.com", "timeout": 30}'
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-sm text-muted-foreground">
                      Custom configuration as JSON object
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="secrets">Secrets (JSON)</Label>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="updateSecrets" className="text-sm font-normal cursor-pointer">
                          Update secrets
                        </Label>
                        <Switch
                          id="updateSecrets"
                          checked={formData.updateSecrets}
                          onCheckedChange={(checked) => setFormData({ ...formData, updateSecrets: checked })}
                        />
                      </div>
                    </div>
                    {formData.updateSecrets ? (
                      <>
                        <Textarea
                          id="secrets"
                          value={formData.secrets}
                          onChange={(e) => setFormData({ ...formData, secrets: e.target.value })}
                          placeholder='{"api_key": "your-key", "api_secret": "your-secret"}'
                          rows={8}
                          className="font-mono text-sm"
                        />
                        <p className="text-sm text-muted-foreground">
                          Enter new secrets as JSON object (will be encrypted)
                        </p>
                      </>
                    ) : (
                      <div className="rounded-lg border p-4 bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                          Secrets are hidden for security. Toggle "Update secrets" to change them.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_enabled" className="text-base">Enable Connector</Label>
                      <p className="text-sm text-muted-foreground">
                        Connector will be active and ready to use
                      </p>
                    </div>
                    <Switch
                      id="is_enabled"
                      checked={formData.is_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => router.push('/connectors')}>
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
              <CardTitle>Groups with Access</CardTitle>
              <CardDescription>
                {groupsWithAccessList.length} group{groupsWithAccessList.length !== 1 ? 's' : ''} can access this connector
              </CardDescription>
            </CardHeader>
            <CardContent>
              {groupsWithAccessList.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No groups have access to this connector yet. Add groups from the Configuration tab.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Group</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupsWithAccessList.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {group.description || '—'}
                        </TableCell>
                        <TableCell>
                          {group.is_active ? (
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
