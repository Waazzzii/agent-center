'use client';

/**
 * The review screen — where a decision actually gets made.
 *
 * NOT a chat. The job here is a bounded question: given this output and this
 * prepared input, should that agent run? A conversational surface makes that
 * slower and leaves nothing crisp to audit. (A "ask about this run" panel
 * beside the decision is a reasonable later addition — instead of it, no.)
 *
 * Three things are load-bearing:
 *
 *   • The payload is EDITABLE, and the original is kept. `proposed_input` is
 *     frozen server-side; what you save becomes `final_input`. The diff is
 *     always recoverable, which is what keeps "you ran what was reviewed"
 *     true while still letting a reviewer fix a value.
 *
 *   • Answering is FINAL. Choosing an option records it, launches whatever
 *     that option runs, and closes the desk when nothing is left. There is no
 *     second confirmation: a Submit step that people walked past left real
 *     decisions answered-but-unlaunched, which is worse than no gate at all.
 *     Reviewing and editing is the state BEFORE answering.
 *
 *   • Paging, because a desk can hold many decisions.
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useRequirePermission } from '@/lib/hooks/use-require-permission';
import {
  getDecisionDesk, resolveDecision, answerDecisionDesk,
  type Decision, type DecisionDesk, type OutcomeOption,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { PageHeader, MetaSep } from '@/components/layout/PageHeader';
import { PayloadBlock } from '@/components/execution/PayloadBlock';
import { JsonEditor } from '@/components/execution/JsonEditor';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { NoPermissionContent } from '@/components/layout/no-permission-content';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Loader2, Gavel, ArrowUpRight,
  RotateCcw, AlertTriangle, Clock, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { choiceLabel, choiceToneVariant, describeChoice, styleForOption } from '@/lib/decision-wording';

/** Runtime plumbing nobody reviews. */
const RUNTIME_KEYS = new Set(['_input_id', '_status', '_error', '_disposition', '_item']);

function stripRuntime(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripRuntime);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !RUNTIME_KEYS.has(k)));
  }
  return v;
}

const pretty = (v: unknown) => JSON.stringify(stripRuntime(v), null, 2);

/**
 * Whether a person changed the payload before it went downstream.
 *
 * `was_edited` is what the API says when it says anything; the desk
 * endpoint returns raw rows without it, so fall back to the fact itself —
 * a final_input that differs from what the agent proposed.
 */
function wasEdited(d: Decision): boolean {
  if (typeof d.was_edited === 'boolean') return d.was_edited;
  return d.final_input != null && pretty(d.final_input) !== pretty(d.proposed_input);
}

/**
 * A message the author templated can run long. Six lines, then a toggle —
 * the payload below it is the thing to read, and an unbounded paragraph
 * pushed it off screen.
 */
function ClampedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420 || text.split('\n').length > 6;
  return (
    <div>
      <p className={cn('text-sm whitespace-pre-wrap text-muted-foreground', !open && long && 'line-clamp-6')}>{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-brand hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export default function DecisionReviewPage() {
  const permitted = useRequirePermission('agent_center_user');
  const { selectedOrgId } = useAdminViewStore();
  const { deskId } = useParams<{ deskId: string }>();
  const router = useRouter();
  /**
   * The option a Slack button carried in on `?option=`.
   *
   * Slack has no Interactivity endpoint here, so its buttons are LINKS —
   * clicking one records nothing. It arms the choice and lands you on this
   * screen to confirm it, which also means the confirm happens somewhere the
   * payload is visible. Cleared as soon as it is used or dismissed so a
   * reload does not re-arm something already dealt with.
   *
   * Read from window.location rather than useSearchParams: that hook forces
   * a Suspense boundary at build time, and this is a one-shot read on mount,
   * not something that needs to react to navigation.
   */
  const [armed, setArmed] = useState<string | null>(null);
  /**
   * The decision to open at, from ?decision=. Read once on mount, same as
   * `armed` and for the same reason.
   *
   * Held as an ID rather than resolved to an index here: the decisions have
   * not loaded yet on mount, so there is no list to find a position in. It is
   * applied once they arrive, then cleared so paging is not yanked back.
   */
  const [wantDecisionId, setWantDecisionId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get('option');
    if (o) setArmed(o);
    const d = params.get('decision');
    if (d) setWantDecisionId(d);
  }, []);

  const disarm = () => {
    setArmed(null);
    // Drops ?option= only. ?decision= has already been consumed into `idx`,
    // so there is nothing to preserve and a bare URL is the cleaner thing to
    // leave in the address bar.
    router.replace(`/decisions/${deskId}`, { scroll: false });
  };
  const { confirm } = useConfirmDialog();

  const [desk, setDesk] = useState<DecisionDesk | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [idx, setIdx] = useState(0);

  /** Local edits, keyed by decision id. Absent = untouched. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!selectedOrgId || !deskId) return;
    try {
      setLoading(true);
      const data = await getDecisionDesk(selectedOrgId, deskId);
      setDesk(data.desk);
      setDecisions(data.decisions);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load this decision');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, deskId]);

  useEffect(() => { load(); }, [load]);

  // Jump to the requested item once the desk's decisions are in hand. Cleared
  // immediately: this is where to START, not a position to hold someone at,
  // and leaving it set would fight the pager on the next reload.
  useEffect(() => {
    if (!wantDecisionId || decisions.length === 0) return;
    const at = decisions.findIndex((d) => d.id === wantDecisionId);
    if (at >= 0) setIdx(at);
    setWantDecisionId(null);
  }, [wantDecisionId, decisions]);

  /**
   * The buttons. FIXED (Approve / Deny) — Review is Slack-only, because on
   * this screen you are already reviewing.
   *
   * Approve carries the outcome's configured target, so the button can say
   * whether answering starts work. Derived from config.on_approve rather than
   * read from stored per-option `then`, which is the shape outcomes saved
   * before the buttons were fixed still use.
   *
   * Mirrors DECISION_OPTIONS + optionsForOutcome in agent-backend's
   * agent-outcomes.service.js, which is the source of truth.
   */
  const options: OutcomeOption[] = useMemo(() => {
    const target = desk?.outcome_config?.on_approve?.target_agent_id ?? null;
    return [
      {
        key: 'approve', label: 'Approve', style: 'primary',
        then: target ? { type: 'run_agent', target_agent_id: target } : { type: 'none' },
      },
      { key: 'deny', label: 'Deny', style: 'danger', then: { type: 'none' } },
    ];
  }, [desk]);

  const current = decisions[idx];
  const pendingCount = decisions.filter((d) => d.status === 'pending').length;
  const decidedCount = decisions.filter((d) => d.status === 'decided').length;
  const isOpen = desk?.status === 'open';

  /**
   * The payload as it stands — the local edit if there is one, else what the
   * server holds. `final_input` wins over `proposed_input` so revisiting an
   * already-answered decision shows what will actually run.
   */
  const payloadText = (d: Decision) =>
    drafts[d.id] ?? pretty(d.final_input ?? d.proposed_input);

  const isEdited = (d: Decision) =>
    (drafts[d.id] ?? pretty(d.final_input ?? d.proposed_input)) !== pretty(d.proposed_input);

  const answer = async (d: Decision, option: OutcomeOption) => {
    let finalInput: unknown;
    if (drafts[d.id] !== undefined) {
      try {
        finalInput = JSON.parse(drafts[d.id]);
      } catch {
        // Refuse rather than silently falling back to the original — saving
        // the unedited payload under the impression the edit took is worse
        // than an error.
        toast.error('The edited payload is not valid JSON. Fix it or reset before answering.');
        return;
      }
    }

    try {
      setBusy(true);
      const res = await resolveDecision(selectedOrgId!, d.id, {
        chosen_option: option.key,
        ...(finalInput !== undefined ? { final_input: finalInput } : {}),
        ...(notes[d.id] ? { note: notes[d.id] } : {}),
      });
      // Past tense here too — the toast fires AFTER the answer is recorded,
      // so "Deny recorded" described a finished act in the imperative.
      const done = describeChoice(option.label);
      if (res.launch_error) {
        toast.error(`${done}, but the follow-on run could not start: ${res.launch_error}`);
      } else if (res.launched) {
        toast.success(`${done} — run started.`);
      } else {
        toast.success(`${done}.`);
      }
      if (armed) disarm();
      await load();
      // Move to the next thing still needing an answer, so a desk of many can
      // be worked straight through without hunting.
      const nextPending = decisions.findIndex((x, i) => i > idx && x.status === 'pending');
      if (nextPending >= 0) setIdx(nextPending);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      if (e.response?.status === 409) {
        // Someone got there first. Reload so the screen shows their answer
        // rather than leaving stale buttons that look clickable.
        toast.error(e.response.data?.error ?? 'Already answered by someone else.');
        await load();
      } else {
        toast.error(e.response?.data?.error ?? e.message ?? 'Could not record the decision');
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Answer every pending item the same way.
   *
   * Confirmed first, unlike the single answer. One click here is irreversible
   * across an unbounded number of items and may start that many runs — the
   * thing the single-answer path deliberately has no confirmation for is
   * bounded to the one payload on screen.
   *
   * Local edits are NOT sent. The server answers each item with its own
   * proposed_input, which is what "approve all as they stand" means; quietly
   * folding in a draft you were still working on would be worse than ignoring
   * it, and the wording above says so.
   */
  const answerAll = async (option: OutcomeOption) => {
    const launches = option.then?.type === 'run_agent';
    const ok = await confirm({
      title: `${option.label} all ${pendingCount}?`,
      description: launches
        ? `Records ${option.label.toLowerCase()} for every unanswered item and starts ${pendingCount} run(s). This cannot be undone.`
        : `Records ${option.label.toLowerCase()} for every unanswered item. This cannot be undone.`,
      confirmText: `${option.label} all`,
      cancelText: 'Cancel',
      variant: option.style === 'danger' ? 'destructive' : 'default',
    });
    if (!ok) return;

    try {
      setBusy(true);
      const res = await answerDecisionDesk(selectedOrgId!, deskId, { chosen_option: option.key });
      const done = describeChoice(option.label);
      if (res.failed > 0) {
        toast.error(`${done} — ${res.answered} item(s), but ${res.failed} follow-on run(s) could not start.`);
      } else if (res.launched > 0) {
        toast.success(`${done} — ${res.answered} item(s), ${res.launched} run(s) started.`);
      } else {
        toast.success(`${done} — ${res.answered} item(s).`);
      }
      if (armed) disarm();
      await load();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      // 409 means someone emptied the desk while this was open — reload so
      // the screen shows their answers instead of buttons that do nothing.
      if (e.response?.status === 409) await load();
      toast.error(e.response?.data?.error ?? e.message ?? 'Could not record the decisions');
    } finally {
      setBusy(false);
    }
  };

  if (!permitted) return <NoPermissionContent />;
  if (loading) {
    return <div className="flex h-60 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!desk) {
    return (
      <div className="p-6 max-w-[1000px] mx-auto">
        <p className="text-muted-foreground">This decision desk no longer exists.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 max-w-[1000px] mx-auto">
      <PageHeader
        breadcrumbs={[{ label: 'Decisions', href: '/decisions' }, { label: desk.agent_name }]}
        icon={Gavel}
        title={desk.agent_name}
        badge={
          <Badge variant={isOpen ? 'brand' : desk.status === 'expired' ? 'danger' : 'neutral'} className="capitalize">
            {desk.status}
          </Badge>
        }
        meta={
          <>
            <span>{decisions.length} decision{decisions.length === 1 ? '' : 's'}</span>
            {/* WHICH RULE raised this. A run matching several rules produces
                a desk each, all named after the same agent. Null when the
                rule has since been deleted. */}
            {desk.outcome_name && <><MetaSep /><span>{desk.outcome_name}</span></>}
            {isOpen && desk.expires_at && (
              <><MetaSep /><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> expires {new Date(desk.expires_at).toLocaleString()}</span></>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/agent-history/${desk.execution_log_id}`}>
              <ArrowUpRight className="h-4 w-4" /> View the run
            </Link>
          </Button>
        }
      />

      {!isOpen && (
        <Card className="border-muted">
          <CardContent className="py-3 text-sm text-muted-foreground">
            This desk is {desk.status}. It is kept here as a record; nothing further can be launched from it.
          </CardContent>
        </Card>
      )}

      {/* Bulk answer.
          ALWAYS AVAILABLE on a multi-item desk, rather than a mode chosen
          when the rule was written. review_as_batch used to decide this at
          design time and it welded two unrelated questions together: how many
          Slack messages to send, and how many decisions to record. Picking
          fewer notifications silently cost you the per-item record, so you
          could no longer say which of the six you meant to deny. Now the
          record is always per item and sweeping the rest is something you
          choose once you have looked at them. */}
      {isOpen && pendingCount > 1 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-wrap items-center gap-2 py-3">
            <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm">
              {pendingCount} still to answer
            </span>
            <div className="ml-auto flex gap-2">
              {options.map((o) => (
                <Button
                  key={o.key}
                  size="sm"
                  variant={o.style === 'danger' ? 'outline' : 'default'}
                  disabled={busy}
                  onClick={() => answerAll(o)}
                  className={cn(o.style === 'danger' && 'text-destructive hover:text-destructive')}
                >
                  {o.label} all {pendingCount}
                </Button>
              ))}
            </div>
            <p className="w-full text-[11px] text-muted-foreground">
              Applies to the {pendingCount} unanswered item{pendingCount === 1 ? '' : 's'} as they
              stand — local edits you have not answered with are not included. Each is still
              recorded separately{options[0]?.then?.type === 'run_agent' ? ', and each approval starts its own run' : ''}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pager — only when there is more than one thing to answer. */}
      {decisions.length > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" disabled={idx <= 0} onClick={() => setIdx(idx - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {idx + 1} of {decisions.length}
          </span>
          <Button variant="outline" size="icon-sm" disabled={idx >= decisions.length - 1} onClick={() => setIdx(idx + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <div className="ml-2 flex flex-wrap gap-1">
            {decisions.map((d, i) => (
              <button
                key={d.id}
                onClick={() => setIdx(i)}
                title={`${d.status}${d.chosen_option ? ` — ${choiceLabel(d.chosen_option_label ?? d.chosen_option)}` : ''}`}
                className={cn(
                  'h-2 w-6 rounded-full transition-colors',
                  i === idx && 'ring-2 ring-offset-1 ring-brand/50',
                  // On a BATCH desk these pips are the only view of the whole
                  // set, so they carry which way each item went — green for
                  // the approving option, red for the rejecting one. All-green
                  // meaning "all answered" hid the thing you most want to see
                  // when working down a batch: that item 4 went the other way.
                  d.status !== 'decided'
                    ? (d.status === 'pending' ? 'bg-warning/60' : 'bg-muted-foreground/30')
                    : styleForOption(d.chosen_option) === 'danger' ? 'bg-danger/70'
                    : styleForOption(d.chosen_option) === 'primary' ? 'bg-success/70'
                    : 'bg-muted-foreground/50',
                )}
              />
            ))}
          </div>
        </div>
      )}

      {current && (
        <>
          {/* ONE payload. "What the agent concluded" and "Input for the next
              agent" were two cards showing the same JSON twice — the second
              a copy of the first until you edited it. The block below IS the
              agent's output, editable in place; Revert puts the agent's
              version back, and an edit is recorded on the decision as
              was_edited so the record says a person changed it. The run's
              own logs keep the original regardless. */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium">
                    {/* A desk's decision rows do not carry the target's
                        name; the rule on the desk says whether there is one. */}
                    {current.target_agent_name
                      ? <>Input for <span className="text-brand">{current.target_agent_name}</span></>
                      : (desk.outcome_config?.on_approve?.target_agent_id || current.resulting_execution_id)
                        ? 'Input for the next agent'
                        : 'What the agent concluded'}
                  </h2>
                  {current.message_text && <div className="mt-1"><ClampedText text={current.message_text} /></div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Edited — live while drafting, and permanently once
                      answered, from the record. */}
                  {(current.status === 'pending' ? isEdited(current) : wasEdited(current)) && (
                    <Badge variant="warning" className="text-xs" title="The payload was changed by a person before it went downstream.">
                      Edited
                    </Badge>
                  )}
                  {/* Answered items lead with WHAT WAS DECIDED and who, in
                      the past tense, in that option's colour. */}
                  {current.status === 'pending' ? (
                    <Badge variant="brand" className="text-xs">Pending</Badge>
                  ) : current.chosen_option ? (
                    <Badge variant={choiceToneVariant(styleForOption(current.chosen_option))} className="text-xs">
                      {describeChoice(
                        current.chosen_option_label ?? current.chosen_option,
                        [current.decided_by_first_name, current.decided_by_last_name]
                          .filter(Boolean).join(' ') || null,
                      )}
                    </Badge>
                  ) : (
                    <Badge variant="neutral" className="text-xs capitalize">{current.status}</Badge>
                  )}
                </div>
              </div>

              {isOpen && current.status === 'pending' ? (
                <JsonEditor
                  value={payloadText(current)}
                  onChange={(next) => setDrafts((d) => ({ ...d, [current.id]: next }))}
                  disabled={busy}
                />
              ) : (
                <PayloadBlock value={payloadText(current)} empty="No payload was recorded." />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {isOpen && current.status === 'pending'
                    ? (isEdited(current)
                        ? 'Differs from what the agent produced. This version is what will run, and the edit is recorded.'
                        : 'Exactly what the agent produced. Edit it here if it needs changing before it goes on.')
                    : wasEdited(current)
                      ? 'Changed by a person before it went downstream.'
                      : 'Sent as the agent produced it.'}
                </span>
                {isOpen && current.status === 'pending' && isEdited(current) && (
                  <Button
                    variant="ghost" size="sm" className="shrink-0 text-xs"
                    onClick={() => setDrafts((d) => { const n = { ...d }; delete n[current.id]; return n; })}
                  >
                    <RotateCcw className="h-3 w-3" /> Revert to agent output
                  </Button>
                )}
              </div>

              {/* The note the decider left, once there is one. It was
                  recorded on resolve and then shown nowhere — the one
                  sentence explaining WHY, invisible on the record of what. */}
              {current.status !== 'pending' && current.note && (
                <blockquote className="rounded-md border-l-2 border-brand/50 bg-muted/40 px-3 py-2 text-sm">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Note{[current.decided_by_first_name, current.decided_by_last_name].filter(Boolean).length ? ` · ${[current.decided_by_first_name, current.decided_by_last_name].filter(Boolean).join(' ')}` : ''}
                  </span>
                  <span className="whitespace-pre-wrap">{current.note}</span>
                </blockquote>
              )}

              {current.launch_error && (
                <p className="inline-flex items-start gap-1.5 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>This decision was answered but the agent could not be started: {current.launch_error}</span>
                </p>
              )}

              {current.resulting_execution_id && (
                <p className="text-xs">
                  <Link href={`/agent-history/${current.resulting_execution_id}`} className="text-brand hover:underline">
                    View the run this started <ArrowUpRight className="inline h-3 w-3" />
                  </Link>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Arrived from a Slack button. Confirm rather than auto-apply:
              the point of routing through this screen is that the payload is
              on screen when the decision is made. */}
          {isOpen && current.status === 'pending' && armed && (
            <Card className="border-brand/50 bg-brand/5 dark:bg-brand/10">
              <CardContent className="py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm">
                  You chose{' '}
                  <strong>{options.find((o) => o.key === armed)?.label ?? armed}</strong>
                  {' '}in Slack.
                </span>
                {options.some((o) => o.key === armed) ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => answer(current, options.find((o) => o.key === armed)!)}
                  >
                    Confirm
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    That option no longer exists on this outcome — choose below.
                  </span>
                )}
                <Button size="sm" variant="ghost" onClick={disarm}>Cancel</Button>
              </CardContent>
            </Card>
          )}

          {isOpen && current.status === 'pending' && (
            <Card>
              <CardContent className="py-4 space-y-3">
                <Textarea
                  placeholder="Optional note — why you decided this way"
                  value={notes[current.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [current.id]: e.target.value }))}
                  className="text-sm min-h-[60px]"
                />
                <div className="flex flex-wrap gap-2">
                  {options.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This outcome has no options configured, so there is nothing to choose.
                    </p>
                  ) : options.map((o) => {
                    const launches = o.then?.type === 'run_agent';
                    return (
                      <Button
                        key={o.key}
                        variant={o.style === 'danger' ? 'destructive' : o.style === 'primary' ? 'default' : 'outline'}
                        disabled={busy}
                        onClick={() => answer(current, o)}
                      >
                        {o.label}
                        {/* Saying which buttons start work is the difference
                            between an informed decision and a guess. */}
                        {launches && <span className="ml-1.5 text-xs opacity-70">starts an agent</span>}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* No "Dismiss without acting": Deny is the answer that acts on
          nothing, so a second way to end a desk only asked which of two ends
          to pick. */}
      {isOpen && (
        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <span className="text-xs text-muted-foreground">
            {pendingCount > 0
              ? `${pendingCount} still to answer`
              : `${decidedCount} answered`}
          </span>
        </div>
      )}
    </div>
  );
}
