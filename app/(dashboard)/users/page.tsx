'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getUsers, deleteUser } from '@/lib/api/users';
import { User } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { CreateUserModal } from '@/components/users/create-user-modal';
import { DeleteUserDialog } from '@/components/users/delete-user-dialog';
import { toast } from 'sonner';

export default function UsersPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

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

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (reassignToUserId: string) => {
    if (!selectedOrgId || !userToDelete) return;

    const result = await deleteUser(selectedOrgId, userToDelete.id, reassignToUserId);

    // Show success message with reassignment stats
    const stats = result.reassigned;
    const statsMessage = [
      stats.kb_articles_authored > 0 && `${stats.kb_articles_authored} articles authored`,
      stats.kb_articles_reviewed > 0 && `${stats.kb_articles_reviewed} articles reviewed`,
      stats.kb_article_versions > 0 && `${stats.kb_article_versions} article versions`,
      stats.kb_media > 0 && `${stats.kb_media} media files`,
      stats.organization_connectors > 0 && `${stats.organization_connectors} connectors`,
    ]
      .filter(Boolean)
      .join(', ');

    if (statsMessage) {
      toast.success(`User deleted successfully. Reassigned: ${statsMessage}`);
    }

    await loadUsers();
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Users</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage users within organizations</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => setCreateModalOpen(true)} className="w-full sm:w-auto">
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
              <ResponsiveTable
                data={users}
                getRowKey={(user) => user.id}
                onRowClick={(user) => router.push(`/users/${user.id}/edit`)}
                emptyMessage="No users found in this organization."
                columns={[
                  {
                    key: 'name',
                    label: 'Name',
                    render: (user) => {
                      const displayName = user.display_name ||
                        (user.first_name || user.last_name
                          ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                          : user.email);
                      return <span className="font-medium">{displayName}</span>;
                    },
                  },
                  {
                    key: 'email',
                    label: 'Email',
                    render: (user) => user.email,
                  },
                  {
                    key: 'phone',
                    label: 'Phone',
                    render: (user) => <span className="text-muted-foreground">{user.phone || '—'}</span>,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (user) => (
                      user.is_active ? (
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
                    render: (user) => new Date(user.created_at).toLocaleDateString(),
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    mobileLabel: 'Actions',
                    desktopRender: (user) => (
                      <div className="flex items-center justify-end gap-2">
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
                            handleDeleteClick(user);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ),
                    render: (user) => (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/users/${user.id}/edit`);
                          }}
                          className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l hover:bg-muted/80"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(user);
                          }}
                          className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 hover:bg-destructive/10 hover:border-destructive"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}

      {selectedOrgId && (
        <>
          <CreateUserModal
            open={createModalOpen}
            onOpenChange={setCreateModalOpen}
            organizationId={selectedOrgId}
          />
          <DeleteUserDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            userToDelete={userToDelete}
            availableUsers={users}
            onConfirm={handleDeleteConfirm}
          />
        </>
      )}
    </div>
  );
}
