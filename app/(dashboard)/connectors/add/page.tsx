'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnectors as getBaseCatalog } from '@/lib/api/connectors-base';
import { createConnector } from '@/lib/api/connectors';
import type { Connector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Database, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BrowseConnectorsPage() {
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [publicConnectors, setPublicConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingConnectorId, setAddingConnectorId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/connectors');
      return;
    }

    loadPublicConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrgAdminView, selectedOrgId]);

  const loadPublicConnectors = async () => {
    try {
      setLoading(true);
      const { connectors } = await getBaseCatalog();
      // Filter for public connectors only
      const publicOnly = connectors.filter(c => c.is_public && c.is_active);
      setPublicConnectors(publicOnly);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleAddConnector = async (connector: Connector) => {
    if (!selectedOrgId) return;

    try {
      setAddingConnectorId(connector.id);
      // Create connector with minimal config - user will configure it on the edit page
      const newConnector = await createConnector(selectedOrgId, {
        connector_id: connector.id,
        config: {},
        is_enabled: true,
      });

      toast.success('Connector added successfully');
      // Navigate to edit page for full configuration
      router.push(`/connectors/${newConnector.id}/edit`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to add connector');
      setAddingConnectorId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading connectors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Browse Public Connectors</h1>
          <p className="text-muted-foreground">Add connectors to your organization</p>
        </div>
      </div>

      {publicConnectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No public connectors available</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {publicConnectors.map((connector) => (
            <Card key={connector.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {connector.icon_url ? (
                      <img
                        src={connector.icon_url}
                        alt={connector.name}
                        className="h-10 w-10 rounded"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                        <Database className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">{connector.name}</CardTitle>
                      <code className="text-xs text-muted-foreground">{connector.key}</code>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <CardDescription className="flex-1">
                  {connector.description || 'No description available'}
                </CardDescription>

                {connector.available_endpoints && connector.available_endpoints.length > 0 && (
                  <div className="mt-4 mb-4">
                    <p className="text-sm font-medium mb-2">Available Endpoints:</p>
                    <div className="flex flex-wrap gap-1">
                      {connector.available_endpoints.slice(0, 3).map((endpoint) => (
                        <span
                          key={endpoint}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs font-medium"
                        >
                          {endpoint}
                        </span>
                      ))}
                      {connector.available_endpoints.length > 3 && (
                        <span className="inline-flex items-center rounded-full bg-secondary px-2 py-1 text-xs font-medium">
                          +{connector.available_endpoints.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 mt-4">
                  <Button
                    className="flex-1"
                    onClick={() => handleAddConnector(connector)}
                    disabled={addingConnectorId === connector.id}
                  >
                    {addingConnectorId === connector.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      'Add to Organization'
                    )}
                  </Button>
                  {connector.documentation_url && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(connector.documentation_url!, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
