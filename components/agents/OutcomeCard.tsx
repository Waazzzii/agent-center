'use client';

/**
 * "On completion" — the bookend to the Trigger card.
 *
 * A trigger is how work comes in; an outcome is what happens when the run is
 * done. It sits permanently at the end of the step list and defaults to
 * doing nothing, so its presence is a prompt rather than a step someone has
 * to remember to add.
 *
 * It is deliberately NOT a step. It cannot pause a run, cannot fail one, and
 * has no position to reorder — which is the whole reason it replaced the old
 * approval action.
 *
 * A LIST OF RULES, not one outcome. Every rule is checked against every
 * finished item independently and every match fires, in parallel — so there
 * is no precedence to explain and no fallback to configure. Matching nothing
 * is a normal result, not a gap.
 *
 * One outcome per agent could only ask one question, of one channel, and
 * start one agent. The shape that actually occurs is routing: nine regional
 * queues chosen by a field on the item, which used to mean nine
 * near-identical agents.
 *
 * WHAT A RULE DOES follows from whether it starts an agent. With a follow-on
 * it is a decision; without one it is a notification. That used to be a
 * three-way type picker whose "Nothing" option duplicated deleting the rule
 * and whose "Notify"/"Decision" split could contradict the follow-on agent
 * sitting right below it.
 *
 * The flow shows a one-line summary; the form lives in a slide-out beside it,
 * because expanded inline it pushed the steps off screen and the rules only
 * make sense while you can still see the steps that feed them.
 */

import * as React from 'react';
import { ItemStepper } from '@/components/ui/item-stepper';
import {
  getAgentOutcomes, createAgentOutcome, updateAgentOutcome, deleteAgentOutcome, getAgents,
  type Agent, type AgentOutcome,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { ConfigRow, ConfigSlideOut } from '@/components/agents/ConfigSlideOut';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldRow } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AgentPickerField } from '@/components/agents/AgentPicker';
import { toast } from 'sonner';
import { Flag, Plus, Trash2, MessageSquare, Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Every operator the executor accepts, in the same order and spelling.
 *
 * The list here was a hand-written subset — it omitted gte, lte, empty and
 * not_empty, so four working predicates could be saved through the MCP and
 * then not be represented by this dropdown. Editing such a rule in the UI
 * silently rewrote the operator to whichever one happened to be selected.
 *
 * Keep in lock-step with CONDITIONAL_EXECUTION_OPERATORS in agent-backend's
 * agent-actions.service.js.
 *
 * Labelled in English: `gte` is unambiguous to whoever wrote the backend and
 * a guess to everyone else, and this is a field operators pick from a list,
 * not something they type.
 */
const CONDITION_OPERATORS = [
  { value: 'eq',         label: 'is' },
  { value: 'neq',        label: 'is not' },
  { value: 'contains',   label: 'contains' },
  { value: 'gt',         label: '>' },
  { value: 'gte',        label: '≥' },
  { value: 'lt',         label: '<' },
  { value: 'lte',        label: '≤' },
  { value: 'exists',     label: 'has a value' },
  { value: 'not_exists', label: 'is empty' },
] as const;

/**
 * The backend also accepts `empty` and `not_empty`, which are exact aliases
 * of `not_exists` and `exists`. They are NOT offered: two entries meaning the
 * same thing make a picker worse, not more complete.
 *
 * But a rule saved through the MCP may hold one, and a <select> whose value
 * matches no option renders the first one instead — so saving would quietly
 * rewrite `empty` to `is`. Anything unrecognised gets an option of its own so
 * it round-trips untouched.
 */
function operatorOptions(current: string) {
  const known = CONDITION_OPERATORS.some((o) => o.value === current);
  return known
    ? CONDITION_OPERATORS
    : [...CONDITION_OPERATORS, { value: current, label: current } as const];
}

/**
 * A rule being edited.
 *
 * `key` is a local identity that survives reordering and exists before the
 * server has given the rule an `id` — without it React would re-key the form
 * on every save and a half-typed unsaved rule would lose focus the moment a
 * sibling was added.
 */
interface RuleDraft {
  key: string;
  id: string | null;
  /**
   * The config exactly as loaded, kept so a save can put back the keys this
   * form has no field for.
   *
   * The MCP can set `recipient_user_ids` (who gets @mentioned) and
   * `field_allowlist` (which fields are allowed into the Slack message — a
   * channel is a wider audience than the app). Neither has a control here, and
   * the save writes a whole `config` object, so without this, opening a rule
   * an agent configured and pressing Save silently dropped both — including
   * the allowlist, whose whole job is keeping guest names and addresses out of
   * a channel.
   */
  rawConfig: Record<string, unknown>;
  name: string;
  channel: string;
  template: string;
  expires: number;
  onApprove: string;
  /**
   * The rule's type AS STORED. The backend derives it from on_approve on
   * save, but a rule written another way (MCP, SQL) can be a decision with
   * no follow-on agent — and the list must say what it is, not what this
   * form would make it.
   */
  kind: 'notify' | 'decision';
  isActive: boolean;
  hasCondition: boolean;
  condField: string;
  condOp: string;
  condValue: string;
}

let draftSeq = 0;
const newKey = () => `draft-${++draftSeq}`;

function toDraft(o: AgentOutcome): RuleDraft {
  const c = (o.conditional_execution ?? {}) as Record<string, string>;
  return {
    key: o.id,
    id: o.id,
    rawConfig: (o.config ?? {}) as Record<string, unknown>,
    name: o.name ?? '',
    channel: o.config?.channel_id ?? '',
    template: o.config?.message_template ?? '',
    expires: o.config?.expires_after_hours ?? 24,
    onApprove: o.config?.on_approve?.target_agent_id ?? '',
    kind: o.outcome_type === 'decision' || o.config?.on_approve?.target_agent_id ? 'decision' : 'notify',
    isActive: o.is_active !== false,
    // A stored predicate always has a field — that is what the backend keys
    // on — so its presence is what decides whether the row starts open.
    hasCondition: !!c.field,
    condField: c.field ?? '',
    condOp: c.operator ?? 'eq',
    condValue: c.value ?? '',
  };
}

function emptyDraft(): RuleDraft {
  return {
    key: newKey(), id: null, rawConfig: {}, name: '', channel: '', template: '',
    expires: 24, onApprove: '', kind: 'notify', isActive: true,
    hasCondition: false, condField: '', condOp: 'eq', condValue: '',
  };
}

/** What a rule is called when it has no name of its own. */
function draftLabel(r: RuleDraft, index: number) {
  return r.name.trim() || r.channel.trim() || `Rule ${index + 1}`;
}

export function OutcomeCard({
  orgId, agentId,
}: {
  orgId: string;
  agentId: string;
}) {
  // Loaded here rather than passed in: the editor's own `validSubAgents`
  // state is declared but never populated, so depending on it would give
  // this picker the same empty list the sub-agent picker already has.
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [saved, setSaved]   = React.useState<AgentOutcome[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving]   = React.useState(false);
  const [open, setOpen]       = React.useState(false);

  const [rules, setRules] = React.useState<RuleDraft[]>([]);
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  // Ids removed in this editing session. Held rather than deleted on click so
  // closing the panel without saving puts them back — the same undo every
  // other field in here gets.
  const [removed, setRemoved] = React.useState<string[]>([]);

  const hydrate = React.useCallback((list: AgentOutcome[]) => {
    setSaved(list);
    const drafts = list.map(toDraft);
    setRules(drafts);
    setRemoved([]);
    setActiveKey(drafts[0]?.key ?? null);
  }, []);

  React.useEffect(() => {
    if (!orgId) return;
    getAgents(orgId).then((d) => setAgents(d.agents)).catch(() => {});
  }, [orgId]);

  React.useEffect(() => {
    if (!orgId || !agentId) return;
    getAgentOutcomes(orgId, agentId)
      .then(hydrate)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId, agentId, hydrate]);

  const active = rules.find((r) => r.key === activeKey) ?? null;

  const patch = (key: string, fields: Partial<RuleDraft>) =>
    setRules((prev) => prev.map((r) => (r.key === key ? { ...r, ...fields } : r)));

  const addRule = () => {
    const draft = emptyDraft();
    setRules((prev) => [...prev, draft]);
    setActiveKey(draft.key);
  };

  const removeRule = (key: string) => {
    const target = rules.find((r) => r.key === key);
    if (target?.id) setRemoved((prev) => [...prev, target.id!]);
    const next = rules.filter((r) => r.key !== key);
    setRules(next);
    if (activeKey === key) setActiveKey(next[0]?.key ?? null);
  };

  /**
   * Saves EVERY rule, not just the one on screen.
   *
   * The panel has one Save, and the rule picker is a view onto a list that is
   * all being edited at once. Saving only the visible rule would make
   * switching rules silently discard work — the failure would look like the
   * picker losing your typing.
   */
  const save = async () => {
    const bad = rules.find((r) => !r.channel.trim());
    if (bad) {
      setActiveKey(bad.key);
      toast.error('Every rule needs a Slack channel — without one it can never reach anyone.');
      return;
    }

    try {
      setSaving(true);

      for (const id of removed) {
        await deleteAgentOutcome(orgId, agentId, id);
      }

      for (const [i, r] of rules.entries()) {
        const body = {
          // Stated, not left to derivation: a decision may run nothing on
          // Approve and still be a decision.
          outcome_type: r.kind,
          name: r.name.trim() || null,
          sort_order: i,
          is_active: r.isActive,
          // Gated on BOTH: the row being present and a field being typed into
          // it. An added-but-blank condition must save as no condition rather
          // than as a predicate on the empty field name, which matches
          // nothing and would silently stop the rule firing at all.
          conditional_execution: r.hasCondition && r.condField.trim()
            ? { field: r.condField.trim(), operator: r.condOp, value: r.condValue }
            : {},
          config: {
            // Spread FIRST so the fields below win, and anything this form
            // does not know about survives the round-trip.
            ...r.rawConfig,
            channel_id: r.channel.trim(),
            message_template: r.template.trim() || undefined,
            expires_after_hours: r.expires,
            // The one configurable thing about a rule, and what decides
            // whether it asks anything at all.
            on_approve: r.onApprove ? { target_agent_id: r.onApprove } : null,
          },
        };
        if (r.id) await updateAgentOutcome(orgId, agentId, r.id, body);
        else await createAgentOutcome(orgId, agentId, body);
      }

      hydrate(await getAgentOutcomes(orgId, agentId));
      toast.success('On completion saved');
      setOpen(false);
    } catch (err: unknown) {
      // The server validates the shape and returns a readable reason.
      // Surfacing it verbatim is the point — a bad rule otherwise has no
      // feedback loop at all: the run completes, Slack goes out, someone
      // clicks, and nothing happens.
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      toast.error(e.response?.data?.error ?? e.message ?? 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const live = saved.filter((o) => o.is_active !== false);

  const headline = live.length === 0
    ? 'Nothing'
    : live.length === 1
      ? (live[0].outcome_type === 'decision' ? 'Ask a human to decide' : 'Send a Slack notification')
      : `${live.length} rules`;

  const summary = React.useMemo(() => {
    if (live.length === 0) return 'The run just ends';
    if (live.length === 1) {
      const o = live[0];
      const target = o.config?.on_approve?.target_agent_id;
      if (!target) return 'Sends a notification when the run finishes';
      return `Approve runs ${agents.find((a) => a.id === target)?.name ?? 'another agent'}`;
    }
    // With several rules the useful thing is which ones, not what each does —
    // the names are how someone recognises the queue they care about.
    const names = live.map((o, i) => o.name?.trim() || o.config?.channel_id || `Rule ${i + 1}`);
    const shown = names.slice(0, 3).join(' · ');
    return names.length > 3 ? `${shown} · +${names.length - 3} more` : shown;
  }, [live, agents]);

  return (
    <>
      <ConfigRow
        section="On completion"
        icon={Flag}
        label={headline}
        summary={loading ? 'Loading…' : summary}
        configured={live.length > 0}
        onClick={() => setOpen(true)}
      />

      <ConfigSlideOut
        open={open}
        onOpenChange={(v) => { if (!v) hydrate(saved); setOpen(v); }}
        title="On completion"
        description="Rules checked when this agent finishes. Every match fires; none is fine."
        onSave={save}
        saving={saving}
      >
        <div className="space-y-4">
          {/* Stepping between rules — the same ItemStepper the login pool uses
              to step between browsers, so moving through a set of things
              feels the same everywhere.

              This replaced a list, which existed because "a dropdown shows one
              rule and hides the rest". That concern is answered in the
              options: each is labelled with its kind and whether it is off, so
              opening the dropdown shows every rule at once. The arrows cover
              the common walk-through-them-all case the list never did.

              Not a tab rail: nine regional queues is the case this exists for,
              and nine tabs wrap or scroll sideways. */}
          {rules.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ItemStepper
                noun="rule"
                showPosition
                value={activeKey}
                onChange={setActiveKey}
                triggerClassName="min-w-[200px] max-w-[280px]"
                items={rules.map((r, i) => {
                  const isDecision = r.kind === 'decision';
                  const Icon = isDecision ? Gavel : MessageSquare;
                  return {
                    value: r.key,
                    label: draftLabel(r, i),
                    icon: <Icon className={cn('h-3.5 w-3.5', isDecision ? 'text-brand' : 'text-muted-foreground')} />,
                    hint: `${isDecision ? 'Decision' : 'Notify'}${r.isActive ? '' : ' · Off'}`,
                    muted: !r.isActive,
                  };
                })}
              />
              <Button type="button" variant="outline" size="sm" onClick={addRule}>
                <Plus className="h-3.5 w-3.5" />
                Add rule
              </Button>
            </div>
          )}

          {rules.length === 0 && (
            <>
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                Nothing happens when this agent finishes. Add a rule to notify a channel or ask
                someone to decide.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addRule} className="w-full border-dashed">
                <Plus className="h-3.5 w-3.5" />
                Add rule
              </Button>
            </>
          )}

          {/* A rule an older version switched off. There is no switch any more
              — a rule is set up or removed — so this is the one way back on.
              It used to be a chip on the rule's row in the list; with the list
              gone it sits on the rule itself, where it is also clearer. */}
          {active && !active.isActive && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <span>This rule is switched off, so it never fires.</span>
              <Button type="button" variant="outline" size="sm" onClick={() => patch(active.key, { isActive: true })}>
                Turn on
              </Button>
            </div>
          )}

          {active && (
            <div key={active.key} className="mt-6 border-t pt-6">
              {/* Order follows how a rule gets set up: name it, say what it
                  does, say when, then fill in the Slack details. The type
                  bar that used to sit here ("Posts a notification" + an
                  Active switch) is gone — the stepper above already says
                  Notify or Decision per rule, and a rule is either set up
                  or it isn't. */}
              <FieldGroup title="Rule">
                <FieldRow>
                  {/* Not decoration. Two rules firing on one run produce two
                      decisions that otherwise read identically, in the log
                      and in Slack, with nothing to tell them apart. */}
                  <Field label="Name">
                    <Input
                      value={active.name}
                      onChange={(e) => patch(active.key, { name: e.target.value })}
                      placeholder="e.g. Tucson"
                    />
                  </Field>
                  <Field
                    label="Action type"
                    hint={active.kind === 'decision'
                      ? 'Someone reviews each item and answers Approve or Deny.'
                      : 'Posts to Slack and records nothing to answer.'}
                  >
                    <Select
                      value={active.kind}
                      onValueChange={(v) => patch(active.key, v === 'decision'
                        ? { kind: 'decision' }
                        // Back to a notification: a notification cannot carry
                        // a follow-on agent, so it is dropped with the type.
                        : { kind: 'notify', onApprove: '' })}
                    >
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notify">Notification</SelectItem>
                        <SelectItem value="decision">Decision</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldRow>
                {active.kind === 'decision' && (
                  <Field
                    label="On approve, run"
                    trailing="optional"
                    hint={active.onApprove
                      ? 'The approved item is handed to this agent as its input. Give it a first step that translates if it needs a different shape.'
                      : 'Leave empty to record the judgement only.'}
                  >
                    <AgentPickerField
                      agents={agents.filter((a) => a.id !== agentId)}
                      value={active.onApprove}
                      onChange={(v) => patch(active.key, { onApprove: v })}
                      placeholder="Choose an agent to run on approve…"
                      dialogTitle="Run on approve"
                      dialogDescription="The agent an approved item is handed to."
                    />
                  </Field>
                )}
              </FieldGroup>

              {/* The predicate is what makes rules routing rather than
                  repetition: nine of these differing only by region. "Always"
                  is the stated default, so a rule with no condition says so
                  instead of showing an empty box. */}
              <FieldGroup title="Execute when">
                <div className="space-y-2">
                  <Select
                    value={active.hasCondition ? 'when' : 'always'}
                    onValueChange={(v) => patch(active.key, v === 'always'
                      ? { hasCondition: false, condField: '', condOp: 'eq', condValue: '' }
                      : { hasCondition: true, condOp: active.condOp || 'eq' })}
                  >
                    <SelectTrigger className="w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="always">Always</SelectItem>
                      <SelectItem value="when">Only when a field matches</SelectItem>
                    </SelectContent>
                  </Select>
                  {active.hasCondition && (
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
                      {/* autoFocus: the control that was here is gone, and a
                          Radix dialog whose focused element disappears sees
                          focus land on <body>, treats it as an outside
                          interaction and closes the panel. */}
                      <Input
                        autoFocus
                        value={active.condField}
                        onChange={(e) => patch(active.key, { condField: e.target.value })}
                        placeholder="field, e.g. region"
                        className="font-mono"
                      />
                      <Select value={active.condOp} onValueChange={(v) => patch(active.key, { condOp: v })}>
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {operatorOptions(active.condOp).map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={active.condValue}
                        onChange={(e) => patch(active.key, { condValue: e.target.value })}
                        placeholder="value"
                      />
                    </div>
                  )}
                </div>
                {active.hasCondition && (
                  <p className="text-xs text-muted-foreground">
                    Items that do not match raise nothing from this rule; other rules still get their turn. Items that failed never raise anything.
                  </p>
                )}
              </FieldGroup>

              <FieldGroup title="Slack">
                <FieldRow>
                  <Field label="Channel ID">
                    <Input
                      value={active.channel}
                      onChange={(e) => patch(active.key, { channel: e.target.value })}
                      placeholder="C12345678"
                      className="font-mono"
                    />
                  </Field>
                  {active.onApprove && (
                    <Field label="Expires after" hint="Hours before an unanswered decision lapses.">
                      <div className="relative">
                        <Input
                          type="number" min={1} value={active.expires}
                          onChange={(e) => patch(active.key, { expires: Number(e.target.value) })}
                          className="pr-14"
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">hours</span>
                      </div>
                    </Field>
                  )}
                </FieldRow>
                <Field
                  label="Message"
                  hint={<>Use <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{'{{field}}'}</code> to pull a value from the item, e.g. Appeal for {'{{unit_name}}'}.</>}
                >
                  <Textarea
                    value={active.template}
                    onChange={(e) => patch(active.key, { template: e.target.value })}
                    placeholder="Appeal for {{unit_name}} is ready for review"
                    className="min-h-[76px]"
                  />
                </Field>

                {(() => {
                  // Surfaced, not editable. Preserving them silently is right;
                  // hiding that they exist is not — an allowlist that quietly
                  // governs what reaches a Slack channel should be visible to
                  // whoever is editing the message it filters.
                  const extras: string[] = [];
                  const rc = active.rawConfig as Record<string, any>;
                  if (Array.isArray(rc.recipient_user_ids) && rc.recipient_user_ids.length) {
                    extras.push(`${rc.recipient_user_ids.length} @mention recipient(s)`);
                  }
                  if (Array.isArray(rc.field_allowlist) && rc.field_allowlist.length) {
                    extras.push(`a ${rc.field_allowlist.length}-field Slack allowlist`);
                  }
                  if (!extras.length) return null;
                  return (
                    <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      This rule also carries {extras.join(' and ')}, set outside this panel. Saving
                      here keeps them.
                    </p>
                  );
                })()}
              </FieldGroup>

              <div className="mt-6 flex justify-end border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRule(active.key)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove rule
                </Button>
              </div>
            </div>
          )}

          {rules.length > 1 && (
            <p className="mt-6 text-xs text-muted-foreground">
              All {rules.length} rules are checked against every finished item, independently.
              An item matching two rules raises both.
            </p>
          )}
        </div>
      </ConfigSlideOut>
    </>
  );
}
