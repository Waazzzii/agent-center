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
 * round-trip to learn it would make the editor's variable list flicker. What a
 * particular login OFFERS (which secrets it stores) is fetched — see
 * VariablesPanel's loginVariables.
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
  _mfa: {
    name: '_mfa',
    label: "auto — from this login's 2FA method",
    description:
      "The current one-time 2FA code for the login profile driving this run. Where it "
      + "comes from is the login's choice — an enrolled authenticator secret, or a code "
      + "read from a Slack channel — and the script is identical either way. Resolved "
      + "immediately before this step runs, so it cannot go stale. Set the method on the "
      + "login profile; there is nothing to type here.",
  },
};

/**
 * LOGIN SECRETS — mirror of isLoginSecretParam in step-schema.js.
 *
 * Every credential stored on the login a script runs as is available to it as
 * {{_<key>}}: {{_password}}, {{_username}}, {{_account_number}}. The engine
 * fills them from the login's encrypted store, so a signed-in flow that asks
 * for the password again never needs a parameter someone types it into. Only
 * ever the value of a fill or select.
 */
const NOT_LOGIN_SECRETS = new Set([
  '_totp', '_input_id', '_status', '_error', '_disposition',
  '_client_prompt', '_client_media', '_client_video', '_client_video_transcript',
]);

export function isLoginSecretParam(name: string): boolean {
  return /^_[a-zA-Z][a-zA-Z0-9_]*$/.test(name)
    && !Object.prototype.hasOwnProperty.call(RESERVED_PARAMS, name)
    && !NOT_LOGIN_SECRETS.has(name);
}

/** Display metadata for a login-secret variable. */
export function loginSecretMeta(name: string): ReservedParam {
  const key = name.slice(1);
  return {
    name,
    label: `auto — the login's stored ${key}`,
    description:
      `The "${key}" credential stored (encrypted) on the login this script runs as — `
      + "under a pool with separate credentials, the browser's own. Use it as the value of a "
      + 'fill, e.g. a "confirm with your password" dialog. It is never shown here and never '
      + "saved in the script; set it on the login's Credentials tab.",
  };
}

/** True when `name` is an engine-supplied reserved variable. */
export function isReservedParam(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(RESERVED_PARAMS, name) || isLoginSecretParam(name);
}

/** Display metadata for any reserved variable, or null. */
export function reservedParamMeta(name: string): ReservedParam | null {
  if (Object.prototype.hasOwnProperty.call(RESERVED_PARAMS, name)) return RESERVED_PARAMS[name];
  return isLoginSecretParam(name) ? loginSecretMeta(name) : null;
}

/** Reserved variables referenced by a set of variable names. */
export function reservedParamsIn(names: Iterable<string>): ReservedParam[] {
  const out: ReservedParam[] = [];
  for (const n of names) {
    const meta = reservedParamMeta(n);
    if (meta && !out.some((m) => m.name === meta.name)) out.push(meta);
  }
  return out;
}
