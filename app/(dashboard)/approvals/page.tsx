'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  getAgents,
  approveApproval,
  denyApproval,
  type Agent,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, XCircle, Eye, Copy, ChevronLeft, ChevronRight, Filter, X, Loader2, PauseCircle } from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 15;

type FilterKey = 'agent' | 'status' | 'execution';
interface ActiveFilter { key: FilterKey; value: string; label: string }

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'approved',          label: 'Approved' },
  { value: 'denied',            label: 'Denied' },
  { value: 'aborted',           label: 'Aborted' },
];

function statusBadge(status: string) {
  if (status === 'awaiting_approval') return <Badge variant="outline" className="border-slate-300 text-slate-600 dark:text-slate-400">Awaiting Approval</Badge>;
  if (status === 'approved')          return <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Approved</Badge>;
  if (status === 'denied')            return <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400">Denied</Badge>;
  if (status === 'aborted')           return <Badge variant="outline" className="border-red-400 text-red-600 dark:text-red-400">Aborted</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function ApprovalsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const permitted = useRequirePermission('agent_center_user');
  const searchParams = useSearchParams();

  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [viewItem, setViewItem] = useState<AgentApprovalItem | null>(null);

  // Pill-based filters — initialized synchronously from URL params to avoid race conditions
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>(() => {
    const filters: ActiveFilter[] = [];
    const execId = searchParams.get('execution_id');
    if (execId) filters.push({ key: 'execution', value: execId, label: `Run: #${execId.slice(-4).toUpperCase()}` });
    const agId = searchParams.get('agent_id');
    if (agId) filters.push({ key: 'agent', value: agId, label: 'Agent: …' }); // label resolved once agents load
    return filters;
  });
  const [pendingType, setPendingType] = useState<FilterKey | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const [valueSelectOpen, setValueSelectOpen] = useState(false);
  const agentIdFromUrl = useRef(searchParams.get('agent_id'));

  const hasFilters = activeFilters.length > 0;

  const loadItems = useCallback(async (pg: number = page, filters: ActiveFilter[] = activeFilters) => {
    if (!selectedOrgId) return;
    const agentF     = filters.find(f => f.key === 'agent');
    const statusF    = filters.find(f => f.key === 'status');
    const executionF = filters.find(f => f.key === 'execution');
    try {
      setLoading(true);
      const data = await getApprovals(selectedOrgId, {
        status:       statusF?.value,
        agent_id:     agentF?.value,
        execution_id: executionF?.value,
        page:         pg,
        limit:        PAGE_SIZE,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, page, activeFilters]);

  // Load on org change
  useEffect(() => {
    if (!selectedOrgId) return;
    loadItems();
    const interval = setInterval(() => loadItems(), 60_000);
    return () => clearInterval(interval);
  }, [selectedOrgId, loadItems]);

  // Load agents for filter dropdown
  useEffect(() => {
    if (!selectedOrgId) return;
    getAgents(selectedOrgId).then((d) => setAgents(d.agents)).catch(() => {});
  }, [selectedOrgId]);

  // Resolve agent name label once agents list loads (filter value already seeded synchronously)
  useEffect(() => {
    const id = agentIdFromUrl.current;
    if (!id || agents.length === 0) return;
    agentIdFromUrl.current = null;
    const found = agents.find((a) => a.id === id);
    if (!found) return;
    setActiveFilters(prev => prev.map(f =>
      f.key === 'agent' ? { ...f, label: `Agent: ${found.name}` } : f
    ));
  }, [agents]);

  // ── Filter helpers ──

  const cancelPending = () => { setPendingType(null); setPendingValue(''); setValueSelectOpen(false); };

  const confirmFilter = (type: FilterKey, value: string) => {
    const statusLabel = STATUS_OPTIONS.find(s => s.value === value)?.label ?? value;
    let label = '';
    if (type === 'status')    label = `Status: ${statusLabel}`;
    if (type === 'agent')     label = `Agent: ${agents.find(a => a.id === value)?.name ?? value}`;
    if (type === 'execution') label = `Run: #${value.slice(-4).toUpperCase()}`;
    const newFilters = [...activeFilters.filter(f => f.key !== type), { key: type, value, label }];
    setActiveFilters(newFilters);
    cancelPending();
    setPage(1);
    loadItems(1, newFilters);
  };

  const removeFilter = (key: FilterKey) => {
    const newFilters = activeFilters.filter(f => f.key !== key);
    setActiveFilters(newFilters);
    setPage(1);
    loadItems(1, newFilters);
  };

  const clearFilters = () => {
    setActiveFilters([]);
    setPage(1);
    loadItems(1, []);
  };

  // ── Decisions ──

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
      await loadItems(page, activeFilters);
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Decision failed');
    } finally {
      setDeciding((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const goToPage = (pg: number) => {
    setPage(pg);
    loadItems(pg, activeFilters);
  };

  if (!permitted) return <NoPermissionContent />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-muted-foreground">Approval requests awaiting your decision</p>
        </div>
        <Button variant="outline" onClick={() => loadItems(page, activeFilters)} disabled={loading || !selectedOrgId}>
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
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
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Step 1: pick a category */}
            {!pendingType && (
              <Select value="" onValueChange={(v) => { setPendingType(v as FilterKey); setPendingValue(''); setValueSelectOpen(true); }}>
                <SelectTrigger className="h-8 w-auto gap-1.5 border-dashed text-xs text-muted-foreground px-3">
                  <Filter className="h-3 w-3" />
                  <SelectValue placeholder="Add filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  {agents.length > 0 && <SelectItem value="agent">Agent</SelectItem>}
                </SelectContent>
              </Select>
            )}

            {/* Step 2a: pick a status value */}
            {pendingType === 'status' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <Select value="" open={valueSelectOpen} onOpenChange={(o) => { setValueSelectOpen(o); if (!o) cancelPending(); }} onValueChange={(v) => confirmFilter('status', v)}>
                  <SelectTrigger className="h-8 text-xs w-[190px]">
                    <SelectValue placeholder="Select status…" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 2b: pick an agent value */}
            {pendingType === 'agent' && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Agent:</span>
                <Select value="" open={valueSelectOpen} onOpenChange={(o) => { setValueSelectOpen(o); if (!o) cancelPending(); }} onValueChange={(v) => confirmFilter('agent', v)}>
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Select agent…" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Active filter pills */}
            {activeFilters.map(f => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium">
                {f.label}
                <button onClick={() => removeFilter(f.key)} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}

            {/* Clear all */}
            {hasFilters && !pendingType && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>

          {(() => {
            const pendingItems = items.filter(i => i.status === 'awaiting_approval');
            const historyItems = items.filter(i => i.status !== 'awaiting_approval');

            // Shared column definitions
            const approvalColumns = [
              {
                key: 'agent',
                label: 'Workflow',
                render: (i: AgentApprovalItem) => (
                  <span className="font-medium truncate">
                    <span className="text-xs font-mono text-muted-foreground/50 mr-1.5">[{i.execution_log_id.slice(-4).toUpperCase()}]</span>
                    {i.agent_name ?? '—'}
                  </span>
                ),
              },
              {
                key: 'action',
                label: 'Step',
                render: (i: AgentApprovalItem) => <span className="text-sm text-muted-foreground">{i.action_name ?? '—'}</span>,
              },
              {
                key: 'status',
                label: 'Status',
                thClassName: 'w-36',
                render: (i: AgentApprovalItem) => statusBadge(i.status),
              },
              {
                key: 'created',
                label: 'Created',
                thClassName: 'w-44',
                desktopRender: (i: AgentApprovalItem) => <span className="text-sm text-muted-foreground whitespace-nowrap">{new Date(i.started_at).toLocaleString()}</span>,
                render: (i: AgentApprovalItem) => <span className="text-sm text-muted-foreground">{new Date(i.started_at).toLocaleString()}</span>,
              },
              {
                key: 'actions',
                label: '',
                thClassName: 'w-36',
                mobileFullWidth: true,
                desktopRender: (i: AgentApprovalItem) => (
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="View details" onClick={(e) => { e.stopPropagation(); setViewItem(i); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {i.status === 'awaiting_approval' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950" title="Approve" disabled={deciding[i.id]} onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950" title="Deny" disabled={deciding[i.id]} onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ),
                render: (i: AgentApprovalItem) => (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" variant="outline" className="flex-1" onClick={(e) => { e.stopPropagation(); setViewItem(i); }}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" />View
                    </Button>
                    {i.status === 'awaiting_approval' && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950" disabled={deciding[i.id]} onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'approve'); }}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-destructive text-destructive hover:bg-destructive/10" disabled={deciding[i.id]} onClick={(e) => { e.stopPropagation(); handleDecide(i.id, 'deny'); }}>
                          <XCircle className="mr-1.5 h-3.5 w-3.5" />Deny
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ];

            if (loading) {
              return (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              );
            }

            if (items.length === 0) {
              return (
                <Card>
                  <CardContent className="py-16 text-center text-muted-foreground">
                    <PauseCircle className="mx-auto h-10 w-10 mb-3 opacity-20" />
                    <p className="text-sm">No approvals found{hasFilters ? ' matching the current filters' : ''}.</p>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div className="space-y-4">
                {/* ── Awaiting Approval ── */}
                {pendingItems.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <PauseCircle className="h-4 w-4 text-violet-500" />
                        <CardTitle className="text-base">Awaiting Approval</CardTitle>
                        <Badge variant="outline" className="border-violet-300 text-violet-600 dark:text-violet-400 text-xs">
                          {pendingItems.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ResponsiveTable
                        data={pendingItems}
                        getRowKey={(i) => i.id}
                        emptyMessage=""
                        columns={approvalColumns}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* ── Decision History ── */}
                {historyItems.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Decision History</CardTitle>
                          <CardDescription>
                            {total.toLocaleString()} item{total !== 1 ? 's' : ''}{hasFilters ? ' matching filters' : ''}
                          </CardDescription>
                        </div>
                        {totalPages > 1 && (
                          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ResponsiveTable
                        data={historyItems}
                        getRowKey={(i) => i.id}
                        emptyMessage=""
                        columns={approvalColumns}
                      />
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t px-4 py-3">
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
                )}
              </div>
            );
          })()}

          {/* View details modal */}
          <Dialog open={!!viewItem} onOpenChange={(o) => { if (!o) setViewItem(null); }}>
            <DialogContent className="max-w-2xl flex flex-col max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>{viewItem?.agent_name} — {viewItem?.action_name}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto min-h-0 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Instructions</p>
                  {viewItem?.approval_instructions ? (
                    <p className="text-sm leading-relaxed">{viewItem.approval_instructions}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No instructions provided.</p>
                  )}
                </div>
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
              {(viewItem?.output || viewItem?.status === 'awaiting_approval') && (
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
                        className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-400"
                        disabled={deciding[viewItem.id]}
                        onClick={() => { handleDecide(viewItem.id, 'approve'); setViewItem(null); }}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={deciding[viewItem.id]}
                        onClick={() => { handleDecide(viewItem.id, 'deny'); setViewItem(null); }}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" />Deny
                      </Button>
                    </>
                  )}
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
