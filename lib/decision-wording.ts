/**
 * How a decision reads once it has been made, and what colour it carries.
 *
 * Decision options are AUTHOR-SUPPLIED labels — there is no built-in
 * Approve/Deny (see OutcomeOption). So a record of what happened cannot just
 * print the label: "Deny" in a Decided row reads as an instruction still
 * waiting to be carried out, not as something that already happened.
 *
 * Conjugating an arbitrary label is not possible and not worth faking — "Ship
 * it" has no regular past form, and a rule that appends "ed" gives "Ship
 * ited". So: a small table of the verbs people actually use, and for anything
 * else a frame that carries the tense instead of the word.
 *
 * MIRRORED in agent-backend/services/agents/choice-wording.js, which builds
 * the same strings for Slack. Two copies because the repos share no library;
 * keep them in step.
 */

import type { OptionStyle } from '@/lib/api/agents';

/** Lower-cased label → past participle. */
const PAST_TENSE: Record<string, string> = {
  approve: 'Approved',
  deny: 'Denied',
  decline: 'Declined',
  reject: 'Rejected',
  accept: 'Accepted',
  confirm: 'Confirmed',
  cancel: 'Cancelled',
  dismiss: 'Dismissed',
  skip: 'Skipped',
  retry: 'Retried',
  escalate: 'Escalated',
  override: 'Overridden',
  uphold: 'Upheld',
  send: 'Sent',
  publish: 'Published',
  archive: 'Archived',
  ignore: 'Ignored',
  hold: 'Held',
  release: 'Released',
};

/**
 * "Denied", or null when the label has no known past form.
 *
 * Null is a real answer, not a failure — the caller then uses a frame that
 * works with any label rather than inventing a conjugation.
 */
export function pastTenseChoice(label: string | null | undefined): string | null {
  if (!label) return null;
  return PAST_TENSE[label.trim().toLowerCase()] ?? null;
}

/**
 * The past-tense form for display, falling back to the label itself.
 *
 * Unlike describeChoice this never quotes or reframes — it is for table cells
 * and badges, where the surrounding column already supplies the context that
 * a sentence would have to state.
 */
export function choiceLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  return pastTenseChoice(label) ?? label;
}

/**
 * A complete past-tense clause, with the actor when known.
 *
 *   known verb   → "Denied by Brendon Smith"
 *   unknown verb → "Brendon Smith chose “Ship it”"
 *   no actor     → "Denied" / "Chose “Ship it”"
 */
export function describeChoice(
  label: string | null | undefined,
  actorName?: string | null,
): string {
  const past = pastTenseChoice(label);
  const who = actorName?.trim() ? actorName.trim() : null;
  if (past) return who ? `${past} by ${who}` : past;
  const shown = `“${label ?? 'Unknown'}”`;
  return who ? `${who} chose ${shown}` : `Chose ${shown}`;
}

/**
 * The style of a decision option, from its KEY.
 *
 * The buttons are a closed set now — Approve and Deny, fixed in
 * agent-backend's DECISION_OPTIONS — so the key IS the meaning and nothing
 * needs to be looked up. This previously came off the row as
 * `chosen_option_style`, read out of the outcome's authored `config.options`;
 * when options became fixed that array stopped existing, the lookup returned
 * NULL for every row, and every answered pill rendered grey.
 *
 * Keyed, never inferred from wording. A rule reading the label would get the
 * consequential option wrong the moment one is not called "Approve".
 */
export function styleForOption(key: string | null | undefined): OptionStyle | null {
  if (key === 'approve') return 'primary';
  if (key === 'deny')    return 'danger';
  return null;
}

/**
 * Colour for a chosen option.
 */
export function choiceToneClass(style: OptionStyle | null | undefined): string {
  switch (style) {
    case 'danger':  return 'text-danger';
    case 'primary': return 'text-success';
    default:        return 'text-foreground';
  }
}

/** Badge variant for the same signal, for callers rendering a <Badge>. */
export function choiceToneVariant(
  style: OptionStyle | null | undefined,
): 'danger' | 'success' | 'secondary' {
  switch (style) {
    case 'danger':  return 'danger';
    case 'primary': return 'success';
    default:        return 'secondary';
  }
}
