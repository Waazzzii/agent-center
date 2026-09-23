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
import {
  getAgentOutcomes, createAgentOutcome, updateAgentOutcome, deleteAgentOutcome, getAgents,
  type Agent, type AgentOutcome,
} from '@/lib/api/agents';
import { Button } from '@/components/ui/button';
import { ConfigRow, ConfigSlideOut } from '@/components/agents/ConfigSlideOut';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { toast } from 'sonner';
import { Flag, Filter, X, Plus, Trash2, MessageSquare, Gavel } from 'lucide-react';
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
    expires: 24, onApprove: '', isActive: true,
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
          {/* The rule picker. A dropdown rather than a tab rail because nine
              regional queues is the case this exists for, and nine tabs
              either wrap into three rows or scroll sideways — both of which
              hide the one you are looking for. */}
          <div className="flex items-center gap-2">
            <select
              value={activeKey ?? ''}
              onChange={(e) => setActiveKey(e.target.value)}
              disabled={rules.length === 0}
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
            >
              {rules.length === 0 && <option value="">No rules yet</option>}
              {rules.map((r, i) => (
                <option key={r.key} value={r.key}>
                  {draftLabel(r, i)}{r.isActive ? '' : ' (off)'}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={addRule} className="h-8 gap-1.5 text-xs">
              <Plus className="h-3 w-3" />
              Add rule
            </Button>
          </div>

          {rules.length === 0 && (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing happens when this agent finishes. Add a rule to notify a channel or ask
              someone to decide.
            </p>
          )}

          {active && (
            <div key={active.key} className="space-y-4">
              {/* What this rule IS, stated rather than chosen. It follows from
                  the follow-on agent below, so a picker for it could only
                  contradict that field. */}
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <span className="flex items-center gap-2 text-xs">
                  {active.onApprove ? (
                    <><Gavel className="h-3.5 w-3.5 text-amber-600" /> Asks a human to decide</>
                  ) : (
                    <><MessageSquare className="h-3.5 w-3.5 text-blue-600" /> Posts a notification</>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">Active</Label>
                  <Switch
                    checked={active.isActive}
                    onCheckedChange={(v) => patch(active.key, { isActive: v })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRule(active.key)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  {/* Not decoration. Two rules firing on one run produce two
                      decisions that otherwise read identically, in the log
                      and in Slack, with nothing to tell them apart. */}
                  <Input
                    value={active.name}
                    onChange={(e) => patch(active.key, { name: e.target.value })}
                    placeholder="e.g. Tucson"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Slack channel ID</Label>
                  <Input
                    value={active.channel}
                    onChange={(e) => patch(active.key, { channel: e.target.value })}
                    placeholder="C12345678"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Message</Label>
                <Textarea
                  value={active.template}
                  onChange={(e) => patch(active.key, { template: e.target.value })}
                  placeholder="Supports {{field}} from the item, e.g. Appeal for {{unit_name}}"
                  className="text-xs min-h-[70px]"
                />
              </div>

              {/* The predicate is what makes rules routing rather than
                  repetition: nine of these differing only by region.

                  ADD, THEN EDIT, THEN REMOVE — the same shape the action
                  editor uses for its own conditional. Three inputs were on
                  screen permanently for something many rules do not have, and
                  "no condition" was expressed by leaving a box empty: an
                  invisible state you had to read a caption to learn, and one
                  you clear by deleting text rather than by saying so. An
                  explicit affordance also makes removal a single obvious act,
                  which matters because a half-cleared predicate (field blank,
                  value still filled) looks configured and does nothing. */}
              {!active.hasCondition ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => patch(active.key, {
                    hasCondition: true, condField: '', condOp: 'eq', condValue: '',
                  })}
                  className="h-7 w-fit gap-1.5 border-dashed text-xs"
                >
                  <Filter className="h-3 w-3" />
                  Only when…
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/40 p-2.5 dark:border-amber-700/40 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      <Filter className="h-3 w-3" />
                      Only when
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patch(active.key, {
                        hasCondition: false, condField: '', condValue: '',
                      })}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove condition"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* autoFocus is load-bearing, not a nicety. Clicking
                        "Only when…" unmounts that button, and a Radix Sheet
                        whose focused element disappears sees focus land on
                        <body>, treats it as an interaction outside the panel,
                        and closes the whole thing. Moving focus into the row
                        that replaced it keeps focus inside — and lets you
                        start typing, which is what you came to do anyway. */}
                    <Input
                      autoFocus
                      value={active.condField}
                      onChange={(e) => patch(active.key, { condField: e.target.value })}
                      placeholder="field, e.g. region"
                      className="h-8 text-xs flex-1 min-w-[120px]"
                    />
                    <select
                      value={active.condOp}
                      onChange={(e) => patch(active.key, { condOp: e.target.value })}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      {operatorOptions(active.condOp).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <Input
                      value={active.condValue}
                      onChange={(e) => patch(active.key, { condValue: e.target.value })}
                      placeholder="value"
                      className="h-8 text-xs flex-1 min-w-[120px]"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Items that do not match this rule raise nothing from it — other rules still
                    get their turn. Items that failed never raise anything.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">On approve, run</Label>
                <SearchableSelect
                  value={active.onApprove}
                  onChange={(v) => patch(active.key, { onApprove: v })}
                  options={[{ value: '', label: 'Nothing — just post a notification' },
                            ...agents.filter((a) => a.id !== agentId).map((a) => ({ value: a.id, label: a.name }))]}
                  placeholder="Nothing — just post a notification"
                />
              </div>

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
                  <p className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
                    This rule also carries {extras.join(' and ')}, set outside this panel. Saving
                    here keeps them.
                  </p>
                );
              })()}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Expires after (hours)</Label>
                  <Input
                    type="number" min={1} value={active.expires}
                    onChange={(e) => patch(active.key, { expires: Number(e.target.value) })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <p className={cn('text-[11px] text-muted-foreground')}>
                {active.onApprove
                  ? 'Reviewers get Approve and Deny, plus Review to open the desk and change the ' +
                    'payload before answering. More than one item makes them Approve All and Deny ' +
                    'All, with the answer still recorded per item. The reviewed item is handed to ' +
                    'the next agent as its input — if it needs a different shape, give that agent ' +
                    'a first step that translates; there is no field mapping here on purpose.'
                  : 'Posts to the channel and records nothing to answer. Pick an agent above to ' +
                    'turn this into a decision.'}
              </p>
            </div>
          )}

          {rules.length > 1 && (
            <p className="text-[11px] text-muted-foreground">
              All {rules.length} rules are checked against every finished item, independently.
              An item matching two rules raises both.
            </p>
          )}
        </div>
      </ConfigSlideOut>
    </>
  );
}
