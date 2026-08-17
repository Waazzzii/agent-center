/**
 * Reserved script variables — the frontend's mirror of
 * RESERVED_SCRIPT_PARAMS in
 * agent-backend/services/script-builder/step-schema.js.
 *
 * These are supplied by the ENGINE at execution time, not typed by an
 * operator. They must never be declared in a script's `parameters`, never
 * renamed, and never rendered as an editable value field — an editable box
 * invites someone to paste a static value that the engine then overwrites
 * (or worse, a static 2FA code that expires 30 seconds later).
 *
 * Keep in sync with the backend set. Deliberately duplicated rather than
 * fetched: it's a two-entry constant that gates rendering, and a network
 * round-trip to learn it would make the editor's variable list flicker.
 */

export interface ReservedParam {
  /** Variable name as written in a step, without braces. */
  name: string;
  /** Short label rendered in place of the value input. */
  label: string;
  /** Hover explanation of where the value comes from. */
  description: string;
}

export const RESERVED_PARAMS: Record<string, ReservedParam> = {
  _totp: {
    name: '_totp',
    label: 'auto — from this login\'s 2FA enrollment',
    description:
      'The current 6-digit authenticator code for the login profile driving this run. '
      + 'A fresh code is generated immediately before this step executes, so it cannot go stale. '
      + 'Enroll the 2FA secret on the login profile; there is nothing to type here.',
  },
};

/** True when `name` is an engine-supplied reserved variable. */
export function isReservedParam(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(RESERVED_PARAMS, name);
}

/** Reserved variables referenced by a set of variable names. */
export function reservedParamsIn(names: Iterable<string>): ReservedParam[] {
  const out: ReservedParam[] = [];
  for (const n of names) {
    const meta = RESERVED_PARAMS[n];
    if (meta && !out.includes(meta)) out.push(meta);
  }
  return out;
}
