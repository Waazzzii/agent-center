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
  AlertCircle, Copy, Hash, Bot, History, ChevronRight, ChevronLeft,
  ImageIcon, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActionBatchItems, getFullExecutionTree, type FullTreeNode } from '@/lib/api/agents';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import { LogViewer } from '@/components/execution/LogViewer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

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
  // 'skipped' covers two operator-visible cases:
  //   • Conditional-gate skip (all items gated by the step's
  //     execution_options.conditional_execution predicate)
  //   • Cascade skip (every item arrived _status='failed' from an
  //     upstream non-tolerant step)
  // Both render the same neutral gray pill; the error_message tooltip
  // names the cause. Differentiating with TWO status values would
  // bloat the enum for no behavioral gain — gate-skipped items
  // continue normally next step (item _status='completed'), cascade-
  // skipped items keep cascading (item _status='failed'), and that
  // behavioral split is enforced by item _status, not row status.
  skipped:   { dot: 'bg-slate-400', cls: 'border-slate-300 text-slate-500 dark:text-slate-400', label: 'Skipped' },
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

/**
 * Banner under each action header. Most of the time `error_message`
 * carries a real failure and gets the red treatment. But several
 * execution_options breadcrumbs ride on the same field:
 *
 *   "Conditional gate: all N item(s) gated (…)"  — gray, informational.
 *     Step row's status is 'skipped'. Operator's predicate gated every
 *     item; the next step processes them normally.
 *
 *   "Cascade: upstream step failed — …"  — gray, informational.
 *     Step row's status is 'skipped'. Every item arrived with
 *     _status='failed' from a non-tolerant upstream step; cascading
 *     continues downstream.
 *
 *   "Skipped: N cascade-failed, M gated (…)"  — gray, informational.
 *     Mixed cause — both cascade and gate contributed.
 *
 *   "Tolerated failure: <reason>"  — yellow, warning-but-not-fatal.
 *     The step threw, but the action has continue_on_failure=true so
 *     items passed through with cleared failure markers.
 *
 *   "Tolerated N per-item failure(s) (continue_on_failure)" — yellow.
 *     Step succeeded as a unit but some items inside failed; the
 *     continue_on_failure flag cleared their _status='failed' markers
 *     on items going downstream.
 *
 * Detection is a simple prefix match — the strings are constants emitted
 * by the executor (see agent-executor.service.js + execution-options.js).
 * Plain `error_message` values fall back to the original red banner.
 */
function ActionMessageBanner({ message }: { message: string }) {
  const isSkipped =
    message.startsWith('Conditional gate:') ||
    message.startsWith('Cascade:') ||
    message.startsWith('Skipped:') ||
    message.startsWith('Partition:');
  const isTolerated = message.startsWith('Tolerated ');

  if (isSkipped) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 p-3 flex items-start gap-2">
        <PauseCircle className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
        <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words font-mono leading-relaxed">{message}</pre>
      </div>
    );
  }
  if (isTolerated) {
    return (
      <div className="rounded-lg border border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20 p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
        <pre className="text-xs text-yellow-700 dark:text-yellow-400 whitespace-pre-wrap break-words font-mono leading-relaxed">{message}</pre>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
      <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-words font-mono leading-relaxed">{message}</pre>
    </div>
  );
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

// Color treatment per action type — kept in sync with the agent editor's
// step cards so operators see the same hue for the same action kind in
// both places. Five distinct hues so the action list reads at a glance.
const ACTION_TYPE_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  approval:       { bg: 'bg-orange-100 dark:bg-orange-900/30', fg: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200/60 dark:border-orange-800/40 hover:border-orange-300 hover:bg-orange-50/30 dark:hover:bg-orange-950/10' },
  login:          { bg: 'bg-sky-100 dark:bg-sky-900/30',       fg: 'text-sky-700 dark:text-sky-400',       border: 'border-sky-200/60 dark:border-sky-800/40 hover:border-sky-300 hover:bg-sky-50/30 dark:hover:bg-sky-950/10' },
  browser_script: { bg: 'bg-violet-100 dark:bg-violet-900/30', fg: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200/60 dark:border-violet-800/40 hover:border-violet-300 hover:bg-violet-50/30 dark:hover:bg-violet-950/10' },
  sub_agent:      { bg: 'bg-amber-100 dark:bg-amber-900/30',   fg: 'text-amber-700 dark:text-amber-400',   border: 'border-amber-200/60 dark:border-amber-800/40 hover:border-amber-300 hover:bg-amber-50/30 dark:hover:bg-amber-950/10' },
  agent:          { bg: 'bg-blue-100 dark:bg-blue-900/30',     fg: 'text-blue-700 dark:text-blue-400',     border: 'border-blue-200/60 dark:border-blue-800/40 hover:border-blue-300 hover:bg-blue-50/30 dark:hover:bg-blue-950/10' },
};
const ACTION_TYPE_FALLBACK = { bg: 'bg-muted/60', fg: 'text-muted-foreground', border: 'border-border/50 hover:border-border hover:bg-muted/20' };

function ActionList({ actions, onSelect }: { actions: FullTreeNode[]; onSelect: (a: FullTreeNode) => void }) {
  return (
    <div className="space-y-1">
      {actions.map((action, i) => {
        const Icon = action.action_type === 'sub_agent' ? GitBranch : ICONS[action.action_type ?? ''] ?? Zap;
        const isSub = action.action_type === 'sub_agent';
        const childExecs = action.children?.filter((c) => c.type === 'execution') ?? [];
        const style = ACTION_TYPE_STYLES[action.action_type ?? ''] ?? ACTION_TYPE_FALLBACK;

        return (
          <button
            key={action.id}
            onClick={() => onSelect(action)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all',
              style.border,
            )}
          >
            <div className={cn('p-1.5 rounded-md shrink-0', style.bg)}>
              <Icon className={cn('h-4 w-4', style.fg)} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Dot status={action.status} />
                <span className="text-sm font-medium truncate">
                  {/* Sub-agent actions: show the target agent's name from the first child execution */}
                  {isSub && childExecs.length > 0 ? childExecs[0].agent_name ?? childExecs[0].label : action.label}
                </span>
                <SBadge status={action.status} />
                {/* Execution-options breadcrumbs — small chip when the
                    action_log error_message indicates the step was
                    skipped or had its failure tolerated by
                    continue_on_failure. Lets the operator distinguish
                    "actually completed" from "completed via gate" at a
                    glance. Cause-specific chip text reveals whether
                    skip was conditional or cascade. */}
                {action.error_message?.startsWith('Conditional gate:') && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-400 text-slate-600 dark:text-slate-400" title={action.error_message}>
                    Gated
                  </Badge>
                )}
                {action.error_message?.startsWith('Cascade:') && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-400 text-slate-600 dark:text-slate-400" title={action.error_message}>
                    Cascade
                  </Badge>
                )}
                {action.error_message?.startsWith('Skipped:') && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-400 text-slate-600 dark:text-slate-400" title={action.error_message}>
                    Skipped
                  </Badge>
                )}
                {action.error_message?.includes('Partition:') && !action.error_message?.startsWith('Partition:') && (
                  // Mixed-partition row — overall status is completed/failed
                  // but some items were gated or cascaded. The breadcrumb is
                  // appended to whatever the handler wrote, so we match
                  // `includes()` rather than `startsWith()`.
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-400 text-slate-600 dark:text-slate-400" title={action.error_message}>
                    Partial
                  </Badge>
                )}
                {action.error_message?.startsWith('Partition:') && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-slate-400 text-slate-600 dark:text-slate-400" title={action.error_message}>
                    Partial
                  </Badge>
                )}
                {action.error_message?.startsWith('Tolerated ') && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-yellow-400 text-yellow-600 dark:text-yellow-400" title={action.error_message}>
                    Tolerated
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{AT[action.action_type ?? ''] ?? action.action_type}</span>
                <span className="tabular-nums">{fmtDur(action.duration_ms)}</span>
                {(action.tokens_input ?? 0) > 0 && <span className="tabular-nums">{fmtTokens(action.tokens_input)} / {fmtTokens(action.tokens_output)}</span>}
                {isSub && childExecs.length > 0 && <span className="text-amber-700 dark:text-amber-400">{childExecs.length} run{childExecs.length !== 1 ? 's' : ''}</span>}
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

/**
 * Tabbed payload viewer used inside the Input / Output / Logs tabs. Pretty-
 * prints JSON-shaped strings, falls back to raw text, shows an italic empty-
 * state line when there's no value. Copy button only renders when there's
 * actually something to copy.
 *
 * Sized to match the previous 3-column layout (~28rem) so the action detail
 * region keeps a stable footprint regardless of which tab is active.
 */
function PayloadView({
  value,
  empty,
}: {
  value: string | null | undefined;
  empty: string;
}) {
  const pretty = useMemo(() => {
    if (!value) return null;
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }, [value]);

  if (!pretty) {
    return (
      <div className="rounded-lg border border-border/50 bg-card px-4 py-6">
        <p className="text-xs text-muted-foreground italic">{empty}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-lg border border-border/50 overflow-hidden min-h-0 h-[28rem]">
      <div className="flex items-center justify-end px-3 py-1.5 bg-muted/20 border-b border-border/30 shrink-0">
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => { navigator.clipboard.writeText(pretty); toast.success('Copied'); }}
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed overflow-auto flex-1 min-h-0">
        {pretty}
      </pre>
    </div>
  );
}

/**
 * Screenshot tab — shows a click-to-zoom thumbnail of the page state
 * captured during the action. Populated for browser_script and login
 * (auto-login) actions by the screenshot upload pipeline; null for
 * AI-only steps, approvals, etc.
 *
 * Two-level rendering:
 *   1. Inline thumbnail at modest size (h-[28rem] container) so the
 *      operator gets the gist without leaving the tab.
 *   2. Click → modal at near-full-screen so they can read URLs in the
 *      address bar, error messages, form field labels, etc.
 *
 * URL note: signed GCS URLs have a ~7-day TTL. Older runs may return
 * 403; we render an `<img>` so the browser handles that naturally
 * (broken image icon). A more polished version would detect onError
 * and show a "screenshot expired" placeholder, but the broken image
 * is already a clear-enough affordance that the operator knows to
 * look elsewhere.
 */
/**
 * Multi-screenshot gallery — used when a batch action has per-iteration
 * screenshots. Left/right nav cycles through the set; the metadata strip
 * surfaces _input_id (the batch correlation id, set on each item's
 * input) so operators can tie a screenshot back to a specific row in
 * their source data without leaving the modal.
 *
 * Each shot still reuses the same enlarge-on-click + open-original
 * affordances as the single-image ScreenshotPanel, just wrapped in a
 * controlled carousel.
 */
type GalleryShot = {
  /** Per-item action_log id — used as React key. */
  id: string;
  /** Signed GCS URL. 7-day TTL — see ScreenshotPanel doc comment. */
  url: string;
  /** batch_item_index, 0-based. Drives the "N of M" label. */
  index: number;
  /** _input_id from the per-item input row, when the agent's input
   *  format included one. Surfaces in the metadata strip so operators
   *  can correlate to source data / logs. */
  inputId: string | null;
};

function ScreenshotGallery({
  shots,
  actionLabel,
}: {
  shots: GalleryShot[];
  actionLabel: string;
}) {
  const [cursor, setCursor] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const total = shots.length;
  // Clamp on shrinking sets (rare, but safe under realtime updates).
  const safeCursor = Math.min(cursor, Math.max(0, total - 1));
  const current = shots[safeCursor];

  // Keyboard navigation — arrows step through the carousel anywhere
  // (including inside the zoom modal, since both share this handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (total <= 1) return;
      if (e.key === 'ArrowLeft')  setCursor((c) => (c <= 0 ? total - 1 : c - 1));
      if (e.key === 'ArrowRight') setCursor((c) => (c >= total - 1 ? 0 : c + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  if (total === 0 || !current) {
    return (
      <div className="rounded-lg border border-border/50 bg-card px-4 py-6">
        <p className="text-xs text-muted-foreground italic">No screenshots captured for this batch.</p>
      </div>
    );
  }

  const captionLabel = current.inputId
    ? `Input ${current.inputId}`
    : `Item #${current.index}`;
  const fullLabel = `${actionLabel} — ${captionLabel}`;

  return (
    <>
      <div className="flex flex-col rounded-lg border border-border/50 overflow-hidden h-[28rem] bg-card">
        {/* Toolbar — preset chips, position, open-original link */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/20 border-b border-border/30 shrink-0 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2 min-w-0">
            <span className="tabular-nums shrink-0">{safeCursor + 1} / {total}</span>
            <span className="truncate font-mono text-foreground/80" title={captionLabel}>
              {captionLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span>Click to enlarge</span>
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" /> Open original
            </a>
          </div>
        </div>

        {/* Image + side nav buttons */}
        <div className="relative flex-1 min-h-0 overflow-hidden bg-muted/10">
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center p-2 hover:bg-muted/20 transition-colors"
            onClick={() => setZoomOpen(true)}
            aria-label="Enlarge screenshot"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={current.url}
              alt={`Screenshot ${captionLabel}`}
              className="max-w-full max-h-full object-contain"
            />
          </button>

          {total > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCursor((c) => (c <= 0 ? total - 1 : c - 1));
                }}
                className="absolute left-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/85 border border-border/60 shadow flex items-center justify-center hover:bg-background"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCursor((c) => (c >= total - 1 ? 0 : c + 1));
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/85 border border-border/60 shadow flex items-center justify-center hover:bg-background"
                aria-label="Next screenshot"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] p-2 sm:p-4">
          <DialogHeader className="px-2 pt-1">
            <DialogTitle className="text-sm font-medium truncate flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              <span className="truncate">{fullLabel}</span>
              <span className="ml-2 text-[10px] font-normal text-muted-foreground tabular-nums">
                {safeCursor + 1} / {total}
              </span>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] font-normal text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> Open original
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(95vh-4rem)] bg-muted/10 rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.id}
              src={current.url}
              alt={`Screenshot ${captionLabel}`}
              className="w-full h-auto"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ScreenshotPanel({ url, actionLabel }: { url: string; actionLabel: string }) {
  const [zoomOpen, setZoomOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col rounded-lg border border-border/50 overflow-hidden h-[28rem] bg-card">
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/20 border-b border-border/30 shrink-0 text-[10px] text-muted-foreground">
          <span>Click to enlarge</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" /> Open original
          </a>
        </div>
        <button
          type="button"
          className="flex-1 min-h-0 overflow-hidden bg-muted/10 hover:bg-muted/20 transition-colors p-2"
          onClick={() => setZoomOpen(true)}
          aria-label="Enlarge screenshot"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Screenshot from ${actionLabel}`}
            className="w-full h-full object-contain"
          />
        </button>
      </div>
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] p-2 sm:p-4">
          <DialogHeader className="px-2 pt-1">
            <DialogTitle className="text-sm font-medium truncate flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              <span className="truncate">{actionLabel}</span>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-[10px] font-normal text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> Open original
              </a>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[calc(95vh-4rem)] bg-muted/10 rounded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Screenshot from ${actionLabel}`}
              className="w-full h-auto"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Action detail viewer.  Every action type renders the same three-tab
 * layout — Input / Output / Logs — so operators get a consistent
 * triage experience regardless of whether the step is an AI prompt, a
 * browser script, a login, or an approval.
 *
 * Tabs always present, even when empty:
 *   • Input  — accumulated context the step received (snapshot at run
 *              time). Empty for steps that ran before context capture
 *              landed; for HITL pauses the input was captured before
 *              the pause so it's there even when output isn't.
 *   • Output — the step's emitted output. For login it's
 *              `logged_in:<sessionId>` or the HITL note; for approval
 *              it's the resolved instructions text or the approver's
 *              note; for AI / browser_script it's the JSON return value.
 *              When still running / waiting, a status-aware empty
 *              message replaces it.
 *   • Logs   — the LogViewer step stream (Anthropic SDK init →
 *              tool_use → tool_result → text → result). Only AI steps
 *              and browser scripts emit these; login / approval show
 *              an explanatory empty message so the tab isn't surprising
 *              when it's blank.
 *
 * Sub-agent actions never reach this component — they open a modal
 * picker from the parent action list.
 */
function ActionLogs({ action, orgId, executionId }: { action: FullTreeNode; orgId: string; executionId: string }) {
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [loadingSteps, setLoadingSteps] = useState(false);
  // AI steps, browser scripts, AND login steps emit log rows.
  // - AI steps + browser_script: tool_use / text / result rows from the SDK driver.
  // - Login: runPromptAction (the AI verify) records its tool_use / text rows
  //   AND the executor's runVerify helper bookends each verify pass with
  //   verify_attempt / verify_result init/result rows; the auto-login linked
  //   script run records its own init / result around the credential fill.
  //   These are what the "Logs" tab on a login step shows operators when
  //   triaging "why did the agent ask for HITL but the standalone test says
  //   I'm logged in?" — the verify_result row carries the AI's
  //   verified=true/false call so the divergence is visible.
  // Approval is the only action type that never emits steps (it's pure HITL,
  // no AI calls), so it stays excluded.
  const hasLogs =
    action.action_type === 'agent' ||
    action.action_type === 'browser_script' ||
    action.action_type === 'login';

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
  // Versioned polling (5s while visible) — refetch the step log when the
  // run's topic version moves. Replaces the parked SSE stream.
  useTopicVersions({
    topics: executionId ? [`run:${executionId}`] : [],
    enabled: !!executionId && hasLogs,
    onChange: () => {
      if (stepsRefresh.current) clearTimeout(stepsRefresh.current);
      stepsRefresh.current = setTimeout(() => loadSteps(), 200);
    },
  });

  // Action-type-aware empty copy. Tabs render even when there's
  // nothing to show — the empty state explains why so an operator
  // doesn't think the UI is broken.
  const outputEmpty =
    action.status === 'executing'      ? 'Still running…' :
    action.status === 'awaiting_approval'
      ? (action.action_type === 'approval' ? 'Waiting for approval.' :
         action.action_type === 'login'    ? 'Waiting for the user to complete the login.' :
         'Paused for review.')
      : action.status === 'failed' || action.status === 'aborted'
        ? 'Step did not complete — see the error above.'
        : action.action_type === 'login'    ? 'Login verified; no output to return.' :
          action.action_type === 'approval' ? 'No output recorded for this approval.' :
          'No output emitted.';

  const logsEmpty =
    action.action_type === 'approval' ? 'Approval steps do not emit logs.' :
    'No log entries recorded.';

  // Screenshot tab gating + data prep.
  //
  // Three cases:
  //   1. Non-batch action with screenshot_url → single image view.
  //   2. Batch parent (batch_item_count > 0) → fetch per-item rows and
  //      render a gallery cycling through every captured shot. We light
  //      the tab even when the parent action_log itself has no
  //      screenshot_url (batches don't capture an aggregate shot — only
  //      per-item ones).
  //   3. Batch item (one of the children) → its own single shot via
  //      case 1.
  //
  // The fetch is gated by tab activation (state in `screenshotTab` so
  // we don't spam the API on every render). Same `getActionBatchItems`
  // endpoint the tree expansion uses — request shape mirrors there.
  const isBatchParent = (action.batch_item_count ?? 0) > 0;
  const hasScreenshot = !!action.screenshot_url || isBatchParent;
  const [batchShots, setBatchShots] = useState<GalleryShot[] | null>(null);
  const [batchShotsLoading, setBatchShotsLoading] = useState(false);

  useEffect(() => {
    // Clear when switching to a different action so we don't flash stale
    // shots from the previous selection.
    setBatchShots(null);
    setBatchShotsLoading(false);
  }, [action.id]);

  // Lazy-load batch screenshots the first time the tab needs them.
  // Triggered when `isBatchParent && batchShots === null` and the
  // Screenshot tab content actually mounts (TabsContent only renders
  // its children when active in shadcn's Radix-backed Tabs). We
  // duplicate the effect's trigger in `loadBatchShots` so a tab change
  // re-checks rather than relying on a fragile mount hook.
  const loadBatchShots = useCallback(async () => {
    if (!isBatchParent || batchShots !== null || batchShotsLoading) return;
    if (!orgId || !executionId) return;
    setBatchShotsLoading(true);
    try {
      const res = await getActionBatchItems(orgId, executionId, action.id);
      const shots: GalleryShot[] = res.items
        .filter((item) => typeof item.screenshot_url === 'string' && item.screenshot_url)
        .map((item) => {
          // _input_id comes off the per-item input JSON. The structure is
          // `[{ _input_id, ...sourceFields }]` (single-element array per
          // batch iteration — see agent-executor's per-item flow). We
          // parse defensively because input is TEXT in the DB and might
          // not always be valid JSON for legacy rows.
          let inputId: string | null = null;
          if (item.input) {
            try {
              const parsed = typeof item.input === 'string' ? JSON.parse(item.input) : item.input;
              const first = Array.isArray(parsed) ? parsed[0] : parsed;
              if (first && typeof first === 'object' && '_input_id' in first) {
                const v = (first as Record<string, unknown>)._input_id;
                if (typeof v === 'string' || typeof v === 'number') inputId = String(v);
              }
            } catch { /* ignore malformed input */ }
          }
          return {
            id: item.id,
            url: item.screenshot_url as string,
            index: item.batch_item_index ?? 0,
            inputId,
          };
        })
        .sort((a, b) => a.index - b.index);
      setBatchShots(shots);
    } catch {
      // Silent — operator can switch tabs and back to retry.
      setBatchShots([]);
    } finally {
      setBatchShotsLoading(false);
    }
  }, [isBatchParent, batchShots, batchShotsLoading, orgId, executionId, action.id]);

  return (
    <div className="space-y-3">
      {action.error_message && <ActionMessageBanner message={action.error_message} />}

      <Tabs defaultValue="input">
        <TabsList variant="line">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="logs">
            Logs
            {hasLogs && steps.length > 0 && (
              <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                {steps.length}
              </span>
            )}
          </TabsTrigger>
          {hasScreenshot && (
            <TabsTrigger value="screenshot">
              <ImageIcon className="h-3 w-3 mr-1" />
              Screenshot
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="input">
          <PayloadView
            value={action.input}
            empty="No input recorded for this step."
          />
        </TabsContent>

        <TabsContent value="output">
          <PayloadView value={action.output} empty={outputEmpty} />
        </TabsContent>

        <TabsContent value="logs">
          {hasLogs ? (
            <div className="flex flex-col rounded-lg border border-border/50 overflow-hidden h-[28rem]">
              <div className="flex-1 min-h-0 overflow-auto">
                <LogViewer steps={steps} loading={loadingSteps} />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-card px-4 py-6">
              <p className="text-xs text-muted-foreground italic">{logsEmpty}</p>
            </div>
          )}
        </TabsContent>

        {hasScreenshot && (
          <TabsContent
            value="screenshot"
            // Lazy-load batch shots on first activation of this tab.
            // Radix only renders TabsContent when active, so this hook
            // fires exactly when the gallery becomes visible.
            onFocus={loadBatchShots}
            onMouseEnter={loadBatchShots}
          >
            {isBatchParent ? (
              batchShotsLoading ? (
                <div className="flex items-center justify-center h-[28rem] rounded-lg border border-border/50 bg-card">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : batchShots && batchShots.length > 0 ? (
                <ScreenshotGallery shots={batchShots} actionLabel={action.label} />
              ) : batchShots && batchShots.length === 0 ? (
                <div className="rounded-lg border border-border/50 bg-card px-4 py-6">
                  <p className="text-xs text-muted-foreground italic">
                    No screenshots captured for the items in this batch.
                  </p>
                </div>
              ) : (
                // batchShots === null and not loading — kick the fetch
                // on next render (clicking the tab triggers onMouseEnter).
                <div className="flex items-center justify-center h-[28rem] rounded-lg border border-border/50 bg-card">
                  <button
                    type="button"
                    onClick={loadBatchShots}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    Load screenshots
                  </button>
                </div>
              )
            ) : (
              action.screenshot_url && (
                <ScreenshotPanel url={action.screenshot_url} actionLabel={action.label} />
              )
            )}
          </TabsContent>
        )}
      </Tabs>
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

  // Index nodes by id across a freshly-fetched tree so we can re-resolve
  // existing crumbs against live data without changing their identity.
  // The crumb's `.node` reference gets refreshed in place, so the action
  // currently being viewed picks up status/output updates from SSE refreshes
  // without re-mounting (which would otherwise reset tabs, scroll, etc.).
  const indexTreeById = useCallback((root: FullTreeNode | null): Map<string, FullTreeNode> => {
    const map = new Map<string, FullTreeNode>();
    const walk = (n: FullTreeNode) => {
      if (!n?.id) return;
      map.set(n.id, n);
      for (const c of n.children ?? []) walk(c);
    };
    if (root) walk(root);
    return map;
  }, []);

  const loadTree = useCallback(async () => {
    if (!selectedOrgId || !id) return;
    try {
      const data = await getFullExecutionTree(selectedOrgId, id);
      setTree(data);

      // Refresh crumb references in place so the current view gets the
      // latest data, but DON'T reset position — that's the bug that
      // kicked operators back to the root view every time SSE fired.
      //
      // Two cases handled inside the functional setter:
      //   1. crumbs is empty → first load. Build the initial chain from
      //      ancestors + the just-fetched root, optionally drill into
      //      the ?action= query param.
      //   2. crumbs is non-empty → a refresh. Re-resolve each crumb's
      //      node from the new tree by id (so status, output, etc. stay
      //      live), but keep the crumb chain order/length intact.
      //
      // We use the functional setCrumbs form because the useCallback
      // closure-captured `crumbs` would otherwise be stale across SSE
      // refreshes (deps are [selectedOrgId, id]) — that stale `[]` was
      // the trigger for the re-init on every event.
      const treeIndex = indexTreeById(data);

      setCrumbs((prev) => {
        if (prev.length > 0) {
          // Refresh-in-place — same crumb chain, fresh node references.
          // If a crumb's node no longer exists in the new tree (rare —
          // a deleted action), keep the old reference so the user
          // doesn't get rug-pulled mid-view.
          return prev.map((c) => {
            const fresh = treeIndex.get(c.node.id);
            return fresh ? { ...c, node: fresh } : c;
          });
        }

        // First load — auto-build breadcrumb from ancestors (if this
        // is a sub-agent execution). Ancestors include both execution
        // nodes (agents) and action nodes (the sub_agent step). Only
        // include execution ancestors in the breadcrumb (not the
        // sub_agent action nodes).
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

        // If ?action= query param is set, pre-select that action.
        // For sub_agent actions: open the modal (handled below — modal
        // setter is outside the functional updater since it touches
        // a different piece of state). For others: append to crumbs.
        if (initialActionId.current && data.children) {
          const matchingAction = data.children.find((a) => a.id === initialActionId.current);
          if (matchingAction) {
            initialActionId.current = null;
            if (matchingAction.action_type === 'sub_agent') {
              // Defer modal open so we don't trigger a setState mid-setter
              queueMicrotask(() => setSubAgentModalNode(matchingAction));
              return initialCrumbs;
            }
            return [...initialCrumbs, { label: matchingAction.label, node: matchingAction }];
          }
          initialActionId.current = null;
        }
        return initialCrumbs;
      });
    } catch { toast.error('Failed to load execution'); }
    finally { setLoading(false); }
  }, [selectedOrgId, id, indexTreeById]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Versioned polling (5s while visible) — refresh the execution tree
  // when the run's topic version moves.
  useTopicVersions({
    topics: id ? [`run:${id}`] : [],
    enabled: !!id && !!selectedOrgId,
    onChange: () => {
      if (refreshRef.current) clearTimeout(refreshRef.current);
      refreshRef.current = setTimeout(() => loadTree(), 200);
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

      {/* ── Error / breadcrumb message ──────────────────────────── */}
      {current.error_message && <ActionMessageBanner message={current.error_message} />}

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
