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
import { isInertLoginRow } from '@/lib/api/agents';
import { TokenUsage } from '@/components/execution/TokenUsage';
import { Button } from '@/components/ui/button';
import { PageHeader, MetaSep } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/execution/status';
import { StepTypeIcon, stepTypeDef } from '@/components/execution/step-types';
import { JsonHighlight, isJsonText } from '@/components/execution/JsonHighlight';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Loader2, GitBranch, PauseCircle,
  AlertCircle, Copy, Hash, Bot, ChevronRight, ChevronLeft, Gavel,
  ImageIcon, ExternalLink, ChevronDown, ChevronUp, LogIn,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActionBatchItems, getFullExecutionTree, type FullTreeNode } from '@/lib/api/agents';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import { LogViewer } from '@/components/execution/LogViewer';
import { Tabs, TabsList, TabsTrigger, TabsContent, TabsCount, TabsPanel } from '@/components/ui/tabs';
import { RunTimeline, Zone, RunRow, TriggerZone, StepsZone, OutcomeZone, FailureSummary, readOutcome } from '@/components/execution/RunTimeline';

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
 *   "Tolerated failure: …" / "Tolerated N per-item failure(s) …"  — HISTORICAL.
 *     Written by the removed continue_on_failure flag, which swallowed a
 *     step's error and passed its items on as though they had succeeded.
 *     No new run produces these; they survive on rows from before the
 *     removal, so the strings are documented here and nowhere else.
 *
 *   "Waiting for …"  — yellow, and TEMPORARY. A RUN-level queue reason
 *     ("Waiting for a free browser slot"): every browser the run could use
 *     is busy, so it is queued. The executor clears it when the run starts
 *     again, and the page hides it on any run no longer queued — older rows
 *     kept it after they ran, which read as a failure on a finished run.
 *
 *   "Paused — …"  — yellow, and TEMPORARY.
 *     The script's login_indicator failed and the sign-in it needs is
 *     either held by another run or waiting on a person. Nothing has
 *     failed: the executor clears this field when the step resumes, so
 *     the banner disappears on its own and a step that goes on to finish
 *     shows no trace of having waited. Red would be wrong twice over —
 *     it did not fail, and it is not over.
 *
 * Detection is a simple prefix match — the strings are constants emitted
 * by the executor (see agent-executor.service.js + execution-options.js).
 * Plain `error_message` values fall back to the original red banner.
 */
/**
 * The way out of a sign-in pause, shown where the pause is.
 *
 * A run parked on a login said so — "Paused — COPS Login is being signed in
 * by another run" — and left finding the login to the reader, several pages
 * away. The recovery is one click from here instead: the login's Credentials
 * tab, where the stepper shows which browser is signed out and Log In fixes
 * it. Finishing that sign-in resumes every run waiting on the login, this one
 * included.
 */
function SignInRecovery({ step }: { step: FullTreeNode }) {
  if (!step.login_id) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning-soft/60 p-3">
      <LogIn className="h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-medium text-foreground">
          Waiting for a sign-in to {step.login_name ?? 'its login'}
        </span>
        <span className="block text-muted-foreground">
          Signing in there resumes this run and every other run waiting on it.
        </span>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 text-xs">
        <Link href={`/actions/logins/${step.login_id}?tab=credentials`}>
          Open {step.login_name ?? 'login'}
        </Link>
      </Button>
    </div>
  );
}

function ActionMessageBanner({ message }: { message: string }) {
  // COLLAPSED TO THE FIRST LINE, expandable.
  //
  // A Playwright failure carries its whole call log in `message` — the retry
  // ladder, every "waiting for element to be visible", the full element markup.
  // Forty-odd lines, rendered in full, filled the viewport and pushed the
  // Input/Output/Logs tabs off screen on exactly the runs an operator opens
  // this page to read.
  //
  // The first line is the diagnosis and the rest is evidence, which is why the
  // split is at the first newline rather than a character count. Since
  // annotateStepFailure now prefixes agent-run failures with
  // `Step N of M — "name" (action):`, that one line answers both "what broke"
  // and "where" without expanding anything.
  //
  // The breadcrumb variants (gate / cascade / skipped / tolerated) are almost
  // always single-line, so they get no toggle and look exactly as before.
  const [expanded, setExpanded] = useState(false);

  // Collapse again when drilling into a different action. The component keeps
  // its position in the tree, so without this an expanded trace stays expanded
  // over the next action's message.
  useEffect(() => { setExpanded(false); }, [message]);

  const isSkipped =
    message.startsWith('Conditional gate:') ||
    message.startsWith('Cascade:') ||
    message.startsWith('Skipped:') ||
    message.startsWith('Partition:');
  // Waiting, not broken. Shares the yellow treatment with the tolerated
  // variants because it is the same claim: worth seeing, not a failure.
  const isTolerated =
    message.startsWith('Tolerated ') || message.startsWith('Paused — ') || message.startsWith('Waiting for ');

  const tone = isSkipped
    ? {
        box: 'border-border bg-muted/40',
        text: 'text-muted-foreground',
        icon: <PauseCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />,
      }
    : isTolerated
      ? {
          box: 'border-warning/30 bg-warning-soft/60',
          text: 'text-warning',
          icon: <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />,
        }
      : {
          box: 'border-danger/30 bg-danger-soft/60',
          text: 'text-danger',
          icon: <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />,
        };

  const lines = message.split('\n');
  const head = lines[0];
  const rest = lines.slice(1).join('\n').replace(/\s+$/, '');
  const hiddenCount = rest ? lines.length - 1 : 0;

  return (
    <div className={cn('rounded-lg border p-3 flex items-start gap-2', tone.box)}>
      {tone.icon}
      {/* min-w-0 so a long unbroken selector wraps instead of stretching the
          flex row past the card. */}
      <div className="min-w-0 flex-1">
        <pre className={cn('text-xs whitespace-pre-wrap break-words font-mono leading-relaxed', tone.text)}>
          {head}
        </pre>

        {hiddenCount > 0 && expanded && (
          // Capped and scrollable: expanding a 200-line trace should not put
          // the page back where it started.
          <pre className={cn(
            'mt-2 text-xs whitespace-pre-wrap break-words font-mono leading-relaxed',
            'max-h-80 overflow-auto opacity-90',
            tone.text,
          )}>
            {rest}
          </pre>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              'mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium',
              'underline decoration-dotted underline-offset-2 hover:no-underline',
              tone.text,
            )}
          >
            {expanded ? (
              <><ChevronUp className="h-3 w-3" /> Show less</>
            ) : (
              <><ChevronDown className="h-3 w-3" /> Show {hiddenCount} more line{hiddenCount === 1 ? '' : 's'}</>
            )}
          </button>
        )}
      </div>

      {/* The full text, always copyable — the collapsed view is for reading,
          but pasting a trace into a ticket must not require expanding it. */}
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(message).then(
            () => toast.success('Message copied'),
            () => toast.error('Could not copy'),
          );
        }}
        title="Copy the full message"
        className={cn('shrink-0 mt-0.5 opacity-50 hover:opacity-100 transition-opacity', tone.text)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function nodeTypeLabel(node: FullTreeNode): string {
  if (node.type === 'execution') {
    return (node.depth ?? 0) > 0 ? 'Sub Agent' : 'Agent';
  }
  if (node.type === 'batch_item') return `Batch Item #${node.batch_item_index ?? '?'}`;
  if (node.action_type === 'outcome') return 'On completion';
  return node.action_type ? stepTypeDef(node.action_type).label : 'Action';
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
// Zones — the run detail mirrors the agent editor
// ═══════════════════════════════════════════════════════════════
//
// agent_action_log holds two different kinds of thing: STEPS the routine
// declares, and EVENTS that happened as a consequence. Rendering both as one
// flat "Actions" list made a two-step agent read as seven actions, because
// five on-completion rules each wrote their own row — and the count card
// agreed with the list rather than with the routine.
//
// So the run is split the way the editor already splits it: steps, then the
// On completion bookend. A row that produced its own separate record shows
// that record NESTED underneath it, never as a sibling:
//
//   sub_agent step  → its child runs      (already nested by the tree builder)
//   browser_script  → the login it ran as (its own log, drillable)
//   on completion   → the desk each rule raised
//
// One rule, three cases, and the step count finally means steps.

interface RunZones {
  steps: FullTreeNode[];
  outcomes: FullTreeNode[];
  /** Logins nested under the step they authenticated, keyed by that step's id. */
  loginsFor: Map<string, FullTreeNode[]>;
}

function runZones(children: FullTreeNode[] | undefined): RunZones {
  const rows = children ?? [];
  const outcomes = rows.filter((r) => r.action_type === 'outcome');
  const rest = rows.filter((r) => r.action_type !== 'outcome');

  // A login sits at its own order_index immediately before the browser_script
  // it signs in for. Nesting it there answers "which identity did this run
  // as" without spending a top-level row on plumbing.
  //
  // It used to be dropped outright when it succeeded (isInertLoginRow), so a
  // successful sign-in left no trace at all — fine until you need to know
  // which account touched the account.
  const loginsFor = new Map<string, FullTreeNode[]>();
  const nested = new Set<string>();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].action_type !== 'login') continue;
    const host = rest.slice(i + 1).find((r) => r.action_type === 'browser_script');
    // No following browser_script — the login IS the last thing that
    // happened, usually because the run died on it. It stays a step of its
    // own rather than being hidden under something that never ran.
    if (!host) continue;
    nested.add(rest[i].id);
    loginsFor.set(host.id, [...(loginsFor.get(host.id) ?? []), rest[i]]);
  }

  return { steps: rest.filter((r) => !nested.has(r.id)), outcomes, loginsFor };
}

// ═══════════════════════════════════════════════════════════════
// Summary Cards — identical format for agents AND actions
// ═══════════════════════════════════════════════════════════════

function SummaryCards({ node }: { node: FullTreeNode }) {
  const isExec = node.type === 'execution';
  // STEPS ONLY — the same list rendered below, so the card and the page agree.
  // On-completion rows are excluded because they are not steps: five rules
  // firing made a two-step routine report "7/7", which is a true count of
  // table rows and a false one of everything the operator recognises.
  //
  // The denominator includes the routine's declared-but-never-reached steps
  // (status 'not_run', synthesised server-side), so a run that died on step 2
  // of 6 reads "1/6" against six listed rows rather than "1/2".
  const children = isExec ? runZones(node.children).steps : (node.children ?? []);

  // Per-run cost is no longer shown here — dollars live on Billing & Usage
  // (aggregated from Anthropic's Cost API). Here we show token usage only.
  // Prompt tokens = fresh input + cache read + cache write.
  //
  // `tokens_input` on its own is the UNCACHED remainder. Prompt caching is on,
  // so nearly the whole prompt is billed as cache_read (or cache_write on the
  // first call) and this column legitimately reports 3 or 9 against a prompt of
  // 90,000. The card used to print that number as "in", which read as a bug in
  // the accounting when it was really the wrong column.
  const sum = (pick: (n: FullTreeNode) => number) =>
    isExec ? children.reduce((acc, a) => acc + pick(a), 0) : pick(node);
  const tokens = {
    fresh:      sum((n) => n.tokens_input ?? 0),
    cacheRead:  sum((n) => n.tokens_cache_read ?? 0),
    cacheWrite: sum((n) => n.tokens_cache_write ?? 0),
    output:     sum((n) => n.tokens_output ?? 0),
  };
  const completedCount = isExec
    ? children.filter((a) => a.status === 'completed' || a.status === 'approved').length
    : undefined;

  return (
    // No Status tile: the status is the badge beside the title. It used to
    // appear three times on one screen — header corner, this tile, the step.
    // Two columns on a phone; an odd last tile spans both so nothing is
    // orphaned beside an empty cell. Three across from md.
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 [&>*:last-child:nth-child(odd)]:col-span-2 md:[&>*:last-child:nth-child(odd)]:col-span-1">
      <SummaryCard label="Duration" value={fmtDur(node.duration_ms)} />
      {isExec && (
        <SummaryCard label="Steps">
          {/* No bar here — the list below IS the detail, step by step, so a
              second rendering of the same fraction is noise. The bar lives on
              the history list, where there is no step list to read. */}
          <span className="tabular-nums">
            {completedCount}
            <span className="text-sm font-normal text-muted-foreground"> of {children.length} completed</span>
          </span>
        </SummaryCard>
      )}
      {!isExec && node.model && <SummaryCard label="Model" value={node.model.replace('claude-', '')} mono />}
      {/* Labelled in/out — "107K / 2.0K" with no legend is two numbers and a
          guess. TokenUsage's tooltip splits the prompt into cached vs fresh
          and says where dollars actually live. */}
      <SummaryCard label="Tokens in / out">
        <TokenUsage tokens={tokens} />
      </SummaryCard>
    </div>
  );
}

function SummaryCard({ label, value, accent, mono, children: ch }: {
  label: string; value?: string; accent?: boolean; mono?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      {/* 11px at full muted — the 9px label at half opacity was below what
          reads comfortably, on the four numbers people come here for. */}
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {ch ? <div className="mt-0.5 text-lg font-semibold">{ch}</div> : (
        <div className={cn('text-lg font-semibold tabular-nums mt-0.5',
          accent && 'text-success',
          mono && 'font-mono text-base',
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
      <div className="px-5 py-8">
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      </div>
    );
  }

  return (
    // Copy floats over the content on hover rather than living in a toolbar
    // band — the band was a second surface inside the panel, and it read as
    // a gap between the tabs and the payload.
    <div className="group/payload relative flex flex-col min-h-0 h-[28rem]">
      <button
        type="button"
        className="absolute right-3 top-2.5 z-10 inline-flex items-center gap-1 rounded-md border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/payload:opacity-100"
        onClick={() => { navigator.clipboard.writeText(pretty); toast.success('Copied'); }}
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
      <pre className="px-4 py-3 text-xs font-mono whitespace-pre-wrap break-words leading-relaxed overflow-auto flex-1 min-h-0">
        {isJsonText(pretty) ? <JsonHighlight text={pretty} /> : pretty}
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
  // - AI steps: tool_use / text / result rows from the SDK driver.
  // - browser_script: the same, plus the sign-in breadcrumbs. This is where
  //   the login story lives now: login_indicator_recovery when the step that
  //   proves the session failed, then the auto-login script's own init /
  //   result around the credential fill. Triaging "why did this ask for a
  //   human?" starts here, on the script's own rows.
  // - Login: kept for HISTORY. It no longer does anything at run time, so a
  //   recent run has nothing under it; older runs carry the verify_attempt /
  //   verify_result pairs from when it ran a verify script, and those still
  //   render.
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

  // No error banner here.
  //
  // ActionLogs has exactly one call site, and the page renders
  // ActionMessageBanner from the SAME error_message a few lines above it — so
  // this was an unconditional duplicate: the identical string, in the identical
  // component, twice on one screen. On a Playwright failure that is two copies
  // of a forty-line call log before you reach the tabs, which pushes the tab
  // strip off screen on exactly the failures you opened the page to read.
  //
  // The surviving copy is the page-level one, directly under the summary cards,
  // because "why did this action fail" belongs with the action's own summary
  // rather than inside the payload viewer.
  return (
    <div className="space-y-3">
      <Tabs defaultValue="input">
        <TabsList>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="logs">
            Logs
            {hasLogs && steps.length > 0 && <TabsCount>{steps.length}</TabsCount>}
          </TabsTrigger>
          {hasScreenshot && (
            <TabsTrigger value="screenshot">
              <ImageIcon className="h-3.5 w-3.5" />
              Screenshot
            </TabsTrigger>
          )}
        </TabsList>

        <TabsPanel flush>
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
            <div className="flex flex-col h-[28rem]">
              <div className="flex-1 min-h-0 overflow-auto">
                <LogViewer steps={steps} loading={loadingSteps} />
              </div>
            </div>
          ) : (
            <div className="px-5 py-8">
              <p className="text-sm text-muted-foreground italic">{logsEmpty}</p>
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
                <div className="flex items-center justify-center h-[28rem] ">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : batchShots && batchShots.length > 0 ? (
                <ScreenshotGallery shots={batchShots} actionLabel={action.label} />
              ) : batchShots && batchShots.length === 0 ? (
                <div className=" px-4 py-6">
                  <p className="text-xs text-muted-foreground italic">
                    No screenshots captured for the items in this batch.
                  </p>
                </div>
              ) : (
                // batchShots === null and not loading — kick the fetch
                // on next render (clicking the tab triggers onMouseEnter).
                <div className="flex items-center justify-center h-[28rem] ">
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
        </TabsPanel>
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
        //
        // A sub_agent action stays on the execution view: its runs are listed
        // inline there, expanded by default when any of them failed, so the
        // link already lands on what it was pointing at. Drilling into the
        // action itself would show a step whose whole content is the list we
        // are already looking at.
        if (initialActionId.current && data.children) {
          const matchingAction = data.children.find((a) => a.id === initialActionId.current);
          if (matchingAction) {
            initialActionId.current = null;
            if (matchingAction.action_type === 'sub_agent') return initialCrumbs;
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

  // Navigate INTO a node (push onto breadcrumb).
  //
  // Sub-agent ACTIONS no longer come through here — ActionList expands them in
  // place. What arrives from a sub-agent is one of its child EXECUTIONS, which
  // drills in like anything else.
  const drillInto = useCallback((node: FullTreeNode) => {
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
  // Inert login rows are filtered out — see isInertLoginRow. Computed once so
  // the empty state agrees with the list: an agent whose only step is a login
  // should read "No actions recorded", not render an empty Actions heading.
  const zones = runZones(current?.children);
  const visibleActions = zones.steps;
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
      {/* Status rides beside the title — once. The run's own type tile on
          an execution, the step's type tile on a step, so a step page wears
          the same colour and glyph as its row in the list above it. */}
      <PageHeader
        icon={isExecution
          ? Bot
          : current.type === 'batch_item'
            ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Hash className="h-[18px] w-[18px]" /></span>
            : current.action_type === 'outcome'
              ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-soft-fg"><Gavel className="h-[18px] w-[18px]" /></span>
              : <StepTypeIcon type={current.action_type ?? ''} size="lg" />}
        title={current.label}
        badge={<StatusBadge status={current.status} />}
        meta={
          <>
            <span>{nodeTypeLabel(current)}</span>
            {current.started_at && <><MetaSep /><span className="tabular-nums">{fmtDate(current.started_at)}</span></>}
            {current.item_index != null && <><MetaSep /><span>Item #{current.item_index}</span></>}
            {isExecution && (
              <>
                <MetaSep />
                <button
                  type="button"
                  title="Copy run id"
                  onClick={() => navigator.clipboard.writeText(id).then(() => toast.success('Run id copied'))}
                  className="font-mono text-xs transition-colors hover:text-foreground"
                >
                  {id.slice(-8).toUpperCase()}
                </button>
              </>
            )}
          </>
        }
        actions={isAction && current.action_type === 'outcome' && readOutcome(current).deskId ? (
          <Button size="sm" asChild>
            <Link href={`/decisions/${readOutcome(current).deskId}`}>
              <Gavel className="h-4 w-4" />
              Open decision desk
            </Link>
          </Button>
        ) : isExecution && current.agent_id ? (
          // The agent behind this run. Reading what happened and then wanting
          // the steps that caused it is the common next move.
          <Button variant="outline" size="sm" asChild>
            <Link href={`/agents/${current.agent_id}`}>
              <Bot className="h-4 w-4" />
              Open agent
            </Link>
          </Button>
        ) : undefined}
      />

      {/* ── Why it failed ──────────────────────────────────────── */}
      {isExecution && <FailureSummary node={current} steps={visibleActions} onOpen={drillInto} />}

      {/* ── Summary cards (same format for everything) ─────────── */}
      <SummaryCards node={current} />

      {/* ── Error / breadcrumb message ──────────────────────────── */}
      {current.error_message
        && !(current.error_message.startsWith('Waiting for ') && current.status !== 'queued')
        && <ActionMessageBanner message={current.error_message} />}

      {/* Parked on a sign-in — the run page names the step; this is the way out. */}
      {(() => {
        const parked = isExecution
          ? visibleActions.find((a) => a.status === 'awaiting_approval' && a.login_id)
          : isAction && current.status === 'awaiting_approval' && current.login_id ? current : null;
        return parked ? <SignInRecovery step={parked} /> : null;
      })()}

      {/* ── Content ────────────────────────────────────────────── */}
      {/* Trigger → Steps → On completion: the same three zones the editor
          shows, in the same order, as one timeline of one kind of row. See
          components/execution/RunTimeline for the two rules every row obeys. */}
      {isExecution && (
        <RunTimeline>
          <TriggerZone node={current} />
          {visibleActions.length > 0 ? (
            <StepsZone steps={visibleActions} loginsFor={zones.loginsFor} onOpen={drillInto} />
          ) : (
            <Zone title="Steps">
              <p className="pl-10 text-sm text-muted-foreground">No steps recorded.</p>
            </Zone>
          )}
          {zones.outcomes.length > 0 && <OutcomeZone rows={zones.outcomes} orgId={selectedOrgId!} onOpen={drillInto} />}
        </RunTimeline>
      )}

      {/* A step's record: input / output / logs / screenshot. Unheaded — the
          tab strip is its own label. */}
      {isAction && (
        <ActionLogs action={current} orgId={selectedOrgId!} executionId={id} />
      )}

      {/* A sub-agent step's record ends with the runs it spawned, each of
          which drills in — the same rows as under the step on the run page,
          so the two views of one step agree. */}
      {isSubAgent && (current.children ?? []).some((c) => c.type === 'execution') && (
        <RunTimeline>
          <Zone title="Runs" hint={`${(current.children ?? []).filter((c) => c.type === 'execution').length}`}>
            {(current.children ?? []).filter((c) => c.type === 'execution').map((run) => (
              <RunRow
                key={run.id}
                icon={<span className="grid h-7 w-7 place-items-center rounded-md bg-step-agent/12 text-step-agent"><GitBranch className="h-3.5 w-3.5" /></span>}
                title={run.agent_name ?? run.label}
                badge={<StatusBadge status={run.status} size="sm" />}
                meta={<>{run.item_index != null && <span>item {run.item_index + 1}</span>}<span className="tabular-nums">{fmtDur(run.duration_ms)}</span></>}
                tone={run.status === 'failed' || run.status === 'aborted' ? 'danger' : 'default'}
                onOpen={() => drillInto(run)}
              />
            ))}
          </Zone>
        </RunTimeline>
      )}

    </div>
  );
}
