'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getGroup, deleteGroup } from '@/lib/api/groups';
import { getGroupUsers, removeUserFromGroup } from '@/lib/api/user-groups';
import { getGroupConnectors, removeConnectorFromGroup } from '@/lib/api/group-connectors';
import type { Group, GroupConnector } from '@/types/api.types';
import type { UserMembership } from '@/lib/api/user-groups';
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
import { ArrowLeft, Pencil, Trash2, UserPlus, Cable } from 'lucide-react';
import { toast } from 'sonner';

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<UserMembership[]>([]);
  const [connectors, setConnectors] = useState<GroupConnector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/groups');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, groupId]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const [groupData, membersData, connectorsData] = await Promise.all([
        getGroup(selectedOrgId, groupId),
        getGroupUsers(selectedOrgId, groupId),
        getGroupConnectors(selectedOrgId, groupId),
      ]);
      setGroup(groupData);
      setMembers(membersData.users);
      setConnectors(connectorsData.connectors);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load group details';
      toast.error(errorMessage);
      router.push('/groups');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this user from the group?')) return;

    try {
      await removeUserFromGroup(selectedOrgId, userId, groupId);
      toast.success('User removed from group');
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove user';
      toast.error(errorMessage);
    }
  };

  const handleRemoveConnector = async (connectorId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this connector from the group?')) return;

    try {
      await removeConnectorFromGroup(selectedOrgId, groupId, connectorId);
      toast.success('Connector removed from group');
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove connector';
      toast.error(errorMessage);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to delete the group "${group?.name}"? This action cannot be undone.`)) return;

    try {
      await deleteGroup(selectedOrgId, groupId);
      toast.success('Group deleted successfully');
      router.push('/groups');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete group';
      toast.error(errorMessage);
    }
  };

  if (loading || !group) {
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
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/groups')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{group.name}</h1>
            <p className="text-muted-foreground">{group.description || 'Group details'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/groups/${groupId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDeleteGroup}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Members Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  {members.length} member{members.length !== 1 ? 's' : ''} in this group
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => router.push('/users')}>
                <UserPlus className="mr-2 h-4 w-4" />
                Manage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No members in this group yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {member.display_name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
                          </div>
                          <div className="text-sm text-muted-foreground">{member.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Connectors Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Connectors</CardTitle>
                <CardDescription>
                  {connectors.length} connector{connectors.length !== 1 ? 's' : ''} accessible
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => router.push('/connectors')}>
                <Cable className="mr-2 h-4 w-4" />
                Manage
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {connectors.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No connectors assigned to this group
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connector</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connectors.map((connector) => (
                    <TableRow key={connector.id}>
                      <TableCell className="font-medium">{connector.connector_name}</TableCell>
                      <TableCell>
                        {connector.is_enabled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                            Disabled
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveConnector(connector.connector_id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
