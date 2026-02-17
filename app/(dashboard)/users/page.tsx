'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getUsers, deleteUser } from '@/lib/api/users';
import { User } from '@/types/api.types';
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
import { Trash2, Plus, Pencil } from 'lucide-react';
import { CreateUserModal } from '@/components/users/create-user-modal';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

export default function UsersPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    if (!admin) {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  useEffect(() => {
    if (selectedOrgId) {
      loadUsers();
    }
  }, [selectedOrgId]);

  const loadUsers = async () => {
    if (!selectedOrgId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getUsers(selectedOrgId);
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!selectedOrgId) return;

    const confirmed = await confirm({
      title: 'Delete User',
      description: 'Are you sure you want to delete this user? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteUser(selectedOrgId, userId);
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
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
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage users within organizations</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => setCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
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
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {users.length} user{users.length !== 1 ? 's' : ''} in this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No users found in this organization.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const displayName = user.display_name ||
                        (user.first_name || user.last_name
                          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                          : user.email);

                      return (
                        <TableRow
                          key={user.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/users/${user.id}/edit`)}
                        >
                          <TableCell className="font-medium">{displayName}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {user.phone || '—'}
                          </TableCell>
                          <TableCell>
                            {user.is_active ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                                Inactive
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/users/${user.id}/edit`);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(user.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {selectedOrgId && (
        <CreateUserModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          organizationId={selectedOrgId}
        />
      )}
    </div>
  );
}
