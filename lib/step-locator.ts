/**
 * Editing WHERE a step acts, without the copies drifting apart.
 *
 * A recorded step names its element in several places at once: `selector`
 * (what the action uses), `waitFor.selector` (what the engine waits for first —
 * usually the same element), the ranked fallbacks in
 * `elementSnapshot.candidates`, and sometimes `text` and a `skip_if_missing`
 * probe. The worker substitutes {{variables}} in all of them.
 *
 * Edit only the first and the step disagrees with itself: the wait still looks
 * for the recorded row, and when the variable selector misses, locateElement
 * falls back to a candidate that still holds the RECORDED value — and acts on
 * the recorded element, reporting success. So every edit here goes through
 * these helpers, which change all of the copies together.
 */
import type { RecordedStep } from '@/lib/api/scripts';

/** The selector the step acts on, as the engine reads it. */
export function primarySelector(step: RecordedStep): string {
  return step.selector ?? step.waitFor?.selector ?? '';
}

/**
 * Set the step's selector, and carry the change to every copy that pointed at
 * the same element: the wait, the fallback with that exact value, and a
 * skip_if_missing probe of it.
 */
export function setPrimarySelector(step: RecordedStep, next: string): RecordedStep {
  const old = primarySelector(step);
  const out: RecordedStep = { ...step, selector: next };
  // The wait follows when it watched the same element (the common case), or
  // when there is no wait yet. A wait on a DIFFERENT element — a readiness
  // signal someone chose on purpose — is left alone.
  if (!step.waitFor || !step.waitFor.selector || step.waitFor.selector === old) {
    out.waitFor = { ...(step.waitFor ?? {}), selector: next };
  }
  const cands = step.elementSnapshot?.candidates;
  if (cands?.some((c) => c.sel === old)) {
    out.elementSnapshot = { ...step.elementSnapshot!, candidates: cands.map((c) => (c.sel === old ? { ...c, sel: next } : c)) };
  }
  if (typeof step.skip_if_missing === 'string' && step.skip_if_missing === old) out.skip_if_missing = next;
  return out;
}

/** Every locator string on the step, labelled — what replaceInLocators rewrites. */
export function locatorStrings(step: RecordedStep): string[] {
  return [
    step.selector, step.waitFor?.selector, step.text,
    typeof step.skip_if_missing === 'string' ? step.skip_if_missing : undefined,
    ...(step.elementSnapshot?.candidates ?? []).map((c) => c.sel),
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);
}

export interface ReplaceResult {
  step: RecordedStep;
  /** How many locator strings changed. */
  changed: number;
  /** Fallbacks removed because they still found the element without the variable. */
  dropped: number;
}

/**
 * Replace a recorded value with a {{variable}} in EVERY locator on the step —
 * selector, wait, text, probe and fallbacks — so they all follow the variable.
 *
 * dropStatic removes the fallbacks that do not contain the variable afterwards
 * (a css path, a positional xpath): they find the RECORDED element whatever the
 * variable says, so when the variable selector misses, the engine would act on
 * the wrong one and call it success. Default on for that reason.
 */
export function replaceInLocators(step: RecordedStep, literal: string, variable: string, dropStatic = true): ReplaceResult {
  const token = `{{${variable}}}`;
  let changed = 0;
  const swap = (s: string | undefined) => {
    if (typeof s !== 'string' || !literal || !s.includes(literal)) return s;
    changed++;
    return s.split(literal).join(token);
  };
  const out: RecordedStep = { ...step };
  if (step.selector != null) out.selector = swap(step.selector);
  if (step.text != null) out.text = swap(step.text);
  if (step.waitFor) {
    out.waitFor = { ...step.waitFor, selector: swap(step.waitFor.selector ?? undefined) ?? step.waitFor.selector };
    if (step.waitFor.description) out.waitFor.description = step.waitFor.description.split(literal).join(token);
  }
  if (typeof step._waitLabel === 'string') out._waitLabel = step._waitLabel.split(literal).join(token);
  if (typeof step.skip_if_missing === 'string') out.skip_if_missing = swap(step.skip_if_missing) as string;

  let dropped = 0;
  if (step.elementSnapshot?.candidates) {
    let cands = step.elementSnapshot.candidates.map((c) => ({ ...c, sel: swap(c.sel) ?? c.sel }));
    if (dropStatic) {
      const kept = cands.filter((c) => c.sel.includes(token));
      dropped = cands.length - kept.length;
      cands = kept;
    }
    out.elementSnapshot = { ...step.elementSnapshot, candidates: cands };
  }
  return { step: out, changed, dropped };
}

/** Variables referenced by any locator on the step. */
export function locatorVariables(step: RecordedStep): string[] {
  const found = new Set<string>();
  for (const s of locatorStrings(step)) for (const m of s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

/**
 * Fallbacks that do NOT use a variable the selector uses — they would find the
 * recorded element regardless, so they defeat the variable on a miss.
 */
export function staticFallbacks(step: RecordedStep): number {
  const vars = (primarySelector(step).match(/\{\{\s*(\w+)\s*\}\}/g) ?? []);
  if (vars.length === 0) return 0;
  return (step.elementSnapshot?.candidates ?? []).filter((c) => !vars.some((v) => c.sel.includes(v))).length;
}
