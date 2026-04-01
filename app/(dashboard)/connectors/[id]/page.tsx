'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnector, deleteConnector } from '@/lib/api/connectors';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { TokenHealthStatusDisplay } from '@/components/token-health-status';

export default function ConnectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [connector, setConnector] = useState<OrganizationConnector | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/connectors');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, connectorId]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const connectorData = await getConnector(selectedOrgId, connectorId);
      setConnector(connectorData);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load connector details';
      toast.error(errorMessage);
      router.push('/connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConnector = async () => {
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
      toast.success('Connector deleted successfully');
      router.push('/connectors');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete connector';
      toast.error(errorMessage);
    }
  };

  if (loading || !connector) {
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
            <h1 className="text-3xl font-bold">{connector.connector_name}</h1>
            <p className="text-muted-foreground">Connector configuration</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/connectors/${connectorId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDeleteConnector}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connector Details</CardTitle>
          <CardDescription>Configuration and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connector.secret_info?.health_status && (
            <TokenHealthStatusDisplay
              healthStatus={connector.secret_info.health_status}
              expiresAt={connector.secret_info.expires_at}
              lastRenewedAt={connector.secret_info.last_renewed_at}
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Connection</div>
              <div className="mt-1">
                {connector.secret_info?.health_status === 'healthy' ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    Connected
                  </span>
                ) : connector.secret_info?.health_status === 'renewal_failed' ? (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                    Failed
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                    Unknown
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Has Secrets</div>
              <div className="mt-1">{connector.secret_info?.secret_fields && connector.secret_info.secret_fields.length > 0 ? 'Yes' : 'No'}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Created</div>
              <div className="mt-1">{new Date(connector.created_at).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
              <div className="mt-1">{new Date(connector.updated_at).toLocaleString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
