'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { getConnector, updateConnector, deleteConnector, checkConnectorHealth } from '@/lib/api/connectors';
import { getConnector as getBaseConnector } from '@/lib/api/connectors-base';
import { getAccessGroups } from '@/lib/api/access-groups';
import { getAccessDefinitions } from '@/lib/api/permissions';
import { getDataSourceConfigs } from '@/lib/api/data-source-configs';
import type { Connector, OrganizationConnector, AccessGroup, PermissionDefinition, DataSourceConfig } from '@/types/api.types';
import { DynamicConnectorForm } from '@/components/dynamic-connector-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ExternalLink, Trash2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { TokenHealthStatusDisplay } from '@/components/token-health-status';
import type { TokenHealthStatus } from '@/types/api.types';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function EditConnectorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const permitted = useRequirePermission('admin_connectors');
  const [loading, setLoading] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [connector, setConnector] = useState<OrganizationConnector | null>(null);
  const [agItems, setAgItems] = useState<{ group: AccessGroup; enabledLabels: string[] }[]>([]);
  const [agLoading, setAgLoading] = useState(false);
  const [assignedCategories, setAssignedCategories] = useState<DataSourceConfig[]>([]);
  const [dscLoading, setDscLoading] = useState(false);
  const [baseConnector, setBaseConnector] = useState<Connector | null>(null);
  const [connectorInfo, setConnectorInfo] = useState<{
    connector_name: string;
    connector_key: string;
  } | null>(null);

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
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load connector';
      toast.error(errorMessage);
      router.push('/connectors');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    if (!selectedOrgId) return;
    setHealthChecking(true);
    try {
      const updated = await checkConnectorHealth(selectedOrgId, connectorId);
      setConnector(updated);
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Health check failed');
    } finally {
      setHealthChecking(false);
    }
  };

  const loadConnectorAccessGroups = async () => {
    if (!selectedOrgId || !connector) return;
    setAgLoading(true);
    setDscLoading(true);
    try {
      const [{ access_groups: groups }, definitions, allConfigs] = await Promise.all([
        getAccessGroups(selectedOrgId),
        getAccessDefinitions(selectedOrgId),
        getDataSourceConfigs(selectedOrgId),
      ]);

      const connectorDefs = definitions.filter((d: PermissionDefinition) => d.category === 'Connector');

      const items = groups
        .map((group: AccessGroup) => {
          const enabledLabels = connectorDefs
            .filter((d: PermissionDefinition) => group.access?.[d.key] === true)
            .map((d: PermissionDefinition) => d.label);
          return { group, enabledLabels };
        })
        .filter((item) => item.enabledLabels.length > 0);

      setAgItems(items);
      setAssignedCategories(allConfigs.filter((c) => c.org_connector_id === connectorId));
    } catch {
      toast.error('Failed to load access data');
    } finally {
      setAgLoading(false);
      setDscLoading(false);
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

  const schema = baseConnector?.configuration_schema;

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
            <h1 className="text-3xl font-bold">{connectorInfo?.connector_name || 'Edit Connector'}</h1>
            <p className="text-muted-foreground">
              {connectorInfo?.connector_key || 'Connector configuration'}
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={handleDeleteConnector} className="w-full sm:w-auto">
          <Trash2 className="mr-2 h-4 w-4" />
          Remove
        </Button>
      </div>

      <Tabs defaultValue="configuration" className="max-w-2xl" onValueChange={(v) => {
        if (v === 'access') loadConnectorAccessGroups();
      }}>
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
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
          {/* Connection status bar */}
          <div className="mb-3">
            {connector?.secret_info?.health_status === 'healthy' ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 px-4 py-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <span className="font-medium text-green-800 dark:text-green-200">Connected</span>
              </div>
            ) : connector?.secret_info?.health_status === 'renewal_failed' ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 px-4 py-3 text-sm">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                <span className="font-medium text-red-800 dark:text-red-200">Connection failed</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30 shrink-0" />
                <span className="text-muted-foreground">Not yet verified</span>
              </div>
            )}
          </div>

          {/* Token health — compact notification, only for connectors with expiring tokens */}
          {connector?.secret_info?.expires_at && (
            <div className="mb-6">
              <TokenHealthStatusDisplay
                healthStatus={connector.secret_info.health_status as TokenHealthStatus}
                expiresAt={connector.secret_info.expires_at}
                lastRenewedAt={connector.secret_info.last_renewed_at}
              />
            </div>
          )}
          {!connector?.secret_info?.expires_at && <div className="mb-6" />}

          {schema && schema.fields.length > 0 && connector ? (
            <DynamicConnectorForm
              key={`${connectorId}-${connector.updated_at}`}
              schema={schema}
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
              onSubmit={async (config, secrets) => {
                if (!selectedOrgId) return;
                setLoading(true);
                try {
                  await updateConnector(selectedOrgId, connectorId, {
                    config,
                    secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
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
              onHealthCheck={handleHealthCheck}
              healthChecking={healthChecking}
            />
          ) : (
            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                disabled={healthChecking}
                onClick={handleHealthCheck}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${healthChecking ? 'animate-spin' : ''}`} />
                {healthChecking ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">

          {/* ── MCP ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">MCP</CardTitle>
                  <CardDescription>
                    Expose this connector as a tool via the Model Context Protocol.
                  </CardDescription>
                </div>
                {connector?.mcp_enabled ? (
                  <Button
                    variant="destructive"
                    size="sm"

                    className="shrink-0"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Disable MCP?',
                        description: 'This connector will no longer be available as an MCP tool. Existing access group configuration will be preserved and can be re-enabled at any time.',
                        confirmText: 'Disable',
                        variant: 'destructive',
                      });
                      if (!confirmed) return;
                      setConnector((prev) => prev ? { ...prev, mcp_enabled: false } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { mcp_enabled: false });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, mcp_enabled: true } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!connector}
                    className="shrink-0"
                    onClick={async () => {
                      setConnector((prev) => prev ? { ...prev, mcp_enabled: true } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { mcp_enabled: true });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, mcp_enabled: false } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </CardHeader>
            {connector?.mcp_enabled && (
              <CardContent className="space-y-3">
                {agLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : agItems.length > 0 ? (
                  <div className="divide-y rounded-lg border">
                    {agItems.map(({ group }) => (
                      <div key={group.id} className="flex items-center justify-between px-4 py-2.5 gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{group.name}</span>
                          {group.description && (
                            <p className="text-xs text-muted-foreground truncate">{group.description}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" asChild className="flex-shrink-0 h-7">
                          <Link href={`/access-groups/${group.id}?category=Connector - ${connector?.connector_name}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Manage
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No access groups include this connector yet.</p>
                )}
                {agItems.length === 0 && !agLoading && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/access-groups">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Manage Access Groups
                    </Link>
                  </Button>
                )}
              </CardContent>
            )}
          </Card>

          {/* ── Agent ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">Agent</CardTitle>
                  <CardDescription>
                    Allow AI agents to call this connector during workflow execution.
                  </CardDescription>
                </div>
                {connector?.agent_enabled ? (
                  <Button
                    variant="destructive"
                    size="sm"

                    className="shrink-0"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Disable Agent Access?',
                        description: 'AI agents will no longer be able to call this connector. No configuration will be removed.',
                        confirmText: 'Disable',
                        variant: 'destructive',
                      });
                      if (!confirmed) return;
                      setConnector((prev) => prev ? { ...prev, agent_enabled: false } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { agent_enabled: false });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, agent_enabled: true } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!connector}
                    className="shrink-0"
                    onClick={async () => {
                      setConnector((prev) => prev ? { ...prev, agent_enabled: true } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { agent_enabled: true });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, agent_enabled: false } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* ── Centers ── */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">Centers</CardTitle>
                  <CardDescription>
                    Allow this connector to supply data for Centers imports.
                  </CardDescription>
                </div>
                {connector?.centers_enabled ? (
                  <Button
                    variant="destructive"
                    size="sm"

                    className="shrink-0"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: 'Disable Centers?',
                        description: 'This connector will no longer supply data for Centers imports. Existing data source configurations will be preserved and can be re-enabled at any time.',
                        confirmText: 'Disable',
                        variant: 'destructive',
                      });
                      if (!confirmed) return;
                      setConnector((prev) => prev ? { ...prev, centers_enabled: false } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { centers_enabled: false });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, centers_enabled: true } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!connector}
                    className="shrink-0"
                    onClick={async () => {
                      setConnector((prev) => prev ? { ...prev, centers_enabled: true } : prev);
                      try {
                        await updateConnector(selectedOrgId!, connectorId, { centers_enabled: true });
                      } catch (err: any) {
                        setConnector((prev) => prev ? { ...prev, centers_enabled: false } : prev);
                        toast.error(err.response?.data?.message || err.message || 'Failed to update');
                      }
                    }}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </CardHeader>
            {connector?.centers_enabled && (
              <CardContent className="space-y-3">
                {dscLoading ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : assignedCategories.length > 0 ? (
                  <div className="divide-y rounded-lg border">
                    {assignedCategories.map((cfg) => (
                      <div key={cfg.key} className="flex items-center justify-between px-4 py-2.5 gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium">{cfg.label}</span>
                          {cfg.description && (
                            <p className="text-xs text-muted-foreground truncate">{cfg.description}</p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" asChild className="flex-shrink-0 h-7">
                          <Link href="/centers/data-sources">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Manage
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No categories assigned yet.</p>
                )}
                {assignedCategories.length === 0 && !dscLoading && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/centers/data-sources">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Manage Centers Data Sources
                    </Link>
                  </Button>
                )}
              </CardContent>
            )}
          </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
