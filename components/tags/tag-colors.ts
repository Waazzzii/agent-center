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
  /** Left rail that runs down a whole group section (grouped agents view). */
  rail: string;
  /** Soft header background for a group section. */
  tint: string;
  /** Group name text color on that tint. */
  text: string;
}

export const TAG_COLORS: TagColorDef[] = [
  { key: 'slate',  label: 'Slate',  badge: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700',   swatch: 'bg-slate-500',
    rail: 'border-l-slate-500', tint: 'bg-slate-50 dark:bg-slate-950/40', text: 'text-slate-700 dark:text-slate-300' },
  { key: 'red',    label: 'Red',    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',                 swatch: 'bg-red-500',
    rail: 'border-l-red-500', tint: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300' },
  { key: 'orange', label: 'Orange', badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800', swatch: 'bg-orange-500',
    rail: 'border-l-orange-500', tint: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300' },
  { key: 'amber',  label: 'Amber',  badge: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800',       swatch: 'bg-amber-500',
    rail: 'border-l-amber-500', tint: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300' },
  { key: 'green',  label: 'Green',  badge: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800',         swatch: 'bg-green-500',
    rail: 'border-l-green-500', tint: 'bg-green-50 dark:bg-green-950/40', text: 'text-green-700 dark:text-green-300' },
  { key: 'teal',   label: 'Teal',   badge: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',             swatch: 'bg-teal-500',
    rail: 'border-l-teal-500', tint: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300' },
  { key: 'blue',   label: 'Blue',   badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',             swatch: 'bg-blue-500',
    rail: 'border-l-blue-500', tint: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300' },
  { key: 'indigo', label: 'Indigo', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-800', swatch: 'bg-indigo-500',
    rail: 'border-l-indigo-500', tint: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300' },
  { key: 'violet', label: 'Violet', badge: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-800', swatch: 'bg-violet-500',
    rail: 'border-l-violet-500', tint: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300' },
  { key: 'pink',   label: 'Pink',   badge: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',             swatch: 'bg-pink-500',
    rail: 'border-l-pink-500', tint: 'bg-pink-50 dark:bg-pink-950/40', text: 'text-pink-700 dark:text-pink-300' },
];

/** Neutral fallback when a tag has no color (or an unknown key). */
export const TAG_COLOR_FALLBACK = 'bg-surface-2 text-muted-foreground border-border';
export const TAG_SWATCH_FALLBACK = 'bg-muted-foreground';
export const TAG_RAIL_FALLBACK = 'border-l-border';
export const TAG_TINT_FALLBACK = 'bg-muted/40';
export const TAG_TEXT_FALLBACK = 'text-foreground';

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

/** Rail / header tint / name color for a group section (grouped agents view). */
export function tagSectionClasses(color: string | null | undefined): { rail: string; tint: string; text: string } {
  const def = color ? BY_KEY.get(color) : undefined;
  return {
    rail: def?.rail ?? TAG_RAIL_FALLBACK,
    tint: def?.tint ?? TAG_TINT_FALLBACK,
    text: def?.text ?? TAG_TEXT_FALLBACK,
  };
}
