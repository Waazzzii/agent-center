/**
 * Cron reading utilities — description and next-firing calculation.
 *
 * A copy of wazzi-frontend's lib/cron.ts (the data sources schedule dialog),
 * kept in step with it. It evaluates the expression field by field rather than
 * pattern-matching common shapes, so a weekly schedule's next firings are its
 * real ones. The agent page's older describeCron (app/(dashboard)/agents/[id])
 * predates it.
 *
 * Everything is UTC: the backends parse schedules with `tz: "UTC"`, so callers
 * show UTC and the viewer's local time side by side.
 */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** 14 → "2:00 PM" */
function clock12(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${pad(minute)} ${suffix}`;
}

// ─── Field parsing ────────────────────────────────────────────────────────────

/**
 * Expand one cron field into the set of values it matches.
 *
 * Handles `*`, `a`, `a,b`, `a-b`, `*​/n` and `a-b/n` — the whole of standard
 * 5-field cron. Returns null when the field cannot be parsed, which callers treat
 * as "cannot evaluate" rather than "matches nothing": silently matching nothing
 * would render an expression as "never runs", which is a much more alarming and
 * less accurate claim than admitting we could not read it.
 */
function expandField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();

  for (const part of field.split(',')) {
    const chunk = part.trim();
    if (!chunk) return null;

    const [rangePart, stepPart] = chunk.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) return null;

    let lo: number;
    let hi: number;

    if (rangePart === '*' || rangePart === undefined) {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(rangePart);
      // A bare value with a step means "from here to the end of the range",
      // which is how `1/2` (used by this app's presets) is meant to read.
      hi = stepPart === undefined ? lo : max;
    }

    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
    if (lo < min || hi > max || lo > hi) return null;

    for (let v = lo; v <= hi; v += step) out.add(v);
  }

  return out.size > 0 ? out : null;
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** True when the field was literally `*`, which changes day-matching semantics. */
  domRestricted: boolean;
  dowRestricted: boolean;
}

export function parseCron(expr: string): ParsedCron | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour, dom, month, dow] = parts as [string, string, string, string, string];

  const minutes = expandField(min, 0, 59);
  const hours = expandField(hour, 0, 23);
  const daysOfMonth = expandField(dom, 1, 31);
  const months = expandField(month, 1, 12);
  // Accept 7 as Sunday, as most cron implementations do, then fold it onto 0.
  const dowRaw = expandField(dow, 0, 7);

  if (!minutes || !hours || !daysOfMonth || !months || !dowRaw) return null;

  const daysOfWeek = new Set<number>();
  for (const d of dowRaw) daysOfWeek.add(d === 7 ? 0 : d);

  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    domRestricted: dom !== '*',
    dowRestricted: dow !== '*',
  };
}

/**
 * Does this UTC instant match the expression?
 *
 * The day rule is the one piece of cron that is genuinely counter-intuitive: when
 * BOTH day-of-month and day-of-week are restricted, cron matches if EITHER does —
 * not both. `0 0 13 * 5` is "the 13th, and also every Friday", not "Friday the
 * 13th". Getting this backwards silently narrows a schedule.
 */
function matches(d: Date, c: ParsedCron): boolean {
  if (!c.minutes.has(d.getUTCMinutes())) return false;
  if (!c.hours.has(d.getUTCHours())) return false;
  if (!c.months.has(d.getUTCMonth() + 1)) return false;

  const domHit = c.daysOfMonth.has(d.getUTCDate());
  const dowHit = c.daysOfWeek.has(d.getUTCDay());

  if (c.domRestricted && c.dowRestricted) return domHit || dowHit;
  if (c.domRestricted) return domHit;
  if (c.dowRestricted) return dowHit;
  return true;
}

/**
 * The next `count` firing times at or after `from`, in UTC.
 *
 * Walks minute by minute rather than solving for the next match. A 90-day horizon
 * is ~130k iterations of a handful of Set lookups, which is a millisecond or two —
 * cheap enough that correctness is worth more than cleverness here, and it means
 * every valid expression works rather than the handful somebody anticipated.
 *
 * Returns fewer than `count` (possibly none) if the expression genuinely does not
 * fire inside the horizon — `0 0 30 2 *`, the 30th of February, never fires at all.
 */
export function nextFirings(expr: string, count = 3, from: Date = new Date()): Date[] {
  const c = parseCron(expr);
  if (!c) return [];

  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1); // strictly after `from`

  const HORIZON_MINUTES = 90 * 24 * 60;
  const out: Date[] = [];

  for (let i = 0; i < HORIZON_MINUTES && out.length < count; i++) {
    if (matches(cursor, c)) out.push(new Date(cursor));
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }

  return out;
}

// ─── Human description ────────────────────────────────────────────────────────

/** 1 → "1st", 13 → "13th", 22 → "22nd". */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function listNames(values: number[], names: string[]): string {
  const labels = values.map((v) => names[v] ?? String(v));
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Plain-English reading of a cron expression, always naming the zone.
 *
 * Adapted from agent-center's version, with two changes. It now says which zone
 * the time is in — the omission that made a UTC schedule beside a local timestamp
 * unreadable. And it describes what it parsed rather than pattern-matching a fixed
 * set of shapes, so an expression it does not recognise returns null and the caller
 * can say "could not read this" instead of the misleading "Custom schedule", which
 * looks like a valid answer.
 */
export function describeCron(expr: string, tzLabel = 'UTC'): string | null {
  const c = parseCron(expr);
  if (!c) return null;

  const mins = [...c.minutes].sort((a, b) => a - b);
  const hours = [...c.hours].sort((a, b) => a - b);

  const everyMinute = c.minutes.size === 60;
  const everyHour = c.hours.size === 24;

  // ── Sub-hourly ──
  if (everyMinute && everyHour) return 'Every minute';
  if (everyHour && mins.length > 1) {
    const gaps = new Set(mins.slice(1).map((m, i) => m - mins[i]!));
    if (gaps.size === 1) return `Every ${[...gaps][0]} minutes`;
    return `${mins.length} times an hour, at :${mins.map(pad).join(', :')}`;
  }
  if (everyHour && mins.length === 1) {
    return `Every hour at :${pad(mins[0]!)}`;
  }

  // ── Time of day ──
  const timeOfDay =
    mins.length === 1
      ? hours.map((h) => clock12(h, mins[0]!)).join(', ')
      : `${hours.map((h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'AM' : 'PM'}`).join(', ')} at :${mins.map(pad).join(', :')}`;

  // Multi-hour with an even gap reads better as an interval.
  let when = `at ${timeOfDay} ${tzLabel}`;
  // An evenly-spaced hour list reads as an interval, not a list of times.
  let whenIsInterval = false;
  if (hours.length > 2) {
    const gaps = new Set(hours.slice(1).map((h, i) => h - hours[i]!));
    if (gaps.size === 1) {
      when = `every ${[...gaps][0]} hours (from ${clock12(hours[0]!, mins[0] ?? 0)} ${tzLabel})`;
      whenIsInterval = true;
    }
  }

  // ── Which days ──
  const monthPart =
    c.months.size === 12 ? '' : ` in ${listNames([...c.months].sort((a, b) => a - b).map((m) => m - 1), MONTH_NAMES)}`;

  if (c.dowRestricted && !c.domRestricted) {
    const days = [...c.daysOfWeek].sort((a, b) => a - b);
    const weekdaysOnly = days.length === 5 && days.every((d) => d >= 1 && d <= 5);
    const label = weekdaysOnly ? 'every weekday' : `every ${listNames(days, DAY_NAMES)}`;
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${when}${monthPart}`;
  }

  if (c.domRestricted && !c.dowRestricted) {
    const dates = [...c.daysOfMonth].sort((a, b) => a - b);
    return `On the ${dates.map(ordinal).join(', ')} of the month ${when}${monthPart}`;
  }

  if (c.domRestricted && c.dowRestricted) {
    const dates = [...c.daysOfMonth].sort((a, b) => a - b);
    const days = [...c.daysOfWeek].sort((a, b) => a - b);
    // Cron ORs these two, which almost nobody expects — say so explicitly.
    return `On the ${dates.map(ordinal).join(', ')} of the month OR every ${listNames(days, DAY_NAMES)} ${when}${monthPart}`;
  }

  // "Every day every 2 hours" is a stutter; the interval already implies daily.
  if (whenIsInterval) {
    const phrase = when.charAt(0).toUpperCase() + when.slice(1);
    return `${phrase}${monthPart}`;
  }
  return `Every day ${when}${monthPart}`;
}
