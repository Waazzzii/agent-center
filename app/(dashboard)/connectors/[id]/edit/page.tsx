'use client';

import { use, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnector, updateConnector, deleteConnector } from '@/lib/api/connectors';
import { getConnector as getBaseConnector } from '@/lib/api/connectors-base';
import { getGroups } from '@/lib/api/groups';
import { getGroupConnectors, addConnectorToGroup, updateGroupConnector, removeConnectorFromGroup } from '@/lib/api/group-connectors';
import type { UpdateConnectorConfigDto, Group, Connector, OrganizationConnector } from '@/types/api.types';
import { DynamicConnectorForm } from '@/components/dynamic-connector-form';
import { EndpointSelectionModal } from '@/components/endpoint-selection-modal';
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
import { ArrowLeft, Trash2, Users, Search, Plus, CheckSquare, Square, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connector, setConnector] = useState<OrganizationConnector | null>(null);
  const [baseConnector, setBaseConnector] = useState<Connector | null>(null);
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
  const [groupsWithAccess, setGroupsWithAccess] = useState<Group[]>([]);
  const [groupEndpoints, setGroupEndpoints] = useState<Record<string, string[]>>({});

  // Groups tab state
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]); // For add dropdown
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]); // For bulk remove
  const [addGroupsDropdownOpen, setAddGroupsDropdownOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const [activeTab, setActiveTab] = useState('configuration');

  // Endpoint selection modal state
  const [showEndpointModal, setShowEndpointModal] = useState(false);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupEndpoints, setEditingGroupEndpoints] = useState<string[]>([]);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
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

      setConnector(connectorData);

      // Fetch base connector to check for schema
      let baseConnectorData: Connector | null = null;
      try {
        baseConnectorData = await getBaseConnector(connectorData.connector_id);
        setBaseConnector(baseConnectorData);
      } catch (error) {
        console.error('Failed to load base connector:', error);
        // Continue without schema if base connector fetch fails
      }

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

      // Check which groups have access to this connector and fetch their endpoints
      const groupAccessChecks = await Promise.all(
        allGroupsData.groups.map(async (group) => {
          try {
            const groupConnectorsData = await getGroupConnectors(selectedOrgId, group.id);
            const groupConnector = groupConnectorsData.connectors.find(
              (gc) => gc.organization_connector_id === connectorId
            );
            return {
              group,
              hasAccess: !!groupConnector,
              endpoints: groupConnector?.authorized_endpoints || [],
            };
          } catch {
            return { group, hasAccess: false, endpoints: [] };
          }
        })
      );

      const groupsWithAccessList = groupAccessChecks
        .filter((item) => item.hasAccess)
        .map((item) => item.group);
      setGroupsWithAccess(groupsWithAccessList);

      // Store endpoints for each group
      const endpointsMap: Record<string, string[]> = {};
      groupAccessChecks.forEach((item) => {
        if (item.hasAccess) {
          endpointsMap[item.group.id] = item.endpoints;
        }
      });
      setGroupEndpoints(endpointsMap);
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

      // Update connector configuration only
      await updateConnector(selectedOrgId, connectorId, {
        config: parsedConfig,
        secrets: formData.updateSecrets ? parsedSecrets : undefined,
        is_enabled: formData.is_enabled,
      });

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

    const confirmed = await confirm({
      title: 'Remove Group Access',
      description: 'Are you sure you want to remove this group\'s access to the connector?',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await removeConnectorFromGroup(selectedOrgId, groupId, connectorId);
      toast.success('Group access removed');
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove group';
      toast.error(errorMessage);
    }
  };

  const handleAddGroups = async (groupIds: string[], authorizedEndpoints: string[]) => {
    if (!selectedOrgId) return;
    try {
      await Promise.all(
        groupIds.map(groupId =>
          addConnectorToGroup(selectedOrgId, groupId, {
            organization_connector_id: connectorId,
            authorized_endpoints: authorizedEndpoints,
            is_enabled: true,
          })
        )
      );
      toast.success(`${groupIds.length} group${groupIds.length !== 1 ? 's' : ''} added`);
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to add groups';
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleDeleteConnector = async () => {
    if (!selectedOrgId || !connectorInfo) return;

    const confirmed = await confirm({
      title: 'Delete Connector',
      description: 'Are you sure you want to delete this connector? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteConnector(selectedOrgId, connectorId);
      toast.success('Connector deleted successfully');
      router.push('/connectors');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete connector';
      toast.error(errorMessage);
    }
  };

  // Available groups (not currently assigned) for add dropdown
  const availableGroups = useMemo(() => {
    const accessGroupIds = new Set(groupsWithAccess.map(g => g.id));
    const query = groupSearch.toLowerCase().trim();

    return allGroups
      .filter(group => !accessGroupIds.has(group.id))
      .filter(group => {
        if (!query) return true;
        return group.name.toLowerCase().includes(query) || group.slug.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allGroups, groupsWithAccess, groupSearch]);

  // Current groups filtered by search
  const filteredMembers = useMemo(() => {
    const query = memberSearch.toLowerCase().trim();
    return groupsWithAccess
      .filter(group => {
        if (!query) return true;
        return group.name.toLowerCase().includes(query) || group.slug.toLowerCase().includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupsWithAccess, memberSearch]);

  // Group handlers
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

  const handleSelectAllAvailableGroups = () => {
    setSelectedGroupIds(availableGroups.map(g => g.id));
  };

  const handleDeselectAllAvailableGroups = () => {
    setSelectedGroupIds([]);
  };

  const handleSelectAllMembers = () => {
    setSelectedMemberIds(filteredMembers.map(g => g.id));
  };

  const handleDeselectAllMembers = () => {
    setSelectedMemberIds([]);
  };

  const handleAddSelectedGroups = () => {
    if (selectedGroupIds.length === 0) return;
    // Show endpoint selection modal instead of immediately adding
    setPendingGroupIds(selectedGroupIds);
    setShowEndpointModal(true);
  };

  const handleEndpointsConfirmed = async (selectedEndpoints: string[]) => {
    if (editingGroupId) {
      // Editing existing group's endpoints
      await handleUpdateGroupEndpoints(editingGroupId, selectedEndpoints);
    } else {
      // Adding new groups with endpoints
      try {
        await handleAddGroups(pendingGroupIds, selectedEndpoints);
        setSelectedGroupIds([]);
        setGroupSearch('');
        setAddGroupsDropdownOpen(false);
        setPendingGroupIds([]);
      } catch {
        // Error already handled by handleAddGroups
      }
    }
    setEditingGroupId(null);
    setEditingGroupEndpoints([]);
  };

  const handleEditGroupEndpoints = async (groupId: string) => {
    if (!selectedOrgId) return;

    // Fetch current endpoints for this group
    try {
      const groupConnectorsData = await getGroupConnectors(selectedOrgId, groupId);
      const groupConnector = groupConnectorsData.connectors.find(
        (gc) => gc.organization_connector_id === connectorId
      );

      if (groupConnector) {
        setEditingGroupId(groupId);
        setEditingGroupEndpoints(groupConnector.authorized_endpoints || []);
        setShowEndpointModal(true);
      }
    } catch (error: any) {
      toast.error('Failed to load group endpoints');
    }
  };

  const handleUpdateGroupEndpoints = async (groupId: string, authorizedEndpoints: string[]) => {
    if (!selectedOrgId) return;
    try {
      await updateGroupConnector(selectedOrgId, groupId, connectorId, {
        authorized_endpoints: authorizedEndpoints,
      });
      toast.success('Endpoints updated successfully');
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update endpoints';
      toast.error(errorMessage);
    }
  };

  const handleBulkRemoveGroups = async () => {
    if (selectedMemberIds.length === 0) return;

    const confirmed = await confirm({
      title: 'Remove Group Access',
      description: `Are you sure you want to remove access for ${selectedMemberIds.length} group${selectedMemberIds.length !== 1 ? 's' : ''}?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    if (!selectedOrgId) return;
    try {
      await Promise.all(selectedMemberIds.map(groupId => removeConnectorFromGroup(selectedOrgId, groupId, connectorId)));
      toast.success(`${selectedMemberIds.length} group${selectedMemberIds.length !== 1 ? 's' : ''} removed`);
      setSelectedMemberIds([]);
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove groups';
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="groups">Groups ({groupsWithAccess.length})</TabsTrigger>
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
              {baseConnector?.configuration_schema && connector ? (
                // Dynamic form based on schema
                <div className="space-y-6">
                  <DynamicConnectorForm
                    key={`${connectorId}-${connector.updated_at}`}
                    schema={baseConnector.configuration_schema}
                    initialValues={connector.configuration}
                    existingSecrets={connector.secret_info?.secret_fields || []}
                    maskedSecrets={connector.secret_info?.masked_values || {}}
                    onSubmit={async (config, secrets) => {
                      if (!selectedOrgId) return;
                      setLoading(true);
                      try {
                        await updateConnector(selectedOrgId, connectorId, {
                          config,
                          secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
                          is_enabled: connector.is_enabled,
                        });
                        toast.success('Connector updated successfully');
                        await loadConnector();
                      } catch (error: any) {
                        toast.error(error.message || 'Failed to update connector');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    loading={loading}
                  />

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <Label htmlFor="is_enabled" className="text-base">Enable Connector</Label>
                      <p className="text-sm text-muted-foreground">
                        Connector will be active and ready to use
                      </p>
                    </div>
                    <Switch
                      id="is_enabled"
                      checked={connector.is_enabled}
                      onCheckedChange={async (checked) => {
                        if (!selectedOrgId) return;
                        try {
                          await updateConnector(selectedOrgId, connectorId, {
                            is_enabled: checked,
                          });
                          toast.success('Connector status updated');
                          await loadConnector();
                        } catch (error: any) {
                          toast.error(error.message || 'Failed to update connector');
                        }
                      }}
                    />
                  </div>
                </div>
              ) : (
                // Fallback to JSON textarea if no schema exists
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Groups with Access</CardTitle>
                  <CardDescription>
                    {groupsWithAccess.length} group{groupsWithAccess.length !== 1 ? 's' : ''} can access this connector
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {selectedMemberIds.length > 0 && (
                    <Button
                      onClick={handleBulkRemoveGroups}
                      variant="destructive"
                      size="sm"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Selected ({selectedMemberIds.length})
                    </Button>
                  )}
                  <Popover open={addGroupsDropdownOpen} onOpenChange={setAddGroupsDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Groups
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 p-0" align="end">
                      <div className="flex flex-col max-h-[500px]">
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
                                onClick={handleSelectAllAvailableGroups}
                                disabled={availableGroups.length === 0}
                              >
                                <CheckSquare className="h-4 w-4 mr-1" />
                                All
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDeselectAllAvailableGroups}
                                disabled={selectedGroupIds.length === 0}
                              >
                                <Square className="h-4 w-4 mr-1" />
                                None
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                          {availableGroups.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">
                              {groupSearch ? 'No matching groups found' : 'All groups already have access'}
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
                        <div className="p-3 border-t">
                          <Button
                            onClick={handleAddSelectedGroups}
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
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search groups..."
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
                  {memberSearch ? 'No matching groups found' : 'No groups have access to this connector yet'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Authorized Endpoints</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((group) => {
                      const endpoints = groupEndpoints[group.id] || [];
                      const displayEndpoints = endpoints.slice(0, 2);
                      const remainingCount = endpoints.length - displayEndpoints.length;

                      return (
                        <TableRow
                          key={group.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleEditGroupEndpoints(group.id)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedMemberIds.includes(group.id)}
                              onCheckedChange={() => handleToggleMember(group.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {group.description || '—'}
                          </TableCell>
                          <TableCell>
                            {endpoints.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">No endpoints</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {displayEndpoints.map((endpoint, idx) => (
                                  <code
                                    key={idx}
                                    className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs"
                                  >
                                    {endpoint}
                                  </code>
                                ))}
                                {remainingCount > 0 && (
                                  <span className="text-xs text-muted-foreground self-center">
                                    +{remainingCount} more
                                  </span>
                                )}
                              </div>
                            )}
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
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditGroupEndpoints(group.id);
                                }}
                                title="Edit Endpoints"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveGroup(group.id);
                                }}
                                title="Remove Group"
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Endpoint Selection Modal */}
      <EndpointSelectionModal
        open={showEndpointModal}
        onOpenChange={setShowEndpointModal}
        availableEndpoints={baseConnector?.available_endpoints || []}
        initialSelected={editingGroupId ? editingGroupEndpoints : []}
        onConfirm={handleEndpointsConfirmed}
        title={editingGroupId ? 'Edit Endpoint Access' : 'Configure Endpoint Access'}
        description={
          editingGroupId
            ? 'Select which endpoints this group can access. At least one endpoint must be selected.'
            : `Select which endpoints the selected ${pendingGroupIds.length} group${pendingGroupIds.length !== 1 ? 's' : ''} can access. At least one endpoint must be selected.`
        }
      />
    </div>
  );
}
