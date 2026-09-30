/**
 * Theme-aware styling for Recharts, which renders its own inline-styled DOM and
 * so never sees the app's Tailwind classes.
 *
 * Recharts' default tooltip is a hard-coded WHITE box whose label inherits the
 * page's text colour — near-white in dark mode, which is how the date line
 * became unreadable. These read the theme tokens instead. The tokens are full
 * colours (oklch, see globals.css), so they are used as var(--x) directly;
 * wrapping them in hsl() is invalid CSS and silently falls back.
 */

import type { CSSProperties } from 'react';

export const CHART_GRID_STROKE = 'var(--border)';

/** Spread onto <Tooltip>: {...chartTooltipProps}. */
export const chartTooltipProps: {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
  cursor: { stroke: string; fill: string; strokeOpacity: number; fillOpacity: number };
} = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 6,
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    color: 'var(--popover-foreground)',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
  },
  labelStyle: { color: 'var(--popover-foreground)', fontWeight: 500, marginBottom: 2 },
  itemStyle: { padding: 0 },
  cursor: { stroke: 'var(--border)', fill: 'var(--muted)', strokeOpacity: 1, fillOpacity: 0.4 },
};
