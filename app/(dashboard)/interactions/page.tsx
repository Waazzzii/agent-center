'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getApprovals,
  approveApproval,
  denyApproval,
  type AgentApprovalItem,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  RefreshCw, CheckCircle2, XCircle, Eye, Loader2, Monitor, MessageSquare, LogIn, PauseCircle,
} from 'lucide-react';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { BrowserHITLDialog } from '@/components/hitl/BrowserHITLDialog';

const PAGE_SIZE = 20;

type FilterType = 'all' | 'approval' | 'login';

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function InteractionsPage() {
  const { selectedOrgId } = useAdminViewStore();
  const allowed = useRequirePermission('agent_center_user');

  const [items, setItems] = useState<AgentApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewItem, setViewItem] = useState<AgentApprovalItem | null>(null);
  const [deciding, setDeciding] = useState<Record<string, boolean>>({});
  const [hitlRunId, setHitlRunId] = useState<string | null>(null);
  const [hitlAgentName, setHitlAgentName] = useState<string>('');

  const load = useCallback(async () => {
    if (!selectedOrgId) return;
    setLoading(true);
    try {
      const typesParam = filter === 'all' ? 'approval,login' : filter;
      const res = await getApprovals(selectedOrgId, {
        status: 'awaiting_approval',
        action_types: typesParam,
        limit: PAGE_SIZE,
      });
      setItems(res.items ?? []);
    } catch {
      toast.error('Failed to load interactions');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, filter]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30s for new interactions
  useEffect(() => {
    const iv = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const handleApprove = async (item: AgentApprovalItem) => {
    if (!selectedOrgId) return;
    setDeciding((d) => ({ ...d, [item.id]: true }));
    try {
      await approveApproval(selectedOrgId, item.id);
      toast.success('Approved');
      setViewItem(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    } finally {
      setDeciding((d) => ({ ...d, [item.id]: false }));
    }
  };

  const handleDeny = async (item: AgentApprovalItem) => {
    if (!selectedOrgId) return;
    setDeciding((d) => ({ ...d, [item.id]: true }));
    try {
      await denyApproval(selectedOrgId, item.id);
      toast.success('Denied');
      setViewItem(null);
      await load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to deny');
    } finally {
      setDeciding((d) => ({ ...d, [item.id]: false }));
    }
  };

  const handleOpenBrowser = (item: AgentApprovalItem) => {
    setHitlAgentName(item.agent_name);
    setHitlRunId(item.execution_log_id);
  };

  if (!allowed) return <NoPermissionContent />;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" /> Interactions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent runs waiting for human review or login — one place for all human touch points.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'approval', 'login'] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'approval' ? 'Approvals' : 'Logins'}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> No interactions waiting
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isLogin = item.action_type === 'login';
            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className={`p-2 rounded-md shrink-0 ${isLogin ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' : 'bg-violet-100 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400'}`}>
                    {isLogin ? <LogIn className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className={isLogin ? 'border-amber-400 text-amber-600 dark:text-amber-400' : 'border-violet-400 text-violet-600 dark:text-violet-400'}>
                        {isLogin ? 'Login Required' : 'Approval Required'}
                      </Badge>
                      <span className="font-medium text-sm">{item.agent_name}</span>
                      <span className="text-xs text-muted-foreground">{item.action_name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatRelative(item.started_at)}</span>
                    </div>
                    {item.approval_instructions && !isLogin && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.approval_instructions}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isLogin ? (
                      <Button size="sm" onClick={() => handleOpenBrowser(item)}>
                        <Monitor className="h-3.5 w-3.5 mr-1" /> Open Browser
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setViewItem(item)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Review
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Approval review modal */}
      <Dialog open={!!viewItem && viewItem.action_type !== 'login'} onOpenChange={(open) => { if (!open) setViewItem(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Approval</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Agent</div>
                <div className="font-medium">{viewItem.agent_name}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Step</div>
                <div>{viewItem.action_name}</div>
              </div>
              {viewItem.approval_instructions && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Instructions</div>
                  <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-2 text-xs">{viewItem.approval_instructions}</div>
                </div>
              )}
              {viewItem.output && (
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Previous output</div>
                  <div className="whitespace-pre-wrap bg-muted/50 rounded-md p-2 text-xs font-mono max-h-64 overflow-auto">{viewItem.output}</div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {viewItem && (
              <>
                <Button variant="outline" onClick={() => handleDeny(viewItem)} disabled={!!deciding[viewItem.id]} className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50">
                  <XCircle className="h-4 w-4 mr-1" /> Deny
                </Button>
                <Button onClick={() => handleApprove(viewItem)} disabled={!!deciding[viewItem.id]}>
                  {deciding[viewItem.id] ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Approve
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hitlRunId && (
        <BrowserHITLDialog
          open={!!hitlRunId}
          onOpenChange={(open) => {
            if (!open) {
              setHitlRunId(null);
              load();
            }
          }}
          runId={hitlRunId}
          agentName={hitlAgentName}
        />
      )}
    </div>
  );
}
