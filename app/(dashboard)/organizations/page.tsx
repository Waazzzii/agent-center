'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getOrganizations } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
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
import { Building2, Plus, Settings, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteOrganization } from '@/lib/api/organizations';

export default function OrganizationsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { switchToOrgAdminView, isSuperAdminView } = useAdminViewStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }

    loadOrganizations();
  }, [admin, router]);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const data = await getOrganizations();
      setOrganizations(data.organizations);
    } catch (err: any) {
      setError(err.message || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleManageOrg = (org: Organization) => {
    switchToOrgAdminView(org.id, org.name);
    router.push('/users');
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteOrganization(id);
      toast.success('Organization deleted successfully');
      loadOrganizations();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete organization');
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
          <Button onClick={loadOrganizations} className="mt-4">
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
          <h1 className="text-3xl font-bold">Organizations</h1>
          <p className="text-muted-foreground">
            {isSuperAdmin() && isSuperAdminView()
              ? 'Manage all organizations in the system'
              : 'Select an organization to manage'}
          </p>
        </div>
        {isSuperAdmin() && isSuperAdminView() && (
          <Button onClick={() => router.push('/organizations/create')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Organizations</CardTitle>
          <CardDescription>
            {organizations.length} organization{organizations.length !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organizations.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No organizations found. Create your first organization to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{org.slug}</code>
                    </TableCell>
                    <TableCell>
                      {org.is_active ? (
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
                      {org.groups_enabled ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                          Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                          Disabled
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{new Date(org.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageOrg(org)}
                        >
                          <Building2 className="mr-2 h-4 w-4" />
                          Manage
                        </Button>
                        {isSuperAdmin() && isSuperAdminView() && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => router.push(`/organizations/${org.id}/edit`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(org.id, org.name)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
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
