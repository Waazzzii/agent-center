'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { getOAuthClients, deleteOAuthClient } from '@/lib/api/oauth-clients';
import { getOrganizations } from '@/lib/api/organizations';
import { OAuthClient, Organization } from '@/types/api.types';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Plus, Edit, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function OAuthClientsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { confirm } = useConfirmDialog();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [organizations, setOrganizations] = useState<Map<string, Organization>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }

    // Redirect if not super admin
    if (!isSuperAdmin()) {
      router.push('/connectors');
      return;
    }

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load clients and organizations in parallel
      const [clientsData, orgsData] = await Promise.all([
        getOAuthClients(),
        getOrganizations(),
      ]);

      setClients(clientsData.clients);

      // Create a map of organization ID to organization for quick lookup
      const orgMap = new Map<string, Organization>();
      orgsData.organizations.forEach((org) => {
        orgMap.set(org.id, org);
      });
      setOrganizations(orgMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load OAuth clients');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (clientId: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete OAuth Client',
      description: `Are you sure you want to delete the OAuth client "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteOAuthClient(clientId);
      toast.success('OAuth client deleted successfully');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete OAuth client');
    }
  };

  const getOrganizationName = (orgId: string): string => {
    const org = organizations.get(orgId);
    return org ? org.name : `Unknown (${orgId.substring(0, 8)}...)`;
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
          <h1 className="text-3xl font-bold">OAuth Clients</h1>
          <p className="text-muted-foreground">
            Manage OAuth 2.0 clients for backend integration (Claude to Wazzi)
          </p>
        </div>
        <Button onClick={() => router.push('/oauth-clients/create')}>
          <Plus className="mr-2 h-4 w-4" />
          Add OAuth Client
        </Button>
      </div>

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Client secrets are only shown once during creation and cannot be retrieved later.
          Make sure to save them securely when creating new OAuth clients.
        </AlertDescription>
      </Alert>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OAuth Clients</CardTitle>
          <CardDescription>
            {clients.length} OAuth client{clients.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No OAuth clients configured. Create your first client to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Redirect URI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow
                    key={client.client_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/oauth-clients/${client.client_id}/edit`)}
                  >
                    <TableCell className="font-medium">{client.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{client.client_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getOrganizationName(client.organization_id)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs truncate text-xs text-muted-foreground">
                        {client.redirect_uri}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.is_active ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/oauth-clients/${client.client_id}/edit`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(client.client_id, client.client_name);
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
    </div>
  );
}
