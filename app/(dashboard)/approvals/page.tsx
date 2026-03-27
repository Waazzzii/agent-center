'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  approveApproval,
  denyApproval,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, XCircle, Eye, Copy, ChevronLeft, ChevronRight } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

type StatusFilter = 'awaiting_approval' | 'approved' | 'denied' | 'all';

const STATUS_FILTERS: StatusFilter[] = ['awaiting_approval', 'approved', 'denied', 'all'];

const STATUS_LABELS: Record<StatusFilter, string> = {
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  denied: 'Denied',
  all: 'All',
};

function statusBadge(status: string) {
  if (status === 'awaiting_approval') return <Badge variant="outline" className="border-slate-300 text-slate-600 dark:text-slate-400">Awaiting Approval</Badge>;
  if (status === 'approved')          return <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Approved</Badge>;
  if (status === 'denied')            return <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400">Denied</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function ApprovalsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agents_manager');

  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('awaiting_approval');
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [viewItem, setViewItem] = useState<AgentApprovalItem | null>(null);

  const loadItems = useCallback(async (pg = page, status = statusFilter) => {
    if (!selectedOrgId) return;
    try {
      setLoading(true);
      const data = await getApprovals(selectedOrgId, {
        status: status === 'all' ? undefined : status,
        page: pg,
        limit: PAGE_SIZE,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, page, statusFilter]);

  useEffect(() => {
    if (!selectedOrgId) return;
    loadItems();
    const interval = setInterval(() => loadItems(), 60_000);
    return () => clearInterval(interval);
  }, [selectedOrgId, loadItems]);

  const handleDecide = async (itemId: string, decision: 'approve' | 'deny') => {
    if (!selectedOrgId) return;
    setDeciding((prev) => ({ ...prev, [itemId]: true }));
    try {
      if (decision === 'approve') {
        await approveApproval(selectedOrgId, itemId);
        toast.success('Approved — agent will continue execution');
      } else {
        await denyApproval(selectedOrgId, itemId);
        toast.success('Denied — execution stopped');
      }
      await loadItems(page, statusFilter);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Decision failed');
    } finally {
      setDeciding((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const handleStatusChange = (s: StatusFilter) => {
    setStatusFilter(s);
    setPage(1);
    loadItems(1, s);
  };

  const goToPage = (pg: number) => {
    setPage(pg);
    loadItems(pg, statusFilter);
  };

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
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">Approval requests awaiting your decision</p>
        </div>
        <Button variant="outline" onClick={() => loadItems()} disabled={loading || !selectedOrgId}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {!selectedOrgId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Select an organization to view approvals.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Approval Requests</CardTitle>
                  <CardDescription>{loading ? 'Loading…' : `${total.toLocaleString()} item${total !== 1 ? 's' : ''}`}</CardDescription>
                </div>
                {/* Status filter tabs */}
                <div className="flex gap-1 rounded-lg border p-1">
                  {STATUS_FILTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
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
                data={items}
                getRowKey={(i) => i.id}
                emptyMessage={statusFilter === 'awaiting_approval' ? 'No items awaiting approval.' : `No ${STATUS_LABELS[statusFilter].toLowerCase()} items.`}
                columns={[
                  {
                    key: 'agent',
                    label: 'Workflow',
                    render: (i) => <span className="font-medium">{i.agent_name ?? '—'}</span>,
                  },
                  {
                    key: 'action',
                    label: 'Step',
                    render: (i) => <span className="text-sm text-muted-foreground">{i.action_name ?? '—'}</span>,
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    thClassName: 'w-36',
                    render: (i) => statusBadge(i.status),
                  },
                  {
                    key: 'created',
                    label: 'Created',
                    thClassName: 'w-44',
                    desktopRender: (i) => <span className="text-sm text-muted-foreground whitespace-nowrap">{new Date(i.started_at).toLocaleString()}</span>,
                    render: (i) => <span className="text-sm text-muted-foreground">{new Date(i.started_at).toLocaleString()}</span>,
                  },
                  {
                    key: 'actions',
                    label: '',
                    thClassName: 'w-28',
                    mobileFullWidth: true,
                    desktopRender: (i) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="View details"
                          onClick={(e) => { e.stopPropagation(); setViewItem(i); }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {i.status === 'awaiting_approval' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                              title="Approve"
                              disabled={deciding[i.id]}
                              onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              title="Deny"
                              disabled={deciding[i.id]}
                              onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    ),
                    render: (i) => (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => { e.stopPropagation(); setViewItem(i); }}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />View
                        </Button>
                        {i.status === 'awaiting_approval' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                              disabled={deciding[i.id]}
                              onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}
                            >
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                              disabled={deciding[i.id]}
                              onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}
                            >
                              <XCircle className="mr-1.5 h-3.5 w-3.5" />Deny
                            </Button>
                          </>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            {/* Pagination */}
            {totalPages > 1 && !loading && (
              <div className="flex items-center justify-between border-t px-2 pt-3 mt-3">
                <span className="text-xs text-muted-foreground">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pg: number;
                    if (totalPages <= 7) { pg = i + 1; }
                    else if (page <= 4) { pg = i + 1; if (i === 6) pg = totalPages; if (i === 5) pg = -1; }
                    else if (page >= totalPages - 3) { pg = i === 0 ? 1 : i === 1 ? -1 : totalPages - (6 - i); }
                    else { const map = [1, -1, page - 1, page, page + 1, -2, totalPages]; pg = map[i]!; }
                    if (pg < 0) return <span key={`e${i}`} className="px-1 text-muted-foreground text-sm">…</span>;
                    return (
                      <Button key={pg} variant={pg === page ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0 text-xs" onClick={() => goToPage(pg)}>
                        {pg}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
            </CardContent>
          </Card>

          {/* View details modal */}
          <Dialog open={!!viewItem} onOpenChange={(o) => { if (!o) setViewItem(null); }}>
            <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{viewItem?.agent_name} — {viewItem?.action_name}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0 space-y-4">
                {/* Instructions */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Instructions</p>
                  {viewItem?.approval_instructions ? (
                    <p className="text-sm leading-relaxed">{viewItem.approval_instructions}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No instructions provided.</p>
                  )}
                </div>
                {/* Output */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Output from previous step</p>
                  {viewItem?.output ? (
                    <pre className="text-xs bg-muted rounded-md p-3 whitespace-pre-wrap break-words leading-relaxed overflow-auto max-h-[40vh]">
                      {viewItem.output}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No output available.</p>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2 flex-wrap">
                {viewItem?.output && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { navigator.clipboard.writeText(viewItem.output ?? ''); toast.success('Copied to clipboard'); }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />Copy output
                  </Button>
                )}
                {viewItem?.status === 'awaiting_approval' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
                      disabled={deciding[viewItem.id]}
                      onClick={() => { handleDecide(viewItem.id, 'approve'); setViewItem(null); }}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      disabled={deciding[viewItem.id]}
                      onClick={() => { handleDecide(viewItem.id, 'deny'); setViewItem(null); }}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />Deny
                    </Button>
                  </>
                )}
                <Button size="sm" onClick={() => setViewItem(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
