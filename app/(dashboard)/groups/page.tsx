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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';

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
  }, [admin, router]);

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
      alert(err.message || 'Failed to delete group');
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
          <h1 className="text-3xl font-bold">Groups</h1>
          <p className="text-muted-foreground">Manage user groups within organizations</p>
        </div>
        <Button disabled={!selectedOrgId} onClick={() => setCreateModalOpen(true)}>
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
              {groups.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No groups found in this organization.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group) => (
                      <TableRow
                        key={group.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/groups/${group.id}/edit`)}
                      >
                        <TableCell className="font-medium">
                          {group.name}
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-muted px-2 py-0.5 text-xs">{group.slug}</code>
                        </TableCell>
                        <TableCell className="max-w-md truncate text-muted-foreground">
                          {group.description || '—'}
                        </TableCell>
                        <TableCell>
                          {group.is_active ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                              Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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
