'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { getExecutionTree, type ExecutionTreeNode } from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  GitBranch,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function statusColor(status: string): string {
  if (status === 'completed') return 'border-success/40 bg-success-soft';
  if (status === 'failed') return 'border-danger/40 bg-danger-soft';
  if (status === 'aborted') return 'border-danger/40 bg-danger-soft';
  if (status === 'executing') return 'border-info/40 bg-info-soft';
  if (status === 'awaiting_approval') return 'border-brand/40 bg-brand-soft';
  if (status === 'provisioning' || status === 'queued') return 'border-warning/40 bg-warning-soft';
  return 'border-border bg-muted/30';
}

function statusBadgeCls(status: string): string {
  if (status === 'completed') return 'border-success/40 text-success';
  if (status === 'failed' || status === 'aborted') return 'border-danger/40 text-danger';
  if (status === 'executing') return 'border-info/40 text-info';
  if (status === 'awaiting_approval') return 'border-brand/40 text-brand';
  return 'border-warning/40 text-warning';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === 'failed' || status === 'aborted') return <XCircle className="h-4 w-4 text-danger" />;
  if (status === 'executing') return <Loader2 className="h-4 w-4 text-info animate-spin" />;
  return <Clock className="h-4 w-4 text-warning" />;
}

// ---------------------------------------------------------------------------
// Tree node component
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: ExecutionTreeNode;
  children: ExecutionTreeNode[];
  allNodes: ExecutionTreeNode[];
}

function TreeNode({ node, children, allNodes }: TreeNodeProps) {
  return (
    <div className="flex flex-col items-center">
      {/* Node card */}
      <Link
        href={`/agent-history/${node.id}`}
        className={cn(
          'border-2 rounded-lg px-4 py-3 min-w-[200px] max-w-[280px] hover:shadow-md transition-shadow cursor-pointer',
          statusColor(node.status),
        )}
      >
        <div className="flex items-center gap-2">
          <StatusIcon status={node.status} />
          <span className="font-medium text-sm truncate">{node.agent_name}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Badge variant="outline" className={cn('text-xs', statusBadgeCls(node.status))}>
            {node.status}
          </Badge>
          {node.item_index != null && (
            <span className="text-xs text-muted-foreground font-mono">Item #{node.item_index}</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{formatDuration(node.duration_ms)}</span>
        </div>
      </Link>

      {/* Children connector + children */}
      {children.length > 0 && (
        <>
          {/* Vertical line down from parent */}
          <div className="w-px h-6 bg-border" />

          {/* Horizontal connector bar (if multiple children) */}
          {children.length > 1 && (
            <div className="relative w-full flex justify-center">
              <div
                className="h-px bg-border absolute top-0"
                style={{
                  left: `${100 / (children.length * 2)}%`,
                  right: `${100 / (children.length * 2)}%`,
                }}
              />
            </div>
          )}

          {/* Child nodes */}
          <div className="flex gap-4 flex-wrap justify-center">
            {children.map((child) => {
              const grandchildren = allNodes.filter((n) => n.parent_execution_id === child.id);
              return (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Vertical line down to child */}
                  <div className="w-px h-6 bg-border" />
                  <TreeNode
                    node={child}
                    children={grandchildren}
                    allNodes={allNodes}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ExecutionTreePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { selectedOrgId } = useAdminViewStore();

  const [nodes, setNodes] = useState<ExecutionTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    setLoading(true);
    try {
      const data = await getExecutionTree(selectedOrgId, id);
      setNodes(data);
    } catch {
      toast.error('Failed to load execution tree');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, id]);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const root = nodes.find((n) => n.id === id) ?? nodes[0];
  const rootChildren = root ? nodes.filter((n) => n.parent_execution_id === root.id) : [];

  // Summary stats
  const totalRuns = nodes.length;
  const completed = nodes.filter((n) => n.status === 'completed').length;
  const failed = nodes.filter((n) => n.status === 'failed' || n.status === 'aborted').length;
  const running = nodes.filter((n) => n.status === 'executing').length;

  return (
    <div className="flex flex-col gap-5 p-6 max-w-6xl mx-auto">

      {/* Back */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="gap-1.5 -ml-2 w-fit text-muted-foreground">
          <Link href={`/agent-history/${id}`}><ArrowLeft className="h-4 w-4" />Back to run details</Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <GitBranch className="h-5 w-5 text-brand" />
        <h1 className="text-xl font-semibold tracking-tight">Execution Tree</h1>
        {root && (
          <span className="text-xs font-mono text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded">
            {root.agent_name} &middot; Run #{id.slice(-4).toUpperCase()}
          </span>
        )}
      </div>

      {/* Summary stats */}
      {!loading && nodes.length > 1 && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{totalRuns} total runs</span>
          <span className="text-success">{completed} completed</span>
          {failed > 0 && <span className="text-danger">{failed} failed</span>}
          {running > 0 && <span className="text-info">{running} running</span>}
        </div>
      )}

      {/* Tree */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading execution tree…</p>
        </div>
      ) : !root ? (
        <p className="text-sm text-muted-foreground italic py-10 text-center">Execution not found.</p>
      ) : nodes.length === 1 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p>This execution has no sub-agent runs.</p>
            <p className="mt-1">Sub-agent actions create child runs that appear here as a tree.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-8">
          <div className="inline-flex justify-center min-w-full py-4">
            <TreeNode node={root} children={rootChildren} allNodes={nodes} />
          </div>
        </div>
      )}
    </div>
  );
}
