'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnectors, deleteConnector } from '@/lib/api/connectors-base';
import { Connector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Plus, Edit, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function ConnectorsCatalogPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { isSuperAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }

    if (!isSuperAdmin() || !isSuperAdminView()) {
      router.push('/users');
      return;
    }

    loadConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const loadConnectors = async () => {
    try {
      setLoading(true);
      const data = await getConnectors();
      setConnectors(data.connectors);
    } catch (err: any) {
      setError(err.message || 'Failed to load connectors');
      toast.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete Connector',
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteConnector(id);
      toast.success('Connector deleted successfully');
      loadConnectors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete connector');
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

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={loadConnectors} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Connectors Catalog</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage available connectors in the system</p>
        </div>
        <Button onClick={() => router.push('/connectors-catalog/create')} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Connector
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Connectors</CardTitle>
          <CardDescription>
            {connectors.length} connector{connectors.length !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            data={connectors}
            getRowKey={(connector) => connector.id}
            onRowClick={(connector) => router.push(`/connectors-catalog/${connector.id}/edit`)}
            emptyMessage="No connectors found. Add your first connector to get started."
            columns={[
              {
                key: 'name',
                label: 'Name',
                render: (connector) => <span className="font-medium">{connector.name}</span>,
              },
              {
                key: 'key',
                label: 'Key',
                render: (connector) => (
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{connector.key}</code>
                ),
              },
              {
                key: 'description',
                label: 'Description',
                render: (connector) => (
                  <span className="text-muted-foreground line-clamp-2">
                    {connector.description || '—'}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (connector) => (
                  connector.is_active ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-1 text-xs font-medium text-green-800 dark:text-green-400">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-800 dark:text-gray-400">
                      Inactive
                    </span>
                  )
                ),
              },
              {
                key: 'visibility',
                label: 'Visibility',
                render: (connector) => (
                  connector.is_public ? (
                    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-1 text-xs font-medium text-blue-800 dark:text-blue-400">
                      Public
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-1 text-xs font-medium text-purple-800 dark:text-purple-400">
                      Private
                    </span>
                  )
                ),
              },
              {
                key: 'actions',
                label: 'Actions',
                desktopRender: (connector) => (
                  <div className="flex items-center justify-end gap-2">
                    {connector.documentation_url && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(connector.documentation_url!, '_blank');
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/connectors-catalog/${connector.id}/edit`);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(connector.id, connector.name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ),
                render: (connector) => (
                  <>
                    {connector.documentation_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(connector.documentation_url!, '_blank');
                        }}
                        className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/connectors-catalog/${connector.id}/edit`);
                      }}
                      className={`flex-1 rounded-none border-r-0 border-l hover:bg-muted/80 ${!connector.documentation_url ? 'rounded-tr-lg border-t-0' : ''}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(connector.id, connector.name);
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
    </div>
  );
}
