'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getAdministrators, deleteAdministrator } from '@/lib/api/administrators';
import { Administrator } from '@/types/api.types';
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
import { Plus, Shield, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function AdministratorsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin } = useAuthStore();
  const { isSuperAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !isSuperAdmin() || !isSuperAdminView()) {
      router.push('/users');
      return;
    }

    loadAdministrators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  const loadAdministrators = async () => {
    try {
      setLoading(true);
      const data = await getAdministrators();
      setAdministrators(data.administrators);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrators');
      toast.error('Failed to load administrators');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (adminId: string, email: string) => {
    const confirmed = await confirm({
      title: 'Delete Administrator',
      description: `Are you sure you want to delete administrator "${email}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteAdministrator(adminId);
      toast.success('Administrator deleted successfully');
      loadAdministrators();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete administrator');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={loadAdministrators} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Administrators</h1>
          <p className="text-muted-foreground">
            Manage administrator users and their access levels
          </p>
        </div>
        <Button onClick={() => router.push('/administrators/create')}>
          <Plus className="mr-2 h-4 w-4" />
          Create Administrator
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Administrators</CardTitle>
          <CardDescription>
            {administrators.length} administrator{administrators.length !== 1 ? 's' : ''} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {administrators.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No administrators found. Create your first administrator to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned Organizations</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {administrators.map((adm) => (
                  <TableRow
                    key={adm.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/administrators/${adm.id}/edit`)}
                  >
                    <TableCell className="font-medium">{adm.email}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                          adm.role === 'super_admin'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-secondary/10 text-secondary'
                        }`}
                      >
                        {adm.role === 'super_admin' && <Shield className="h-3 w-3" />}
                        {adm.role === 'super_admin' ? 'Super Admin' : 'Org Admin'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {adm.role === 'super_admin' ? (
                        <span className="text-muted-foreground">All</span>
                      ) : (
                        <span className="text-sm">
                          {adm.assigned_organizations.length} org
                          {adm.assigned_organizations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {adm.last_login_at
                        ? new Date(adm.last_login_at).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/administrators/${adm.id}/edit`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(adm.id, adm.email);
                          }}
                          disabled={adm.id === admin?.id}
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
