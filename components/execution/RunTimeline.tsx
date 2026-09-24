'use client';

/**
 * The run page's body: Trigger → Steps → On completion, as ONE timeline of
 * ONE kind of row.
 *
 * Three zones used to be three designs. The trigger was a bordered block of
 * text, steps were cards with a coloured rail hanging children off to the
 * left, and completion rows were a third shape that left the app when you
 * clicked them. Every row here is a <RunRow> now, and every row obeys the
 * same two rules:
 *
 *   CLICK THE ROW → open its record (Input / Output / Logs). Steps, the
 *   login a script ran as, the runs a sub-agent spawned, a completion rule.
 *   A row with no record of its own (the trigger) expands instead.
 *
 *   THE CARET → show what happened UNDER it, inside the same card: a sub-
 *   agent's runs, a script's login, a rule's decisions, a trigger's payload
 *   and origin. Nested rows live inside the parent card, below a rule, so
 *   "these belong to that" needs no colour and no memory.
 *
 * One rail runs the length of the whole thing, through every type tile,
 * because the trigger fed step 1, step 1 fed step 2, and the last step fed
 * the rules. It is a flow, and the page reads as the flow you authored.
 */

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, Gavel, MessageSquare, AlertCircle, LogIn,
  Webhook, Clock, Play, GitBranch, Zap, ExternalLink, User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FullTreeNode, Decision, DecisionDesk } from '@/lib/api/agents';
import { getDecisionDesk } from '@/lib/api/agents';
import { choiceLabel, styleForOption, choiceToneVariant } from '@/lib/decision-wording';
import { StatusBadge, StatusDot } from '@/components/execution/status';
import { StepTypeIcon, stepTypeDef } from '@/components/execution/step-types';
import { TokenUsage } from '@/components/execution/TokenUsage';
import { triggerLabel } from '@/components/execution/TriggerBadge';
import { JsonHighlight } from '@/components/execution/JsonHighlight';

// ─── Helpers ─────────────────────────────────────────────────

function fmtDur(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** An outcome row's payload, as outcome-dispatch.service.js writes it. */
export interface OutcomeInfo {
  deskId: string | null;
  ruleName: string | null;
  type: 'notify' | 'decision' | null;
  decisions: number;
  reason: string | null;
}

export function readOutcome(node: FullTreeNode): OutcomeInfo {
  let o: Record<string, unknown> = {};
  try {
    o = typeof node.output === 'string' ? JSON.parse(node.output) : ((node.output as unknown as Record<string, unknown>) ?? {});
  } catch {
    // A row whose output never parsed still belongs in the zone — it says a
    // rule fired, which is the part that matters.
  }
  return {
    deskId: (o.decision_desk_id as string) ?? null,
    ruleName: (o.outcome_name as string) ?? null,
    type: (o.outcome_type as 'notify' | 'decision') ?? null,
    decisions: Number(o.decisions ?? 0),
    // Written when rules existed and none matched. The only thing separating
    // a correct silence from a misspelled field name.
    reason: (o.reason as string) ?? null,
  };
}

// ─── Frame ───────────────────────────────────────────────────

/** Wraps the zones; draws the one rail behind every tile. */
export function RunTimeline({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative space-y-7">
      <span aria-hidden className="absolute left-[13px] top-6 bottom-6 w-px bg-border" />
      {children}
    </div>
  );
}

/** One heading style for the three zones. Sits right of the rail column. */
export function Zone({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2 pl-10">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {hint && <span className="text-xs text-text-dim">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ─── The row ─────────────────────────────────────────────────

export function RunRow({
  icon, title, badge, chips, meta, right, onOpen, tone = 'default', disabled,
  nested, nestedLabel, defaultOpen = true,
}: {
  /** The type tile that sits on the rail. */
  icon: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  /** Small qualifiers after the badge — Gated, Cascade, Partial. */
  chips?: React.ReactNode;
  /** The second line — type · duration · tokens. */
  meta?: React.ReactNode;
  /** Right-aligned on the title row; hidden on phones. */
  right?: React.ReactNode;
  /** Opens this row's record. Absent → the row toggles its nested content. */
  onOpen?: () => void;
  tone?: 'default' | 'danger' | 'muted';
  /** Inert — a declared step that never ran. */
  disabled?: boolean;
  /** What happened under this row, shown inside the card below a rule. */
  nested?: React.ReactNode;
  /** The caret's count/label — "3 runs", "1 login", "2 decisions". */
  nestedLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const hasNested = !!nested;
  const rowClick = disabled ? undefined : onOpen ?? (hasNested ? () => setOpen((v) => !v) : undefined);

  return (
    <div className="flex items-start gap-3">
      <span className={cn('relative z-10 mt-2.5 shrink-0 rounded-md ring-4 ring-background', disabled && 'opacity-50')}>
        {icon}
      </span>

      <div
        className={cn(
          'min-w-0 flex-1 overflow-hidden rounded-lg border bg-card transition-colors',
          tone === 'danger' && 'border-danger/35',
          disabled && 'border-dashed bg-transparent opacity-60',
        )}
      >
        <div className={cn('flex items-center gap-2 pr-2', tone === 'danger' && 'bg-danger-soft/40')}>
          <button
            type="button"
            onClick={rowClick}
            disabled={!rowClick}
            aria-expanded={!onOpen && hasNested ? open : undefined}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
              rowClick && 'hover:bg-muted/30',
              rowClick && tone === 'danger' && 'hover:bg-danger-soft/70',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* Wraps on a phone, truncates from sm: at 375px the badge
                    left a name three words long showing as "ZZ Design Sho…". */}
                <span className={cn('min-w-0 break-words text-sm font-medium sm:truncate', disabled && 'text-muted-foreground')}>{title}</span>
                {badge}
                {chips}
              </div>
              {meta && (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
                  {meta}
                </div>
              )}
            </div>
            {right && <div className="hidden shrink-0 items-center gap-2 text-xs text-muted-foreground sm:flex">{right}</div>}
            {onOpen && !disabled && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
          </button>

          {/* The caret is its own control when the row also opens a record —
              otherwise clicking to peek at children would navigate away. */}
          {hasNested && onOpen && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Hide details' : 'Show details'}
              className="flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {nestedLabel}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
            </button>
          )}
          {hasNested && !onOpen && (
            <ChevronDown className={cn('mr-1.5 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform', !open && '-rotate-90')} />
          )}
        </div>

        {hasNested && open && (
          <div className="border-t bg-surface-2/40">{nested}</div>
        )}
      </div>
    </div>
  );
}

/**
 * A row INSIDE a RunRow's nested area. Compact, one line, same anatomy in
 * miniature: status · glyph · label · facts · badge · chevron.
 */
export function NestedRow({
  status, icon, label, facts, badge, onOpen, href, external,
}: {
  status?: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  facts?: React.ReactNode;
  badge?: React.ReactNode;
  onOpen?: () => void;
  href?: string;
  /** Opens outside the run page (the desk) — shown with an external glyph. */
  external?: boolean;
}) {
  const inner = (
    <>
      {status && <StatusDot status={status} />}
      {icon}
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
      {facts && <span className="hidden shrink-0 items-center gap-2 text-[11px] text-muted-foreground sm:flex">{facts}</span>}
      {/* The dot already says the status; on a phone the badge only took
          the label's room. */}
      {badge && <span className={cn('shrink-0', status && 'hidden sm:inline-flex')}>{badge}</span>}
      {(onOpen || href) && (
        external
          ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
      )}
    </>
  );
  const cls = 'flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/40';
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onOpen) return <button type="button" onClick={onOpen} className={cls}>{inner}</button>;
  return <div className={cls.replace(' hover:bg-muted/40', '')}>{inner}</div>;
}

function NestedList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-border/60">{children}</div>;
}

// ─── Zone: Trigger ───────────────────────────────────────────

const TRIGGER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  webhook: Webhook, cron: Clock, manual: Play, decision: Gavel, sub_agent: GitBranch, internal: Zap,
};

export function TriggerZone({ node }: { node: FullTreeNode }) {
  const type = node.trigger_type ?? 'internal';
  const Icon = TRIGGER_ICONS[type] ?? Zap;
  const payload = node.trigger_input;
  const hasPayload = payload !== null && payload !== undefined;
  const items = Array.isArray(payload) ? payload.length : null;
  const origin = node.origin_decision;
  const by = node.triggered_by_name ?? node.triggered_by;
  const [showPayload, setShowPayload] = React.useState(false);

  const nested = (
    <NestedList>
      {/* THE OTHER HALF OF A DECISION CHAIN. The outcome rows on the parent
          run show decisions going forward; this shows the one that arrived
          here, and links back to the desk and the run that raised it. */}
      {origin && (
        <NestedRow
          icon={<Gavel className="h-3.5 w-3.5 shrink-0 text-brand" />}
          label={
            <>
              {origin.chosen_option
                ? <span className={cn(choiceToneVariant(styleForOption(origin.chosen_option)) === 'danger' ? 'text-danger' : 'text-success')}>{choiceLabel(origin.chosen_option)}</span>
                : 'Decided'}
              {origin.decided_by_name && <span className="text-muted-foreground"> by {origin.decided_by_name}</span>}
              {origin.agent_name && <span className="text-muted-foreground"> · from </span>}
              {origin.agent_name}
              {origin.rule_name && <span className="text-muted-foreground"> · {origin.rule_name}</span>}
            </>
          }
          facts={<>{origin.item_index != null && <span>item {origin.item_index + 1}</span>}<span className="tabular-nums">{fmtTime(origin.decided_at)}</span></>}
          href={origin.execution_id ? `/agent-history/${origin.execution_id}` : origin.desk_id ? `/decisions/${origin.desk_id}` : undefined}
          badge={origin.desk_id && (
            <Link
              href={`/decisions/${origin.desk_id}`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Desk
            </Link>
          )}
        />
      )}
      {hasPayload ? (
        <div>
          <button
            type="button"
            onClick={() => setShowPayload((v) => !v)}
            aria-expanded={showPayload}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !showPayload && '-rotate-90')} />
            Incoming payload
            {items !== null && <span className="text-text-dim">· {items} item{items === 1 ? '' : 's'}</span>}
          </button>
          {showPayload && (
            <pre className="max-h-80 overflow-auto border-t bg-card px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
              <JsonHighlight text={JSON.stringify(payload, null, 2)} />
            </pre>
          )}
        </div>
      ) : (
        // Not the same as an empty payload. Runs predating this recording,
        // and resumed runs that reuse an existing log, legitimately have
        // nothing here — saying so beats rendering "null".
        <p className="px-3.5 py-2 text-xs text-muted-foreground">No payload recorded for this run.</p>
      )}
    </NestedList>
  );

  return (
    <Zone title="Trigger">
      <RunRow
        icon={
          <span className={cn('grid h-7 w-7 place-items-center rounded-md', type === 'decision' ? 'bg-brand-soft text-brand-soft-fg' : 'bg-muted text-muted-foreground')}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        }
        title={triggerLabel(type)}
        meta={
          <>
            {by && <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{by}</span>}
            {items !== null && <span>{items} item{items === 1 ? '' : 's'}</span>}
            {node.item_index != null && <span>item #{node.item_index + 1} of its parent</span>}
            {node.started_at && <span className="tabular-nums">{fmtTime(node.started_at)}</span>}
          </>
        }
        nested={nested}
        defaultOpen={!!origin}
      />
    </Zone>
  );
}

// ─── Zone: Steps ─────────────────────────────────────────────

/** Small qualifiers derived from the executor's error_message breadcrumbs. */
function StepChips({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  const chip = (label: string, variant: 'neutral' | 'warning' = 'neutral') => (
    <Badge variant={variant} className="h-5 px-1.5 text-[10px]" title={message}>{label}</Badge>
  );
  if (message.startsWith('Conditional gate:')) return chip('Gated');
  if (message.startsWith('Cascade:')) return chip('Cascade');
  if (message.startsWith('Skipped:')) return chip('Skipped');
  if (message.startsWith('Partition:') || message.includes('Partition:')) return chip('Partial');
  if (message.startsWith('Tolerated ')) return chip('Tolerated', 'warning');
  return null;
}

function tokensOf(a: FullTreeNode) {
  return {
    fresh: a.tokens_input ?? 0,
    cacheRead: a.tokens_cache_read ?? 0,
    cacheWrite: a.tokens_cache_write ?? 0,
    output: a.tokens_output ?? 0,
  };
}

export function StepsZone({ steps, loginsFor, onOpen }: {
  steps: FullTreeNode[];
  /** Logins nested under the script they authenticated, keyed by step id. */
  loginsFor: Map<string, FullTreeNode[]>;
  onOpen: (n: FullTreeNode) => void;
}) {
  return (
    <Zone title="Steps" hint={`${steps.length} step${steps.length === 1 ? '' : 's'}`}>
      {steps.map((step) => {
        const notRun = step.status === 'not_run';
        const failed = step.status === 'failed' || step.status === 'aborted';
        const isSub = step.action_type === 'sub_agent';
        const runs = isSub ? (step.children ?? []).filter((c) => c.type === 'execution') : [];
        const logins = loginsFor.get(step.id) ?? [];
        const anyFailed = runs.some((r) => r.status === 'failed' || r.status === 'aborted');

        const nestedRows: React.ReactNode[] = [];
        // The identity a script ran as. Its own log, so drillable.
        for (const lg of logins) {
          nestedRows.push(
            <NestedRow
              key={lg.id}
              status={lg.status}
              icon={<LogIn className="h-3.5 w-3.5 shrink-0 text-step-login" />}
              label={<><span className="text-muted-foreground">Signed in as </span>{lg.label}</>}
              facts={<span className="tabular-nums">{fmtDur(lg.duration_ms)}</span>}
              badge={<StatusBadge status={lg.status} size="sm" />}
              onOpen={() => onOpen(lg)}
            />,
          );
        }
        // A sub-agent's runs: failed first, then by item — a fan-out is read
        // for its failures.
        for (const run of [...runs].sort((a, b) => {
          const af = a.status === 'failed' || a.status === 'aborted' ? 0 : 1;
          const bf = b.status === 'failed' || b.status === 'aborted' ? 0 : 1;
          return af !== bf ? af - bf : (a.item_index ?? 0) - (b.item_index ?? 0);
        })) {
          nestedRows.push(
            <NestedRow
              key={run.id}
              status={run.status}
              icon={<GitBranch className="h-3.5 w-3.5 shrink-0 text-step-agent" />}
              label={run.agent_name ?? run.label}
              facts={<>{run.item_index != null && <span>item {run.item_index + 1}</span>}<span className="tabular-nums">{fmtDur(run.duration_ms)}</span></>}
              badge={<StatusBadge status={run.status} size="sm" />}
              onOpen={() => onOpen(run)}
            />,
          );
        }

        const label = isSub && runs.length > 0 ? (runs[0].agent_name ?? runs[0].label) : step.label;
        const parts: string[] = [];
        if (logins.length) parts.push(`${logins.length} login${logins.length === 1 ? '' : 's'}`);
        if (runs.length) parts.push(`${runs.length} run${runs.length === 1 ? '' : 's'}`);

        return (
          <RunRow
            key={step.id}
            icon={<StepTypeIcon type={step.action_type ?? ''} />}
            title={label}
            badge={<StatusBadge status={step.status} size="sm" />}
            chips={<StepChips message={step.error_message} />}
            meta={
              <>
                <span>{stepTypeDef(step.action_type).label}</span>
                <span className="tabular-nums">{fmtDur(step.duration_ms)}</span>
                <TokenUsage variant="inline" tokens={tokensOf(step)} />
              </>
            }
            tone={failed ? 'danger' : notRun ? 'muted' : 'default'}
            disabled={notRun}
            onOpen={notRun ? undefined : () => onOpen(step)}
            nested={nestedRows.length > 0 ? <NestedList>{nestedRows}</NestedList> : undefined}
            nestedLabel={parts.join(' · ')}
            // Open by default unless it is a long fan-out with nothing wrong.
            defaultOpen={anyFailed || nestedRows.length <= 6}
          />
        );
      })}
    </Zone>
  );
}

// ─── Zone: On completion ─────────────────────────────────────

function decisionStatusBadge(d: Decision) {
  if (d.status === 'pending') return <StatusBadge status="awaiting_approval" size="sm" label="Pending" />;
  if (d.status === 'expired') return <Badge variant="neutral" className="h-5 px-1.5 text-[11px]">Expired</Badge>;
  const v = choiceToneVariant(styleForOption(d.chosen_option));
  return (
    <Badge variant={v === 'secondary' ? 'neutral' : v} className="h-5 px-1.5 text-[11px]">
      {choiceLabel(d.chosen_option) ?? 'Decided'}
    </Badge>
  );
}

/** One rule's decisions, one row each, fetched when the card opens. */
function DeskDecisions({ orgId, deskId }: { orgId: string; deskId: string }) {
  const [data, setData] = React.useState<{ desk: DecisionDesk; decisions: Decision[] } | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    getDecisionDesk(orgId, deskId).then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [orgId, deskId]);

  if (failed) return <p className="px-3.5 py-2 text-xs text-muted-foreground">Could not load this desk&apos;s decisions.</p>;
  if (!data) return <p className="px-3.5 py-2 text-xs text-muted-foreground">Loading decisions…</p>;
  if (data.decisions.length === 0) return <p className="px-3.5 py-2 text-xs text-muted-foreground">No decisions were raised.</p>;

  return (
    <NestedList>
      {data.decisions.map((d) => {
        const who = [d.decided_by_first_name, d.decided_by_last_name].filter(Boolean).join(' ');
        // Where the row goes: to the run the answer launched when there is
        // one, otherwise to the desk where it can still be answered.
        const href = d.resulting_execution_id ? `/agent-history/${d.resulting_execution_id}` : `/decisions/${deskId}`;
        return (
          <NestedRow
            key={d.id}
            icon={<Gavel className="h-3.5 w-3.5 shrink-0 text-brand" />}
            label={
              <>
                {d.item_index != null ? `Item ${d.item_index + 1}` : 'Decision'}
                {who && <span className="text-muted-foreground"> · {who}</span>}
                {d.target_agent_name && (
                  <span className="text-muted-foreground">
                    {' '}→ {d.target_agent_name}
                    {d.resulting_execution_id ? '' : ' (not run)'}
                  </span>
                )}
              </>
            }
            facts={
              <>
                {d.decided_at && <span className="tabular-nums">{fmtTime(d.decided_at)}</span>}
                {d.target_run_status && <StatusBadge status={d.target_run_status} size="sm" />}
              </>
            }
            badge={decisionStatusBadge(d)}
            href={href}
            external={!d.resulting_execution_id}
          />
        );
      })}
    </NestedList>
  );
}

export function OutcomeZone({ rows, orgId, onOpen }: {
  rows: FullTreeNode[];
  orgId: string;
  onOpen: (n: FullTreeNode) => void;
}) {
  const parsed = rows.map((r) => ({ row: r, info: readOutcome(r) }));
  const notifies = parsed.filter((p) => p.info.type === 'notify').length;
  const decisions = parsed.reduce((n, p) => n + p.info.decisions, 0);
  const hint = [
    notifies ? `${notifies} notification${notifies === 1 ? '' : 's'}` : null,
    decisions ? `${decisions} decision${decisions === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <Zone title="On completion" hint={hint || undefined}>
      {parsed.map(({ row, info }) => {
        const isDecision = info.type === 'decision';
        // A rule that matched nothing writes one row for the whole run and
        // has no desk. It is the only evidence the rules ran at all.
        const nothing = !info.type;
        const Icon = nothing ? AlertCircle : isDecision ? Gavel : MessageSquare;
        return (
          <RunRow
            key={row.id}
            icon={
              <span className={cn('grid h-7 w-7 place-items-center rounded-md', isDecision ? 'bg-brand-soft text-brand-soft-fg' : 'bg-muted text-muted-foreground')}>
                <Icon className="h-3.5 w-3.5" />
              </span>
            }
            title={info.ruleName ?? row.label}
            badge={
              <Badge variant={isDecision ? 'brand' : 'neutral'} className="h-5 px-1.5 text-[11px]">
                {nothing ? 'No match' : isDecision ? 'Decision' : 'Notification'}
              </Badge>
            }
            meta={
              <span>
                {info.reason
                  ? info.reason
                  : isDecision
                    ? `${info.decisions} item${info.decisions === 1 ? '' : 's'} to answer`
                    : 'Posted to Slack'}
              </span>
            }
            right={info.deskId && (
              <Link
                href={`/decisions/${info.deskId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Open desk <ExternalLink className="h-3 w-3" />
              </Link>
            )}
            onOpen={() => onOpen(row)}
            nested={isDecision && info.deskId ? <DeskDecisions orgId={orgId} deskId={info.deskId} /> : undefined}
            nestedLabel={isDecision ? `${info.decisions} decision${info.decisions === 1 ? '' : 's'}` : undefined}
          />
        );
      })}
    </Zone>
  );
}

// ─── Why it failed ───────────────────────────────────────────

/**
 * The answer to "what broke", at the top of a failed run: the step that
 * failed and the first line of its error, with a way straight in. Before
 * this, a failed run opened on a red badge and four stat tiles and the cause
 * was two clicks away inside whichever step failed — which you had to find.
 */
export function FailureSummary({ node, steps, onOpen }: {
  node: FullTreeNode; steps: FullTreeNode[]; onOpen: (n: FullTreeNode) => void;
}) {
  if (node.status !== 'failed' && node.status !== 'aborted') return null;
  // The run-level message is already shown by the page's message banner.
  if (node.error_message) return null;
  const idx = steps.findIndex((a) => a.status === 'failed' || a.status === 'aborted');
  if (idx < 0) return null;
  const step = steps[idx];
  const isSub = step.action_type === 'sub_agent';
  // A sub-agent step carries no message of its own — its failed run does.
  const failedChild = isSub
    ? step.children?.find((c) => c.type === 'execution' && (c.status === 'failed' || c.status === 'aborted'))
    : undefined;
  const firstLine = (step.error_message ?? failedChild?.error_message ?? '').split('\n')[0];
  const target = isSub ? failedChild : step;

  return (
    // Stacks on a phone: the button drops under the message instead of
    // squeezing a wrapped step name into a third of the width.
    <div className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-danger-soft/60 px-4 py-3 sm:flex-row sm:items-start">
      <AlertCircle className="mt-0.5 hidden h-4 w-4 shrink-0 text-danger sm:block" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {node.status === 'aborted' ? 'Stopped' : 'Failed'} at step {idx + 1}
          <span className="text-muted-foreground"> · </span>
          {step.label}
        </p>
        {firstLine && (
          <p className="mt-0.5 truncate font-mono text-xs text-danger" title={firstLine}>{firstLine}</p>
        )}
      </div>
      {target && (
        <Button variant="outline" size="sm" className="shrink-0 self-start bg-background" onClick={() => onOpen(target)}>
          View {isSub ? 'failed run' : 'step'}
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
