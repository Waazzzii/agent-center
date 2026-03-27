'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import { getConnectors as getBaseCatalog } from '@/lib/api/connectors-base';
import { getConnectors, createConnector, deleteConnector } from '@/lib/api/connectors';
import type { Connector, OrganizationConnector } from '@/types/api.types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import {
  ExternalLink,
  Loader2,
  Plug,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';

export default function ConnectorsPage() {
  const router = useRouter();
  const { selectedOrgId, selectedOrgName, isOrgAdminView } = useAdminViewStore();
  const { confirm } = useConfirmDialog();
  const permitted = useRequirePermission('admin_connectors');

  const [catalogConnectors, setCatalogConnectors] = useState<Connector[]>([]);
  const [orgConnectors, setOrgConnectors] = useState<OrganizationConnector[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOrgAdminView() || !selectedOrgId) { router.push('/organizations'); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  const loadAll = async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const [catalogData, orgData] = await Promise.all([
        getBaseCatalog(),
        getConnectors(selectedOrgId),
      ]);
      setCatalogConnectors(catalogData.connectors.filter((c) => c.is_public && c.is_active));
      setOrgConnectors(orgData.connectors);
    } catch {
      toast.error('Failed to load connectors');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (connector: Connector) => {
    if (!selectedOrgId) return;
    setAddingId(connector.id);
    try {
      const newConn = await createConnector(selectedOrgId, {
        connector_id: connector.id,
        config: {},
        is_enabled: true,
      });
      toast.success(`${connector.name} added`);
      router.push(`/connectors/${newConn.id}/edit`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add connector');
      setAddingId(null);
    }
  };

  const handleRemove = async (orgConn: OrganizationConnector) => {
    if (!selectedOrgId) return;
    const confirmed = await confirm({
      title: 'Remove Connector',
      description: `Remove ${orgConn.connector_name} from this organization? All configuration will be deleted and this cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setRemovingId(orgConn.id);
    try {
      await deleteConnector(selectedOrgId, orgConn.id);
      setOrgConnectors((prev) => prev.filter((c) => c.id !== orgConn.id));
      toast.success('Connector removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove connector');
    } finally {
      setRemovingId(null);
    }
  };

  if (!permitted) return <NoPermissionContent />;

  // Build lookup: catalog connector id → org connector instance
  const orgByBase: Record<string, OrganizationConnector> = {};
  for (const oc of orgConnectors) orgByBase[oc.connector_id] = oc;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Connectors</h1>
        <p className="text-muted-foreground">
          Browse and manage connectors available to {selectedOrgName ?? 'your organization'}.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : catalogConnectors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Plug className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No connectors available.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalogConnectors.map((connector) => {
            const orgConn = orgByBase[connector.id];
            const isAdded = Boolean(orgConn);
            const isEnabled = isAdded && orgConn.is_enabled;
            const isMcp = isAdded && orgConn.mcp_enabled === true;
            const isAgent = isAdded && orgConn.agent_enabled === true;
            const isCenters = isAdded && orgConn.centers_enabled === true;
            const isAdding = addingId === connector.id;
            const isRemoving = isAdded && removingId === orgConn.id;

            return (
              <Card key={connector.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {connector.icon_url ? (
                        <img
                          src={connector.icon_url}
                          alt={connector.name}
                          className="h-9 w-9 rounded shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <Plug className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <CardTitle className="text-base leading-tight">{connector.name}</CardTitle>
                    </div>
                    {connector.documentation_url && (
                      <a
                        href={connector.documentation_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {connector.description && (
                    <CardDescription className="mt-1 line-clamp-2">
                      {connector.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="flex-1 flex flex-col justify-end gap-0 pt-0">
                  {isAdded ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border divide-y text-sm">
                        <StatusRow label="MCP" active={isMcp} />
                        <StatusRow label="Agent" active={isAgent} />
                        <StatusRow label="Centers" active={isCenters} />
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/connectors/${orgConn.id}/edit`} className="w-1/2">
                          <Button variant="outline" size="sm" className="w-full">Configure</Button>
                        </Link>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-1/2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                          disabled={isRemoving}
                          onClick={() => handleRemove(orgConn)}
                        >
                          {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Remove'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="w-1/2"
                        disabled={isAdding}
                        onClick={() => handleAdd(connector)}
                      >
                        {isAdding ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /></>
                        ) : (
                          'Add'
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Status row ─────────────────────────────────────────────────────────────────

function StatusRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border',
          active
            ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
            : 'border-border bg-muted/50 text-muted-foreground',
        ].join(' ')}
      >
        {active ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 shrink-0 opacity-40" />
        )}
        {active ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  );
}
