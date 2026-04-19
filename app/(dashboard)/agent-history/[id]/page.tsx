'use client';

/**
 * Execution Detail — breadcrumb-driven navigation.
 *
 * Every level (agent, sub-agent, action) renders the SAME layout:
 *   Breadcrumb:  Executions > Parent Agent > Sub-Agent > AI Step
 *   Header:      Name + type + status
 *   Summary:     Duration · Tokens · Cost · Status cards
 *   Content:     For agents → action list (clickable cards)
 *                For actions → log viewer
 *
 * Clicking an action in the list navigates "into" it — the breadcrumb
 * updates, the summary shows that action's metrics, and the content
 * shows its logs.  Back via breadcrumb at any level.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import agentClient from '@/lib/api/agent-client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, Zap, LogIn, Play, GitBranch, PauseCircle,
  AlertCircle, Copy, Hash, Bot, History, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getFullExecutionTree, type FullTreeNode } from '@/lib/api/agents';
import { useEventStream } from '@/lib/hooks/use-event-stream';
import { LogViewer } from '@/components/execution/LogViewer';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type StepType = 'text' | 'tool_use' | 'tool_result' | 'result' | 'init' | 'error';
interface StepRow {
  id: string; sequence: number; step_type: StepType;
  tool_name: string | null; tool_input: Record<string, unknown> | null;
  content: string | null; metadata: Record<string, unknown> | null;
  created_at: string;
}

// A breadcrumb entry — either an execution or an action within one
interface Crumb {
  label: string;
  node: FullTreeNode;
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtTokens(n: number | null | undefined): string {
  if (!n) return '—';
  return n < 1000 ? String(n) : n < 1_000_000 ? `${(n / 1000).toFixed(1)}K` : `${(n / 1_000_000).toFixed(2)}M`;
}

const ST: Record<string, { dot: string; cls: string; label: string }> = {
  completed: { dot: 'bg-emerald-500', cls: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400', label: 'Completed' },
  approved:  { dot: 'bg-emerald-500', cls: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400', label: 'Approved' },
  failed:    { dot: 'bg-red-500', cls: 'border-red-400 text-red-600 dark:text-red-400', label: 'Failed' },
  aborted:   { dot: 'bg-red-400', cls: 'border-red-400 text-red-500', label: 'Aborted' },
  denied:    { dot: 'bg-red-400', cls: 'border-red-400 text-red-500', label: 'Denied' },
  executing: { dot: 'bg-blue-500 animate-pulse', cls: 'border-blue-400 text-blue-600 dark:text-blue-400', label: 'Running' },
  awaiting_approval: { dot: 'bg-brand animate-pulse', cls: 'border-brand/40 text-brand', label: 'Awaiting' },
  provisioning: { dot: 'bg-warning animate-pulse', cls: 'border-warning/40 text-warning', label: 'Starting' },
  queued: { dot: 'bg-slate-400', cls: 'border-slate-300 text-slate-500', label: 'Queued' },
};
const AT: Record<string, string> = { agent: 'AI Step', login: 'Login', approval: 'Approval', browser_script: 'Script', sub_agent: 'Sub Agents' };
const ICONS: Record<string, typeof Zap> = { agent: Zap, login: LogIn, approval: PauseCircle, browser_script: Play, sub_agent: GitBranch };

function Dot({ status, className: cls }: { status: string; className?: string }) {
  return <span className={cn('w-2 h-2 rounded-full shrink-0', ST[status]?.dot ?? 'bg-slate-400', cls)} />;
}
function SBadge({ status }: { status: string }) {
  const s = ST[status] ?? ST.executing;
  return <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5', s.cls)}>{s.label}</Badge>;
}

function nodeTypeLabel(node: FullTreeNode): string {
  if (node.type === 'execution') {
    return (node.depth ?? 0) > 0 ? 'Sub Agent' : 'Agent';
  }
  if (node.type === 'batch_item') return `Batch Item #${node.batch_item_index ?? '?'}`;
  return AT[node.action_type ?? ''] ?? node.action_type ?? 'Action';
}

function NodeIcon({ node, className: cls }: { node: FullTreeNode; className?: string }) {
  if (node.type === 'execution') return <Bot className={cn('h-4 w-4 text-blue-500', cls)} />;
  if (node.type === 'batch_item') return <Hash className={cn('h-4 w-4 text-muted-foreground', cls)} />;
  const Icon = ICONS[node.action_type ?? ''] ?? Zap;
  return <Icon className={cn('h-4 w-4 text-muted-foreground', cls)} />;
}

// ═══════════════════════════════════════════════════════════════
// Breadcrumb
// ═══════════════════════════════════════════════════════════════

function Breadcrumb({ crumbs, currentId, onNavigate }: {
  crumbs: Crumb[]; currentId: string; onNavigate: (crumb: Crumb) => void;
}) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <Link href="/agent-history" className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
        Executions
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const isRemoteNav = !isLast && crumb.node.id !== currentId;

        return (
          <div key={`${crumb.node.id}-${i}`} className="flex items-center gap-1 shrink-0">
            <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
            {isLast ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : isRemoteNav ? (
              <Link
                href={`/agent-history/${crumb.node.id}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <button
                onClick={() => onNavigate(crumb)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {crumb.label}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════
// Summary Cards — identical format for agents AND actions
// ═══════════════════════════════════════════════════════════════

function SummaryCards({ node }: { node: FullTreeNode }) {
  const isExec = node.type === 'execution';
  const children = node.children ?? [];

  // Per-run cost is no longer shown here — dollars live on Billing & Usage
  // (aggregated from Anthropic's Cost API). Here we show token usage only.
  const tokensIn = isExec
    ? children.reduce((s, a) => s + (a.tokens_input ?? 0), 0)
    : node.tokens_input ?? 0;
  const tokensOut = isExec
    ? children.reduce((s, a) => s + (a.tokens_output ?? 0), 0)
    : node.tokens_output ?? 0;
  const completedCount = isExec
    ? children.filter((a) => a.status === 'completed' || a.status === 'approved').length
    : undefined;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <SummaryCard label="Status"><SBadge status={node.status} /></SummaryCard>
      <SummaryCard label="Duration" value={fmtDur(node.duration_ms)} />
      {isExec && (
        <SummaryCard label="Actions">
          <span className="text-base font-semibold tabular-nums">{completedCount}<span className="text-muted-foreground font-normal text-xs">/{children.length}</span></span>
          <div className="flex items-center gap-0.5 mt-1">
            {children.map((a) => <span key={a.id} className={cn('h-1 w-3 rounded-full', ST[a.status]?.dot ?? 'bg-slate-300')} />)}
          </div>
        </SummaryCard>
      )}
      {!isExec && node.model && <SummaryCard label="Model" value={node.model.replace('claude-', '')} mono />}
      <SummaryCard label="Tokens" value={tokensIn + tokensOut > 0 ? `${fmtTokens(tokensIn)} / ${fmtTokens(tokensOut)}` : '—'} />
    </div>
  );
}

function SummaryCard({ label, value, accent, mono, children: ch }: {
  label: string; value?: string; accent?: boolean; mono?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50">{label}</div>
      {ch ?? (
        <div className={cn('text-base font-semibold tabular-nums mt-0.5',
          accent && 'text-emerald-600 dark:text-emerald-400',
          mono && 'font-mono text-sm',
        )}>
          {value}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Content: Action List (for agents) or Logs (for actions)
// ═══════════════════════════════════════════════════════════════

function ActionList({ actions, onSelect }: { actions: FullTreeNode[]; onSelect: (a: FullTreeNode) => void }) {
  return (
    <div className="space-y-1">
      {actions.map((action, i) => {
        const Icon = action.action_type === 'sub_agent' ? GitBranch : ICONS[action.action_type ?? ''] ?? Zap;
        const isSub = action.action_type === 'sub_agent';
        const childExecs = action.children?.filter((c) => c.type === 'execution') ?? [];

        return (
          <button
            key={action.id}
            onClick={() => onSelect(action)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
              isSub ? 'border-blue-200/60 dark:border-blue-800/40 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-950/10'
                    : 'border-border/50 hover:border-border hover:bg-muted/20',
            )}
          >
            <div className={cn('p-1.5 rounded-md shrink-0',
              isSub ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted/60',
            )}>
              <Icon className={cn('h-4 w-4', isSub ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground')} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Dot status={action.status} />
                <span className="text-sm font-medium truncate">
                  {/* Sub-agent actions: show the target agent's name from the first child execution */}
                  {isSub && childExecs.length > 0 ? childExecs[0].agent_name ?? childExecs[0].label : action.label}
                </span>
                <SBadge status={action.status} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{AT[action.action_type ?? ''] ?? action.action_type}</span>
                <span className="tabular-nums">{fmtDur(action.duration_ms)}</span>
                {(action.tokens_input ?? 0) > 0 && <span className="tabular-nums">{fmtTokens(action.tokens_input)} / {fmtTokens(action.tokens_output)}</span>}
                {isSub && childExecs.length > 0 && <span className="text-blue-600 dark:text-blue-400">{childExecs.length} run{childExecs.length !== 1 ? 's' : ''}</span>}
              </div>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function SubAgentModal({ open, onOpenChange, childNodes }: {
  open: boolean; onOpenChange: (open: boolean) => void; childNodes: FullTreeNode[];
}) {
  const router = useRouter();
  const execs = childNodes.filter((c) => c.type === 'execution');
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all');

  // Sort: failed first, then by item_index
  const sorted = useMemo(() => {
    const filtered = filter === 'all' ? execs
      : filter === 'failed' ? execs.filter((e) => e.status === 'failed' || e.status === 'aborted')
      : execs.filter((e) => e.status === 'completed' || e.status === 'approved');
    return [...filtered].sort((a, b) => {
      // Failed/aborted first
      const aFail = a.status === 'failed' || a.status === 'aborted' ? 0 : 1;
      const bFail = b.status === 'failed' || b.status === 'aborted' ? 0 : 1;
      if (aFail !== bFail) return aFail - bFail;
      return (a.item_index ?? 0) - (b.item_index ?? 0);
    });
  }, [execs, filter]);

  const failedCount = execs.filter((e) => e.status === 'failed' || e.status === 'aborted').length;
  const completedCount = execs.filter((e) => e.status === 'completed' || e.status === 'approved').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg h-[60vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-blue-500" />
            Sub Agents
            <span className="text-sm font-normal text-muted-foreground">({execs.length})</span>
          </DialogTitle>
        </DialogHeader>

        {/* Status filter chips */}
        <div className="flex items-center gap-1.5 pb-2 border-b">
          {([
            { key: 'all' as const, label: 'All', count: execs.length },
            { key: 'failed' as const, label: 'Failed', count: failedCount },
            { key: 'completed' as const, label: 'Completed', count: completedCount },
          ]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs transition-colors',
                filter === f.key
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {f.label}
              {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-auto space-y-1 min-h-0">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">
              No {filter === 'all' ? '' : filter} runs.
            </p>
          ) : sorted.map((child: FullTreeNode, i: number) => {
            const childActions = child.children ?? [];
            const done = childActions.filter((a: FullTreeNode) => a.status === 'completed' || a.status === 'approved').length;
            const isFailed = child.status === 'failed' || child.status === 'aborted';

            return (
              <button
                key={child.id}
                onClick={() => { onOpenChange(false); router.push(`/agent-history/${child.id}`); }}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-all',
                  isFailed
                    ? 'border-red-200/60 dark:border-red-800/40 hover:border-red-300 bg-red-50/20 dark:bg-red-950/10'
                    : 'border-border/50 hover:border-border hover:bg-muted/20',
                )}
              >
                {/* Number */}
                <span className="text-xs font-mono text-muted-foreground/50 w-6 text-right shrink-0 tabular-nums">
                  {child.item_index != null ? `#${child.item_index}` : `${i + 1}`}
                </span>

                <Dot status={child.status} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{child.label}</span>
                    <SBadge status={child.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="tabular-nums">{fmtDur(child.duration_ms)}</span>
                    <span>{done}/{childActions.length} actions</span>
                    <div className="flex items-center gap-0.5 ml-1">
                      {childActions.map((a: FullTreeNode) => <span key={a.id} className={cn('h-1 w-2 rounded-full', ST[a.status]?.dot ?? 'bg-slate-300')} />)}
                    </div>
                  </div>
                </div>

                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActionLogs({ action, orgId, executionId }: { action: FullTreeNode; orgId: string; executionId: string }) {
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const hasLogs = action.action_type === 'agent' || action.action_type === 'browser_script';

  const loadSteps = useCallback(() => {
    if (!hasLogs || !orgId) { setSteps([]); return; }
    setLoadingSteps(true);
    agentClient.get(`/api/admin/${orgId}/executions/${executionId}/steps`, { params: { action_log_id: action.id, limit: 200 } })
      .then(({ data }) => setSteps(data.steps ?? []))
      .catch(() => {}).finally(() => setLoadingSteps(false));
  }, [action.id, hasLogs, orgId, executionId]);

  useEffect(() => { loadSteps(); }, [loadSteps]);

  // Live-update steps via SSE while the action is executing
  const stepsRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: executionId ? [`run:${executionId}`] : [],
    enabled: !!executionId && hasLogs,
    onEvent: () => {
      if (stepsRefresh.current) clearTimeout(stepsRefresh.current);
      stepsRefresh.current = setTimeout(() => loadSteps(), 500);
    },
  });

  return (
    <div className="space-y-3">
      {action.error_message && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-words font-mono leading-relaxed">{action.error_message}</pre>
        </div>
      )}

      {/* AI steps + browser scripts: full log viewer */}
      {hasLogs && <LogViewer steps={steps} loading={loadingSteps} />}

      {/* Other action types: show result */}
      {!hasLogs && action.output && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground">Result</span>
            <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => { navigator.clipboard.writeText(action.output ?? ''); toast.success('Copied'); }}>
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <pre className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-auto">
            {(() => { try { return JSON.stringify(JSON.parse(action.output!), null, 2); } catch { return action.output; } })()}
          </pre>
        </div>
      )}

      {/* Show output below log viewer for browser scripts (output is the batch result JSON) */}
      {action.action_type === 'browser_script' && action.output && (
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border/30">
            <span className="text-xs font-medium text-muted-foreground">Output</span>
            <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => { navigator.clipboard.writeText(action.output ?? ''); toast.success('Copied'); }}>
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <pre className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-auto">
            {(() => { try { return JSON.stringify(JSON.parse(action.output!), null, 2); } catch { return action.output; } })()}
          </pre>
        </div>
      )}

      {!hasLogs && !action.output && !action.error_message && (
        <p className="text-sm text-muted-foreground italic py-4">
          {action.status === 'completed' || action.status === 'approved' ? 'Completed successfully.' :
           action.status === 'awaiting_approval' ? 'Waiting for review...' :
           action.status === 'executing' ? 'Running...' : `Status: ${action.status}`}
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════

export default function ExecutionDetailPage() {
  const { id } = useParams() as { id: string };
  const { selectedOrgId } = useAdminViewStore();
  const searchParams = useSearchParams();
  const initialActionId = useRef(searchParams.get('action'));

  const [tree, setTree] = useState<FullTreeNode | null>(null);
  const [loading, setLoading] = useState(true);

  // Navigation stack — array of crumbs representing where we are
  // Last crumb = current view
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);

  const loadTree = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    try {
      const data = await getFullExecutionTree(selectedOrgId, id);
      setTree(data);
      if (crumbs.length === 0) {
        // Auto-build breadcrumb from ancestors (if this is a sub-agent execution)
        // Ancestors include both execution nodes (agents) and action nodes (the sub_agent step)
        // Only include execution ancestors in the breadcrumb (not the sub_agent action nodes)
        const ancestorCrumbs: Crumb[] = (data.ancestors ?? [])
          .filter((a) => a.type !== 'action')
          .map((a) => ({
            label: a.label + (a.item_index != null ? ` #${a.item_index}` : ''),
            node: {
              type: 'execution' as const,
              id: a.id,
              label: a.label,
              status: '', started_at: '',
              item_index: a.item_index, depth: a.depth,
            },
          }));
        const initialCrumbs = [...ancestorCrumbs, { label: data.label, node: data }];
        setCrumbs(initialCrumbs);

        // If ?action= query param is set, pre-select that action
        // For sub_agent actions: open the modal. For others: drill in.
        if (initialActionId.current && data.children) {
          const matchingAction = data.children.find((a) => a.id === initialActionId.current);
          if (matchingAction) {
            if (matchingAction.action_type === 'sub_agent') {
              setSubAgentModalNode(matchingAction);
            } else {
              setCrumbs([...initialCrumbs, { label: matchingAction.label, node: matchingAction }]);
            }
          }
          initialActionId.current = null; // consume it
        }
      }
    } catch { toast.error('Failed to load execution'); }
    finally { setLoading(false); }
  }, [selectedOrgId, id]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventStream({
    topics: id ? [`run:${id}`] : [],
    enabled: !!id && !!selectedOrgId,
    onEvent: () => {
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(() => loadTree(), 300);
    },
  });

  // Sub-agent modal state
  const [subAgentModalNode, setSubAgentModalNode] = useState<FullTreeNode | null>(null);

  // Navigate INTO a node (push onto breadcrumb)
  // Sub-agent actions open a modal instead of drilling in
  const drillInto = useCallback((node: FullTreeNode) => {
    if (node.action_type === 'sub_agent') {
      setSubAgentModalNode(node);
      return;
    }
    setCrumbs((prev) => [...prev, { label: node.label, node }]);
  }, []);

  // Navigate via breadcrumb (truncate to that level)
  const navigateTo = useCallback((crumb: Crumb) => {
    setCrumbs((prev) => {
      const idx = prev.findIndex((c) => c.node.id === crumb.node.id);
      return idx >= 0 ? prev.slice(0, idx + 1) : prev;
    });
  }, []);

  // Current view = last crumb
  const current = crumbs[crumbs.length - 1]?.node ?? tree;
  const isExecution = current?.type === 'execution';
  const isAction = current?.type === 'action';
  const isSubAgent = isAction && current?.action_type === 'sub_agent';

  if (loading) {
    return <div className="flex items-center justify-center h-[80vh]"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!tree || !current) {
    return (
      <div className="p-6">
        <Link href="/agent-history" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">← Back</Link>
        <p className="text-sm text-muted-foreground">Execution not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1200px] mx-auto">

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <Breadcrumb crumbs={crumbs} currentId={id} onNavigate={navigateTo} />

      {/* ── Page header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg shrink-0 mt-0.5',
            isExecution ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-muted',
          )}>
            <NodeIcon node={current} className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{current.label}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {nodeTypeLabel(current)}
              {current.started_at && ` · ${fmtDate(current.started_at)}`}
              {current.item_index != null && ` · Item #${current.item_index}`}
              {isExecution && ` · ${id.slice(-8).toUpperCase()}`}
            </p>
          </div>
        </div>
        <SBadge status={current.status} />
      </div>

      {/* ── Summary cards (same format for everything) ─────────── */}
      <SummaryCards node={current} />

      {/* ── Error ──────────────────────────────────────────────── */}
      {current.error_message && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-words font-mono leading-relaxed">{current.error_message}</pre>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────── */}
      {/* Agent → show action list */}
      {isExecution && (current.children?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Actions</h2>
          <ActionList actions={current.children!} onSelect={drillInto} />
        </div>
      )}
      {isExecution && (current.children?.length ?? 0) === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No actions recorded.</CardContent></Card>
      )}

      {/* Regular action → show logs (sub_agent actions open modal instead, don't drill here) */}
      {isAction && !isSubAgent && (
        <div>
          <h2 className="text-sm font-semibold mb-3">Logs</h2>
          <ActionLogs action={current} orgId={selectedOrgId!} executionId={id} />
        </div>
      )}

      {/* Sub-agent picker modal */}
      <SubAgentModal
        open={!!subAgentModalNode}
        onOpenChange={(open) => { if (!open) setSubAgentModalNode(null); }}
        childNodes={subAgentModalNode?.children ?? []}
      />
    </div>
  );
}
