'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { usePermission } from '@/lib/hooks/use-permission';
import { getConnectors, deleteConnector } from '@/lib/api/connectors';
import { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

export default function ConnectorsPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('connectors_read');
  const canCreate = usePermission('connectors_create');
  const canUpdate = usePermission('connectors_update');
  const canDelete = usePermission('connectors_delete');
  const { confirm } = useConfirmDialog();
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  useEffect(() => {
    if (selectedOrgId) {
      loadConnectors();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadConnectors = async () => {
    if (!selectedOrgId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getConnectors(selectedOrgId);
      setConnectors(data.connectors);
    } catch (err: any) {
      setError(err.message || 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (connectorId: string) => {
    if (!selectedOrgId) return;

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
      await loadConnectors();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete connector');
    }
  };

  if (!admin || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Connectors</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage connector configurations for organizations</p>
        </div>
        <Button disabled={!selectedOrgId || !canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined} onClick={() => router.push('/connectors/add')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Browse Connectors
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No organization selected. Please select an organization from the header.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {error && (
            <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-destructive">{error}</p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Connectors</CardTitle>
              <CardDescription>
                {connectors.length} connector{connectors.length !== 1 ? 's' : ''} configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                data={connectors}
                getRowKey={(connector) => connector.id}
                onRowClick={(connector) => router.push(`/connectors/${connector.id}/edit`)}
                emptyMessage="No connectors configured for this organization."
                columns={[
                  {
                    key: 'name',
                    label: 'Connector ID',
                    mobileLabel: 'Connector',
                    render: (connector) => (
                      <span className="font-medium">{connector.connector_name}</span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (connector) => (
                      connector.is_enabled ? (
                        <Badge variant="default">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary">Disabled</Badge>
                      )
                    ),
                  },
                  {
                    key: 'created',
                    label: 'Created',
                    render: (connector) => new Date(connector.created_at).toLocaleDateString(),
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    desktopRender: (connector) => (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canUpdate}
                          title={!canUpdate ? "You don't have permission to perform this action" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/connectors/${connector.id}/edit`);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!canDelete}
                          title={!canDelete ? "You don't have permission to perform this action" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(connector.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ),
                    render: (connector) => (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canUpdate}
                          title={!canUpdate ? "You don't have permission to perform this action" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/connectors/${connector.id}/edit`);
                          }}
                          className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canDelete}
                          title={!canDelete ? "You don't have permission to perform this action" : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(connector.id);
                          }}
                          className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
