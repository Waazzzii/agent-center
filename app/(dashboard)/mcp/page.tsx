'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getConnectors, updateConnector } from '@/lib/api/connectors';
import type { OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { Plug, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function McpPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const permitted = useRequirePermission('admin_connectors');

  const [connectors, setConnectors] = useState<OrganizationConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadConnectors = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const data = await getConnectors(selectedOrgId);
      setConnectors(data.connectors);
    } catch {
      toast.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (connector: OrganizationConnector, checked: boolean) => {
    if (!selectedOrgId) return;
    setToggling(connector.id);
    try {
      await updateConnector(selectedOrgId, connector.id, { mcp_enabled: checked });
      setConnectors((prev) =>
        prev.map((c) => c.id === connector.id ? { ...c, mcp_enabled: checked } : c)
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setToggling(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  const mcpCount = connectors.filter((c) => c.mcp_enabled).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">MCP</h1>
        <p className="text-muted-foreground">
          Control which connectors are available as tools via the Model Context Protocol for{' '}
          {selectedOrgName ?? 'your organization'}.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : connectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Plug className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No connectors added yet.</p>
            <Link href="/connectors">
              <Button variant="outline" size="sm" className="mt-1">
                Set up Connectors
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Connectors</CardTitle>
            <CardDescription>
              {mcpCount} of {connectors.length} connector
              {connectors.length !== 1 ? 's' : ''} enabled for MCP.{' '}
              Use the toggles to control MCP access. Manage endpoint permissions via Access Groups.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {connectors.map((connector) => (
                <div
                  key={connector.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{connector.connector_name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={connector.mcp_enabled ?? false}
                      disabled={toggling === connector.id}
                      onCheckedChange={(checked) => handleToggle(connector, checked)}
                      aria-label={`Enable MCP for ${connector.connector_name}`}
                    />
                    <Link href={`/connectors/${connector.id}/edit?tab=access`}>
                      <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-muted-foreground">
                        Access <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
