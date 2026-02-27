'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getGroups, deleteGroup } from '@/lib/api/groups';
import { Group } from '@/types/api.types';
import { CreateGroupModal } from '@/components/groups/create-group-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

export default function GroupsPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const [groups, setGroups] = useState<Group[]>([]);
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
      loadGroups();
    }
  }, [selectedOrgId]);

  const loadGroups = async () => {
    if (!selectedOrgId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getGroups(selectedOrgId);
      setGroups(data.groups);
    } catch (err: any) {
      setError(err.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!selectedOrgId) return;

    const confirmed = await confirm({
      title: 'Delete Group',
      description: 'Are you sure you want to delete this group? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      await deleteGroup(selectedOrgId, groupId);
      await loadGroups();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete group');
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Groups</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage user groups within organizations</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => setCreateModalOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Group
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
              <CardTitle>Groups</CardTitle>
              <CardDescription>
                {groups.length} group{groups.length !== 1 ? 's' : ''} in this organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable
                data={groups}
                getRowKey={(group) => group.id}
                onRowClick={(group) => router.push(`/groups/${group.id}/edit`)}
                emptyMessage="No groups found in this organization."
                columns={[
                  {
                    key: 'name',
                    label: 'Name',
                    render: (group) => <span className="font-medium">{group.name}</span>,
                  },
                  {
                    key: 'slug',
                    label: 'Slug',
                    render: (group) => (
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{group.slug}</code>
                    ),
                  },
                  {
                    key: 'description',
                    label: 'Description',
                    render: (group) => (
                      <span className="text-muted-foreground line-clamp-2">
                        {group.description || '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (group) => (
                      group.is_active ? (
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
                    render: (group) => new Date(group.created_at).toLocaleDateString(),
                  },
                  {
                    key: 'actions',
                    label: 'Actions',
                    desktopRender: (group) => (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/groups/${group.id}/edit`);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(group.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ),
                    render: (group) => (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/groups/${group.id}/edit`);
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
                            handleDelete(group.id);
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

      {/* Create Group Modal */}
      {selectedOrgId && (
        <CreateGroupModal
          open={createModalOpen}
          onOpenChange={(open) => {
            setCreateModalOpen(open);
            if (!open) {
              // Reload groups when modal closes (in case one was created)
              loadGroups();
            }
          }}
          organizationId={selectedOrgId}
        />
      )}
    </div>
  );
}
