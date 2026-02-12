'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnectors, deleteConnector } from '@/lib/api/connectors';
import { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Pencil } from 'lucide-react';

export default function ConnectorsPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }
  }, [admin, router]);

  useEffect(() => {
    if (selectedOrgId) {
      loadConnectors();
    }
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
    if (!confirm('Are you sure you want to delete this connector?')) return;

    try {
      await deleteConnector(selectedOrgId, connectorId);
      await loadConnectors();
    } catch (err: any) {
      alert(err.message || 'Failed to delete connector');
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

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connectors</h1>
          <p className="text-muted-foreground">Manage connector configurations for organizations</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => router.push('/connectors/add')}>
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
              {connectors.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No connectors configured for this organization.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Has Secrets</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectors.map((connector) => (
                      <TableRow
                        key={connector.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/connectors/${connector.id}/edit`)}
                      >
                        <TableCell className="font-medium">
                          {connector.connector_name}
                        </TableCell>
                        <TableCell>
                          {connector.is_enabled ? (
                            <Badge variant="default">Enabled</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {connector.secret_info?.has_secrets ? (
                            <Badge variant="outline">Yes</Badge>
                          ) : (
                            <Badge variant="outline">No</Badge>
                          )}
                        </TableCell>
                        <TableCell>{new Date(connector.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(connector.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
