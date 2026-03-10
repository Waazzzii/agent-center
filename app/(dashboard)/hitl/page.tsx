'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getPendingHitl,
  approveHitl,
  denyHitl,
  type AgentHitlItem,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

type StatusFilter = 'pending' | 'approved' | 'denied' | 'all';

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

function statusBadge(status: string) {
  if (status === 'pending') return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Pending</Badge>;
  if (status === 'approved') return <Badge variant="default" className="bg-green-600">Approved</Badge>;
  if (status === 'denied') return <Badge variant="destructive">Denied</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function HitlPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('hitl_read');

  const [items, setItems] = useState<AgentHitlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});

  const loadItems = useCallback(async () => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getPendingHitl(selectedOrgId);
      setItems(data.items);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load HITL items');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (selectedOrgId) loadItems();
  }, [selectedOrgId, loadItems]);

  const handleDecide = async (itemId: string, decision: 'approve' | 'deny') => {
    if (!selectedOrgId) return;
    setDeciding((prev) => ({ ...prev, [itemId]: true }));
    try {
      if (decision === 'approve') {
        await approveHitl(selectedOrgId, itemId);
        toast.success('Approved — agent will continue execution');
      } else {
        await denyHitl(selectedOrgId, itemId);
        toast.success('Denied — execution stopped');
      }
      await loadItems();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Decision failed');
    } finally {
      setDeciding((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const filteredItems = statusFilter === 'all'
    ? items
    : items.filter((i) => i.status === statusFilter);

  if (loading && selectedOrgId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">HITL Approvals</h1>
          <p className="text-sm text-muted-foreground">Human-in-the-loop requests awaiting your decision</p>
        </div>
        <Button variant="outline" onClick={loadItems} disabled={loading || !selectedOrgId}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to view HITL approvals.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Approval Requests</CardTitle>
                <CardDescription>{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</CardDescription>
              </div>
              {/* Status filter tabs */}
              <div className="flex gap-1 rounded-lg border p-1">
                {(Object.keys(STATUS_LABELS) as StatusFilter[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveTable
              data={filteredItems}
              getRowKey={(i) => i.id}
              emptyMessage={statusFilter === 'pending' ? 'No pending approvals.' : `No ${statusFilter} items.`}
              columns={[
                {
                  key: 'agent',
                  label: 'Agent',
                  render: (i) => <span className="font-medium">{i.agent_name ?? '—'}</span>,
                },
                {
                  key: 'action',
                  label: 'Action',
                  render: (i) => <span className="text-sm text-muted-foreground">{i.action_name ?? '—'}</span>,
                },
                {
                  key: 'instructions',
                  label: 'Instructions',
                  render: (i) => (
                    <span className="text-sm">
                      {i.context?.instructions
                        ? String(i.context.instructions).slice(0, 80) + (String(i.context.instructions).length > 80 ? '…' : '')
                        : '—'}
                    </span>
                  ),
                },
                {
                  key: 'context',
                  label: 'Context',
                  render: (i) => {
                    const preview = JSON.stringify(i.context ?? {});
                    return (
                      <span className="text-xs text-muted-foreground font-mono">
                        {preview.length > 100 ? preview.slice(0, 100) + '…' : preview}
                      </span>
                    );
                  },
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (i) => statusBadge(i.status),
                },
                {
                  key: 'created',
                  label: 'Created',
                  render: (i) => new Date(i.created_at).toLocaleString(),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  desktopRender: (i) =>
                    i.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                          disabled={deciding[i.id]}
                          onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive text-destructive hover:bg-destructive/10"
                          disabled={deciding[i.id]}
                          onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Deny
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {i.decided_at ? new Date(i.decided_at).toLocaleString() : '—'}
                      </span>
                    ),
                  render: (i) =>
                    i.status === 'pending' ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-none rounded-tr-lg border-r-0 border-t-0 border-l border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                          disabled={deciding[i.id]}
                          onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 rounded-none rounded-br-lg border-r-0 border-b-0 border-l border-destructive/20 text-destructive hover:bg-destructive/10"
                          disabled={deciding[i.id]}
                          onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null,
                },
              ]}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
