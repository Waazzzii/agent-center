'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getOrganizations } from '@/lib/api/organizations';
import { Organization } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Building2, Plus, Settings, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteOrganization } from '@/lib/api/organizations';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function OrganizationsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { switchToOrgAdminView, isSuperAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }

    loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

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
    router.push('/hitl');
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Delete Organization',
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Organizations</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {isSuperAdmin() && isSuperAdminView()
              ? 'Manage all organizations in the system'
              : 'Select an organization to manage'}
          </p>
        </div>
        {isSuperAdmin() && isSuperAdminView() && (
          <Button onClick={() => router.push('/organizations/create')} className="w-full sm:w-auto">
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
          <ResponsiveTable
            data={organizations}
            getRowKey={(org) => org.id}
            onRowClick={(org) => {
              if (isSuperAdmin() && isSuperAdminView()) {
                router.push(`/organizations/${org.id}/edit`);
              } else {
                handleManageOrg(org);
              }
            }}
            emptyMessage="No organizations found. Create your first organization to get started."
            columns={[
              {
                key: 'name',
                label: 'Name',
                render: (org) => <span className="font-medium">{org.name}</span>,
              },
              {
                key: 'slug',
                label: 'Slug',
                render: (org) => (
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{org.slug}</code>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (org) => (
                  org.is_active ? (
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
                key: 'created',
                label: 'Created',
                render: (org) => new Date(org.created_at).toLocaleDateString(),
              },
              {
                key: 'actions',
                label: 'Actions',
                desktopRender: (org) => (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleManageOrg(org);
                      }}
                    >
                      <Building2 className="h-4 w-4" />
                    </Button>
                    {isSuperAdmin() && isSuperAdminView() && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/organizations/${org.id}/edit`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(org.id, org.name);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                ),
                render: (org) => (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleManageOrg(org);
                      }}
                      className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                    >
                      <Building2 className="h-4 w-4" />
                    </Button>
                    {isSuperAdmin() && isSuperAdminView() && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/organizations/${org.id}/edit`);
                          }}
                          className="flex-1 rounded-none border-r-0 border-l hover:bg-muted/80"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(org.id, org.name);
                          }}
                          className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
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
