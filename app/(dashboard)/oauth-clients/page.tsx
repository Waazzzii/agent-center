'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { usePermission } from '@/lib/hooks/use-permission';
import { getOAuthClients, deleteOAuthClient } from '@/lib/api/oauth-clients';
import { getOrganizations } from '@/lib/api/organizations';
import { OAuthClient, Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trash2, Plus, Edit, Info } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

const DEFAULT_REFRESH_EXPIRY_SECONDS = 86400; // 24h server default

function formatRefreshTTL(seconds: number | null): string {
  const s = seconds ?? DEFAULT_REFRESH_EXPIRY_SECONDS;
  if (s >= 86400 && s % 86400 === 0) return `${s / 86400}d`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600}h`;
  return `${s}s`;
}

export default function OAuthClientsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('oauth_clients_read');
  const canCreate = usePermission('oauth_clients_create');
  const canUpdate = usePermission('oauth_clients_update');
  const canDelete = usePermission('oauth_clients_delete');
  const { confirm } = useConfirmDialog();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [organizations, setOrganizations] = useState<Map<string, Organization>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = !isSuperAdmin();

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, selectedOrgId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [clientsData, orgsData] = await Promise.all([
        getOAuthClients(),
        getOrganizations(),
      ]);

      // Always filter to the selected org when one is set
      let filteredClients = clientsData.clients;
      if (selectedOrgId) {
        filteredClients = clientsData.clients.filter(
          client => client.organization_id === selectedOrgId
        );
      }

      setClients(filteredClients);
      const orgMap = new Map<string, Organization>();
      orgsData.organizations.forEach((org) => orgMap.set(org.id, org));
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
      description: `Are you sure you want to delete "${name}"? This cannot be undone.`,
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

  const getOrganizationName = (orgId: string | null): string => {
    if (!orgId) return '—';
    const org = organizations.get(orgId);
    return org ? org.name : `${orgId.substring(0, 8)}…`;
  };

  if (!admin || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">OAuth Clients</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {isReadOnly
              ? 'View OAuth 2.0 clients for your organization'
              : 'Manage OAuth 2.0 clients — Connectors (Claude / MCP) and Platform clients (Admin UI, KB Portal)'
            }
          </p>
        </div>
        {!isReadOnly && (
          <Button disabled={!canCreate} title={!canCreate ? "You don't have permission to perform this action" : undefined} onClick={() => router.push('/oauth-clients/create')} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Add OAuth Client
          </Button>
        )}
      </div>

      {isReadOnly ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            These OAuth clients are issued and managed by Wazzi for your organization.
            They are used to authenticate connectors (Claude/MCP integrations) and platform applications.
            Contact your super administrator if you need to create or modify OAuth clients.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Connector</strong> clients are confidential (client_secret + PKCE) and scoped to an
            organization — used for Claude / MCP integrations. Recommended refresh token TTL: <strong>7 days</strong>.
            <br />
            <strong>Platform</strong> clients are public (PKCE only, no secret) — used for the Admin UI and
            KB Portal. Recommended refresh token TTL: <strong>24 hours</strong>.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-destructive">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OAuth Clients</CardTitle>
          <CardDescription>
            {clients.length} client{clients.length !== 1 ? 's' : ''} configured
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            data={clients}
            getRowKey={(client) => client.client_id}
            onRowClick={isReadOnly ? undefined : (client) => router.push(`/oauth-clients/${client.client_id}/edit`)}
            emptyMessage={isReadOnly ? "No OAuth clients found for your organization." : "No OAuth clients configured. Create your first client to get started."}
            columns={[
              {
                key: 'name',
                label: 'Name',
                render: (client) => (
                  <div>
                    <div className="font-medium">{client.client_name}</div>
                    {client.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{client.description}</div>
                    )}
                  </div>
                ),
              },
              {
                key: 'type',
                label: 'Type',
                render: (client) => (
                  client.is_public ? (
                    <Badge variant="secondary">Platform</Badge>
                  ) : (
                    <Badge variant="outline">Connector</Badge>
                  )
                ),
              },
              {
                key: 'client_id',
                label: 'Client ID',
                render: (client) => (
                  <span className="font-mono text-xs break-all">{client.client_id}</span>
                ),
              },
              {
                key: 'organization',
                label: 'Organization',
                render: (client) => (
                  <span className="text-sm">{getOrganizationName(client.organization_id)}</span>
                ),
              },
              {
                key: 'refresh_ttl',
                label: 'Refresh TTL',
                render: (client) => (
                  <span className="text-sm text-muted-foreground">
                    {formatRefreshTTL(client.refresh_token_expiry_seconds)}
                  </span>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (client) => (
                  client.is_active ? (
                    <Badge variant="default">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )
                ),
              },
              ...(!isReadOnly ? [{
                key: 'actions',
                label: 'Actions',
                desktopRender: (client: OAuthClient) => (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canUpdate}
                      title={!canUpdate ? "You don't have permission to perform this action" : undefined}
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
                      disabled={!canDelete}
                      title={!canDelete ? "You don't have permission to perform this action" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(client.client_id, client.client_name);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ),
                render: (client: OAuthClient) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canUpdate}
                      title={!canUpdate ? "You don't have permission to perform this action" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/oauth-clients/${client.client_id}/edit`);
                      }}
                      className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canDelete}
                      title={!canDelete ? "You don't have permission to perform this action" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(client.client_id, client.client_name);
                      }}
                      className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                ),
              }] : []),
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
