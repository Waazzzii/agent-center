/**
 * Time windows for list pages (Executions, Decisions, Factory Jobs).
 *
 * A bound is a string, so it round-trips through the URL and localStorage
 * unchanged. Three shapes, '' meaning unbounded on that side:
 *
 *   now-<N>m           RELATIVE — N minutes before the moment the list loads.
 *                      Every preset is one of these, so "Last hour" still
 *                      means the last hour after a reload or a week later.
 *   YYYY-MM-DD         a whole day, local time: the start of it as `from`,
 *                      the end of it as `to`. Older saved views use this.
 *   YYYY-MM-DDTHH:mm   an exact local time (the custom range inputs).
 *
 * Nothing stores a "mode": a preset is just a relative bound, and the label
 * is derived from the bounds every render, so it cannot disagree with them.
 */

export interface TimePreset {
  label: string;
  /** Window length, ending now. */
  minutes: number;
}

const HOUR = 60;
const DAY = 24 * HOUR;

export const TIME_PRESETS: TimePreset[] = [
  { label: 'Last 15 minutes', minutes: 15 },
  { label: 'Last hour',       minutes: HOUR },
  { label: 'Last 6 hours',    minutes: 6 * HOUR },
  { label: 'Last 24 hours',   minutes: DAY },
  { label: 'Last 7 days',     minutes: 7 * DAY },
  { label: 'Last 30 days',    minutes: 30 * DAY },
  { label: 'Last 90 days',    minutes: 90 * DAY },
];

/** The bound a preset applies as `from`. */
export const presetBound = (p: TimePreset) => `now-${p.minutes}m`;

/** Where a first visit starts: 30 days back, rather than all of history. */
export const DEFAULT_FROM = presetBound(TIME_PRESETS.find((p) => p.minutes === 30 * DAY)!);

const RELATIVE = /^now-(\d+)m$/;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The instant a bound stands for, as ISO — what the APIs take. A whole-day
 * `to` is the last millisecond of that day so the day is included.
 * Unparseable input is treated as unbounded rather than sent as "Invalid Date".
 */
export function boundToIso(v: string, side: 'from' | 'to'): string | undefined {
  if (!v) return undefined;
  const rel = RELATIVE.exec(v);
  if (rel) return new Date(Date.now() - Number(rel[1]) * 60_000).toISOString();
  const d = DAY_ONLY.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  if (DAY_ONLY.test(v) && side === 'to') d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** { from, to } as ISO for an API call, omitting unbounded sides. */
export function rangeParams(from: string, to: string): { from?: string; to?: string } {
  const f = boundToIso(from, 'from');
  const t = boundToIso(to, 'to');
  return { ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) };
}

/**
 * A bound as the value of a datetime-local input. Relative bounds resolve to
 * the instant they mean now, so "Custom" opens on the window you're looking at.
 */
export function boundToInput(v: string, side: 'from' | 'to'): string {
  if (!v) return '';
  if (DAY_ONLY.test(v)) return `${v}T${side === 'from' ? '00:00' : '23:59'}`;
  const iso = boundToIso(v, side);
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatBound(v: string): string {
  const rel = RELATIVE.exec(v);
  if (rel) {
    const p = TIME_PRESETS.find((x) => x.minutes === Number(rel[1]));
    return p ? p.label.replace(/^Last /, '') + ' ago' : `${rel[1]} minutes ago`;
  }
  if (DAY_ONLY.test(v)) {
    return new Date(`${v}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** What the picker's button says — a pure function of the bounds. */
export function timeRangeLabel(from: string, to: string): string {
  if (!from && !to) return 'Any time';
  if (from && !to) {
    const preset = TIME_PRESETS.find((p) => presetBound(p) === from);
    return preset ? preset.label : `Since ${formatBound(from)}`;
  }
  if (!from && to) return `Up to ${formatBound(to)}`;
  return `${formatBound(from)} – ${formatBound(to)}`;
}
