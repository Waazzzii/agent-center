'use client';

/**
 * ExecutionTreePanel — collapsible tree showing the full execution hierarchy:
 *   Agent → Actions → Batch Items → Sub-agent children (recursive)
 *
 * Batch items are lazy-loaded on first expand to handle 1000+ items.
 * The selected node is communicated to the parent via onSelect callback.
 */

import { useState, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2,
  PauseCircle, LogIn, Zap, GitBranch, Play, Clock, Hash,
  AlertCircle, SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActionBatchItems, type FullTreeNode } from '@/lib/api/agents';

/**
 * Cascade-skip detection: actions that were never invoked because an
 * upstream step's _status='failed' propagated to all their input items
 * get marked `status='failed'` with an error_message starting with
 * "Skipped:" by the executor (see agent-executor.service.js cascade
 * gate). Surfacing this differently from a "real" failure lets
 * operators quickly identify which row is the actual root cause.
 */
function isCascadeSkipped(node: FullTreeNode): boolean {
  return (
    node.status === 'failed' &&
    typeof node.error_message === 'string' &&
    node.error_message.startsWith('Skipped:')
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function statusDot(status: string): string {
  if (status === 'completed' || status === 'approved') return 'bg-emerald-500';
  if (status === 'failed' || status === 'aborted' || status === 'denied') return 'bg-red-500';
  if (status === 'executing') return 'bg-blue-500 animate-pulse';
  if (status === 'awaiting_approval') return 'bg-violet-500 animate-pulse';
  if (status === 'provisioning' || status === 'queued') return 'bg-amber-500';
  return 'bg-slate-400';
}

const ACTION_ICONS: Record<string, typeof Zap> = {
  agent: Zap,
  login: LogIn,
  approval: PauseCircle,
  browser_script: Play,
  sub_agent: GitBranch,
};

function NodeIcon({ node }: { node: FullTreeNode }) {
  if (node.type === 'execution') return <GitBranch className="h-3 w-3 text-blue-500 shrink-0" />;
  if (node.type === 'batch_item') return <Hash className="h-3 w-3 text-muted-foreground shrink-0" />;
  const Icon = ACTION_ICONS[node.action_type ?? ''] ?? Zap;
  return <Icon className="h-3 w-3 text-muted-foreground shrink-0" />;
}

// ─── Props ────────────────────────────────────────────────────

interface Props {
  tree: FullTreeNode;
  selectedId: string | null;
  onSelect: (node: FullTreeNode) => void;
  orgId: string;
  executionId: string;
}

// ─── Component ────────────────────────────────────────────────

export function ExecutionTreePanel({ tree, selectedId, onSelect, orgId, executionId }: Props) {
  return (
    <div className="h-full overflow-auto text-sm">
      <TreeNodeRow
        node={tree}
        depth={0}
        selectedId={selectedId}
        onSelect={onSelect}
        orgId={orgId}
        executionId={executionId}
        defaultExpanded
      />
    </div>
  );
}

// ─── Recursive tree node ─────────────────────────────────────

function TreeNodeRow({
  node, depth, selectedId, onSelect, orgId, executionId, defaultExpanded = false,
}: {
  node: FullTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: FullTreeNode) => void;
  orgId: string;
  executionId: string;
  defaultExpanded?: boolean;
}) {
  const hasChildren = (node.children && node.children.length > 0) || (node.batch_item_count ?? 0) > 0;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [batchItems, setBatchItems] = useState<FullTreeNode[] | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const isSelected = node.id === selectedId;

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!expanded && (node.batch_item_count ?? 0) > 0 && !batchItems) {
      // Lazy-load batch items on first expand
      setLoadingBatch(true);
      try {
        const res = await getActionBatchItems(orgId, executionId, node.id);
        const items: FullTreeNode[] = res.items.map((item: any) => ({
          type: 'batch_item' as const,
          id: item.id,
          label: `Item #${item.batch_item_index}`,
          status: item.status,
          started_at: item.started_at,
          completed_at: item.completed_at,
          duration_ms: item.completed_at && item.started_at
            ? new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()
            : null,
          action_type: item.action_type,
          // input is carried through so the action detail can show
          // per-iteration variables (and so the Screenshot tab can
          // surface _input_id for correlation back to source data).
          input: item.input,
          output: item.output,
          error_message: item.error_message,
          tokens_input: item.tokens_input,
          tokens_output: item.tokens_output,
          model: item.model,
          batch_item_index: item.batch_item_index,
          // Per-item screenshot URL — without this, the Screenshot tab
          // never lights up for batch_item nodes because the gating
          // boolean (hasScreenshot) reads action.screenshot_url.
          screenshot_url: item.screenshot_url ?? null,
        }));
        setBatchItems(items);
      } catch {
        // Fail silently — user can retry
      } finally {
        setLoadingBatch(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [expanded, node, batchItems, orgId, executionId]);

  const allChildren = [
    ...(node.children ?? []),
    ...(batchItems ?? []),
  ];

  const cascadeSkipped = isCascadeSkipped(node);

  return (
    <div>
      {/* Row */}
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded-sm transition-colors',
          isSelected ? 'bg-brand/10 font-medium' : 'hover:bg-muted/50',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
        // Native tooltip surfaces the cascade origin without needing
        // hover-state plumbing — operators see the chain reason on
        // hover, click to drill into the action_log row for details.
        title={cascadeSkipped && node.error_message ? node.error_message : undefined}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="p-0.5 -ml-1 rounded hover:bg-muted shrink-0"
          >
            {loadingBatch ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : expanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Status dot — failed treatment for cascade-skipped, distinct
            icon below so it reads as "skipped because upstream broke"
            not "this step itself crashed". */}
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusDot(node.status))} />

        {/* Icon — cascade-skipped overrides the action-type icon with
            a skip-forward glyph so the eye picks out which rows are
            collateral vs. the root failure. */}
        {cascadeSkipped ? (
          <SkipForward className="h-3 w-3 text-red-500 shrink-0" />
        ) : (
          <NodeIcon node={node} />
        )}

        {/* Label */}
        <span className={cn(
          'truncate flex-1 text-xs',
          cascadeSkipped && 'text-muted-foreground italic',
        )}>
          {node.label}
          {cascadeSkipped && <span className="ml-1 text-[10px] text-red-500">(skipped)</span>}
          {node.type === 'execution' && node.item_index != null && (
            <span className="text-muted-foreground ml-1">#{node.item_index}</span>
          )}
        </span>

        {/* Batch item count badge */}
        {(node.batch_item_count ?? 0) > 0 && !expanded && (
          <span className="text-[9px] text-muted-foreground bg-muted rounded px-1">
            {node.batch_item_count}
          </span>
        )}

        {/* Duration */}
        {node.duration_ms != null && (
          <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
            {fmtDuration(node.duration_ms)}
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && allChildren.length > 0 && (
        <div>
          {allChildren.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              orgId={orgId}
              executionId={executionId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
