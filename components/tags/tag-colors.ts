/**
 * Tag color palette.
 *
 * Each tag stores a `color` key (e.g. "blue"); the UI maps it to a concrete
 * set of Tailwind classes here. Class strings are written out IN FULL (not
 * templated from the key) so Tailwind's content scanner detects them — do NOT
 * refactor these into `bg-${key}-100` style interpolation or they'll be
 * purged from the build.
 */

export interface TagColorDef {
  key: string;
  label: string;
  /** Classes for a soft pill badge (light + dark). */
  badge: string;
  /** Solid swatch for the color picker / legend dot. */
  swatch: string;
}

export const TAG_COLORS: TagColorDef[] = [
  { key: 'slate',  label: 'Slate',  badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',   swatch: 'bg-slate-500' },
  { key: 'red',    label: 'Red',    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',                 swatch: 'bg-red-500' },
  { key: 'orange', label: 'Orange', badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800', swatch: 'bg-orange-500' },
  { key: 'amber',  label: 'Amber',  badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',       swatch: 'bg-amber-500' },
  { key: 'green',  label: 'Green',  badge: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',         swatch: 'bg-green-500' },
  { key: 'teal',   label: 'Teal',   badge: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',             swatch: 'bg-teal-500' },
  { key: 'blue',   label: 'Blue',   badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',             swatch: 'bg-blue-500' },
  { key: 'indigo', label: 'Indigo', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800', swatch: 'bg-indigo-500' },
  { key: 'violet', label: 'Violet', badge: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800', swatch: 'bg-violet-500' },
  { key: 'pink',   label: 'Pink',   badge: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',             swatch: 'bg-pink-500' },
];

/** Neutral fallback when a tag has no color (or an unknown key). */
export const TAG_COLOR_FALLBACK = 'bg-surface-2 text-muted-foreground border-border';
export const TAG_SWATCH_FALLBACK = 'bg-muted-foreground';

const BY_KEY = new Map(TAG_COLORS.map((c) => [c.key, c]));

export function tagBadgeClass(color: string | null | undefined): string {
  return (color && BY_KEY.get(color)?.badge) || TAG_COLOR_FALLBACK;
}

export function tagSwatchClass(color: string | null | undefined): string {
  return (color && BY_KEY.get(color)?.swatch) || TAG_SWATCH_FALLBACK;
}

/** Deterministic default color for a new tag, varied by current count. */
export function nextDefaultColor(index: number): string {
  return TAG_COLORS[index % TAG_COLORS.length].key;
}
