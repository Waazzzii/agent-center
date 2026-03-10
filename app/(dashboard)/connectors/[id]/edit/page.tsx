'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { usePermission } from '@/lib/hooks/use-permission';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { getConnector, updateConnector, deleteConnector } from '@/lib/api/connectors';
import { getConnector as getBaseConnector } from '@/lib/api/connectors-base';
import { getAccessGroups } from '@/lib/api/access-groups';
import { getAccessDefinitions } from '@/lib/api/permissions';
import type { UpdateConnectorConfigDto, Connector, OrganizationConnector, AccessGroup, PermissionDefinition } from '@/types/api.types';
import { DynamicConnectorForm } from '@/components/dynamic-connector-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const permitted = useRequirePermission('connectors_read');
  const canUpdate = usePermission('connectors_update');
  const canDelete = usePermission('connectors_delete');
  const canReadAccessGroups = usePermission('access_groups_read');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connector, setConnector] = useState<OrganizationConnector | null>(null);
  const [agItems, setAgItems] = useState<{ group: AccessGroup; enabledLabels: string[] }[]>([]);
  const [agLoading, setAgLoading] = useState(false);
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

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId || !permitted) {
      return;
    }

    loadConnector();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, connectorId, permitted]);

  const loadConnector = async () => {
    if (!selectedOrgId) return;

    try {
      setInitialLoading(true);
      const connectorData = await getConnector(selectedOrgId, connectorId);

      setConnector(connectorData);

      // Fetch base connector to check for schema
      try {
        const baseConnectorData = await getBaseConnector(connectorData.connector_id);
        setBaseConnector(baseConnectorData);
      } catch (error) {
        console.error('Failed to load base connector:', error);
      }

      setConnectorInfo({
        connector_name: connectorData.connector_name,
        connector_key: connectorData.connector_key,
      });
      setFormData({
        configuration: JSON.stringify(connectorData.configuration || {}, null, 2),
        secrets: '',
        is_enabled: connectorData.is_enabled,
        updateSecrets: false,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load connector';
      toast.error(errorMessage);
      router.push('/connectors');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadConnectorAccessGroups = async () => {
    if (!selectedOrgId || !connector) return;
    try {
      setAgLoading(true);
      const [{ access_groups: groups }, definitions] = await Promise.all([
        getAccessGroups(selectedOrgId),
        getAccessDefinitions(selectedOrgId),
      ]);

      const connectorCategory = `Connector - ${connector.connector_name}`;
      const connectorDefs = definitions.filter((d: PermissionDefinition) => d.category === connectorCategory);

      const items = groups
        .map((group: AccessGroup) => {
          const enabledLabels = connectorDefs
            .filter((d: PermissionDefinition) => group.access?.[d.key] === true)
            .map((d: PermissionDefinition) => d.label);
          return { group, enabledLabels };
        })
        .filter((item) => item.enabledLabels.length > 0);

      setAgItems(items);
    } catch {
      toast.error('Failed to load access groups');
    } finally {
      setAgLoading(false);
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

    if (formData.configuration.trim()) {
      try {
        parsedConfig = JSON.parse(formData.configuration);
      } catch (e) {
        toast.error('Invalid JSON in configuration');
        return;
      }
    }

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

      await updateConnector(selectedOrgId, connectorId, {
        config: parsedConfig,
        secrets: formData.updateSecrets ? parsedSecrets : undefined,
        is_enabled: formData.is_enabled,
      });

      toast.success('Connector updated successfully');
      await loadConnector();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to update connector';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
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
          <Button variant="ghost" size="sm" onClick={() => router.push('/connectors')} className="w-fit">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">{connectorInfo?.connector_name || 'Edit Connector'}</h1>
            <p className="text-sm md:text-base text-muted-foreground">
              {connectorInfo?.connector_key || 'Connector configuration'}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteConnector} disabled={!canDelete} className="w-full sm:w-auto">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Connector
        </Button>
      </div>

      <Tabs defaultValue="configuration" className="max-w-2xl" onValueChange={(v) => {
        if (v === 'access-groups' && canReadAccessGroups) loadConnectorAccessGroups();
      }}>
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="access-groups">Access Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration">
      <Card>
        <CardHeader>
          <CardTitle>Connector Configuration</CardTitle>
          <CardDescription>
            {connectorInfo?.connector_name} ({connectorInfo?.connector_key})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {baseConnector?.configuration_schema && connector ? (
            <div className="space-y-6">
              <DynamicConnectorForm
                key={`${connectorId}-${connector.updated_at}`}
                schema={baseConnector.configuration_schema}
                initialValues={connector.configuration}
                existingSecrets={connector.secret_info?.secret_fields || []}
                maskedSecrets={
                  connector.secret_info?.secret_fields.reduce((acc, fieldKey) => {
                    if (connector.configuration[fieldKey]) {
                      acc[fieldKey] = connector.configuration[fieldKey];
                    }
                    return acc;
                  }, {} as Record<string, string>) || {}
                }
                tokenHealthStatus={connector.secret_info?.health_status}
                tokenExpiresAt={connector.secret_info?.expires_at}
                tokenLastRenewedAt={connector.secret_info?.last_renewed_at}
                disabled={!canUpdate}
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
                    const errorMessage = error.response?.data?.message || error.message || 'Failed to update connector';
                    toast.error(errorMessage);
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
                  disabled={!canUpdate}
                  onCheckedChange={async (checked) => {
                    if (!selectedOrgId) return;
                    try {
                      await updateConnector(selectedOrgId, connectorId, {
                        is_enabled: checked,
                      });
                      toast.success('Connector status updated');
                      await loadConnector();
                    } catch (error: any) {
                      const errorMessage = error.response?.data?.message || error.message || 'Failed to update connector';
                      toast.error(errorMessage);
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {(() => {
                const hasExistingConfig = Object.keys(connector?.configuration || {}).length > 0;
                const hasExistingSecrets = (connector?.secret_info?.secret_fields || []).length > 0;
                return (
                  <div className="space-y-4">
                    {hasExistingConfig && (
                      <div className="space-y-2">
                        <Label htmlFor="configuration">Configuration (JSON)</Label>
                        <Textarea
                          id="configuration"
                          value={formData.configuration}
                          onChange={(e) => setFormData({ ...formData, configuration: e.target.value })}
                          placeholder='{"api_url": "https://api.example.com", "timeout": 30}'
                          rows={10}
                          className="font-mono text-sm"
                          disabled={!canUpdate}
                        />
                        <p className="text-sm text-muted-foreground">
                          Custom configuration as JSON object
                        </p>
                      </div>
                    )}

                    {hasExistingSecrets && (
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
                              disabled={!canUpdate}
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
                              disabled={!canUpdate}
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
                    )}
                  </div>
                );
              })()}

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
                  disabled={!canUpdate}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                />
              </div>

              <div className="flex gap-4">
                <Button type="submit" disabled={loading || !canUpdate}>
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

        <TabsContent value="access-groups">
          <Card>
            <CardHeader>
              <CardTitle>Access Groups</CardTitle>
              <CardDescription>
                Access groups that have endpoints enabled for this connector
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {agLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : agItems.length > 0 ? (
                <div className="divide-y rounded-lg border">
                  {agItems.map(({ group, enabledLabels }) => (
                    <div key={group.id} className="flex items-start justify-between px-4 py-3 gap-4">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div>
                          <p className="text-sm font-medium">{group.name}</p>
                          {group.description && (
                            <p className="text-xs text-muted-foreground">{group.description}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {enabledLabels.map((label) => (
                            <span
                              key={label}
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild className="flex-shrink-0">
                        <Link href={`/access-groups/${group.id}?category=Connector - ${connector?.connector_name}`}>
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Manage
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {!canReadAccessGroups ? (
                    <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
                      <span className="mt-0.5 text-yellow-600 dark:text-yellow-400">⚠</span>
                      <p className="text-sm text-yellow-800 dark:text-yellow-300">
                        You need access group view permission to see which groups include this connector.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This connector is not included in any access groups yet.
                    </p>
                  )}
                  {canReadAccessGroups && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href="/access-groups">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Manage Access Groups
                      </Link>
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
