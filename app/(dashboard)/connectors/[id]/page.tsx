'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getConnector, deleteConnector } from '@/lib/api/connectors';
import { getGroups } from '@/lib/api/groups';
import { getGroupConnectors, removeConnectorFromGroup } from '@/lib/api/group-connectors';
import type { Group, OrganizationConnector } from '@/types/api.types';
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
import { ArrowLeft, Pencil, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

interface GroupWithConnectorAccess extends Group {
  hasAccess: boolean;
}

export default function ConnectorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: connectorId } = use(params);
  const router = useRouter();
  const { selectedOrgId, isOrgAdminView } = useAdminViewStore();
  const [connector, setConnector] = useState<OrganizationConnector | null>(null);
  const [groups, setGroups] = useState<GroupWithConnectorAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) {
      toast.error('Please select an organization first');
      router.push('/connectors');
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId, connectorId]);

  const loadData = async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);

      // Load connector details
      const connectorData = await getConnector(selectedOrgId, connectorId);
      setConnector(connectorData);

      // Load all groups and check which have access to this connector
      const groupsData = await getGroups(selectedOrgId);
      const groupsWithAccess: GroupWithConnectorAccess[] = await Promise.all(
        groupsData.groups.map(async (group) => {
          try {
            const groupConnectorsData = await getGroupConnectors(selectedOrgId, group.id);
            const hasAccess = groupConnectorsData.connectors.some(
              (gc) => gc.organization_connector_id === connectorId
            );
            return { ...group, hasAccess };
          } catch (error) {
            return { ...group, hasAccess: false };
          }
        })
      );

      setGroups(groupsWithAccess);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load connector details';
      toast.error(errorMessage);
      router.push('/connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    if (!selectedOrgId) return;
    if (!confirm('Are you sure you want to remove this group\'s access to the connector?')) return;

    try {
      await removeConnectorFromGroup(selectedOrgId, groupId, connectorId);
      toast.success('Group access removed');
      await loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to remove group';
      toast.error(errorMessage);
    }
  };

  const handleDeleteConnector = async () => {
    if (!selectedOrgId) return;
    if (!confirm(`Are you sure you want to delete this connector? This action cannot be undone.`)) return;

    try {
      await deleteConnector(selectedOrgId, connectorId);
      toast.success('Connector deleted successfully');
      router.push('/connectors');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to delete connector';
      toast.error(errorMessage);
    }
  };

  if (loading || !connector) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const groupsWithAccess = groups.filter(g => g.hasAccess);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/connectors')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{connector.connector_name}</h1>
            <p className="text-muted-foreground">Connector configuration</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/connectors/${connectorId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDeleteConnector}>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Connector Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Connector Details</CardTitle>
            <CardDescription>Configuration and status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Status</div>
                <div className="mt-1">
                  {connector.is_enabled ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                      Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
                      Disabled
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Has Secrets</div>
                <div className="mt-1">{connector.secret_info?.secret_fields && connector.secret_info.secret_fields.length > 0 ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Created</div>
                <div className="mt-1">{new Date(connector.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Last Updated</div>
                <div className="mt-1">{new Date(connector.updated_at).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Groups with Access Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Groups with Access</CardTitle>
                <CardDescription>
                  {groupsWithAccess.length} group{groupsWithAccess.length !== 1 ? 's' : ''} can access this connector
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => router.push('/groups')}>
                <Users className="mr-2 h-4 w-4" />
                Manage Groups
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {groupsWithAccess.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No groups have access to this connector yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupsWithAccess.map((group) => (
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/connectors/${connectorId}/edit`)}
                    >
                      <TableCell className="font-medium">{group.name}</TableCell>
                      <TableCell className="text-muted-foreground">
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
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveGroup(group.id);
                          }}
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
