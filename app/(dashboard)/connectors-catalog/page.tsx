'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnectors, deleteConnector } from '@/lib/api/connectors-base';
import { Connector } from '@/types/api.types';
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
import { Plus, Edit, Trash2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function ConnectorsCatalogPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { isSuperAdminView } = useAdminViewStore();
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
  }, [admin, router, isSuperAdmin, isSuperAdminView]);

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
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

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
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Connectors Catalog</h1>
          <p className="text-muted-foreground">Manage available connectors in the system</p>
        </div>
        <Button onClick={() => router.push('/connectors-catalog/create')}>
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
          {connectors.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No connectors found. Add your first connector to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connectors.map((connector) => (
                  <TableRow key={connector.id}>
                    <TableCell className="font-medium">{connector.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{connector.key}</code>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {connector.description || '—'}
                    </TableCell>
                    <TableCell>
                      {connector.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {connector.is_public ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          Public
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
                          Private
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {connector.documentation_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(connector.documentation_url!, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/connectors-catalog/${connector.id}/edit`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(connector.id, connector.name)}
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
