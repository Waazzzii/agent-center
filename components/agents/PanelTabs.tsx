'use client';

/**
 * The tab rail a configuration panel opens with.
 *
 * ONE of these, because four had accumulated and no two looked alike: the
 * agent page's underline tabs, the outcome panel's three filled buttons, the
 * AI step panel's segmented pill toggle, and a bordered segmented control
 * that briefly replaced the first. Every one of them answered the same
 * question — which of these mutually exclusive modes am I in — and a reader
 * moving between two panels had to work that out again from the styling.
 *
 * WHAT BELONGS HERE: choices that are mutually exclusive and that change what
 * the rest of the panel shows. "Nothing / Notify / Decision" qualifies; so
 * does "New AI step / Use existing". Sections of one form do NOT — if you
 * need to see two of them at once while editing, they are sections, and
 * hiding one behind a tab makes the form worse rather than tidier.
 *
 * IT LIVES IN THE PANEL HEADER, and carries no rule of its own. The first
 * version sat above the body with its own `border-b`, which put a hairline a
 * few pixels under the header's — two lines for one boundary, and the AI step
 * panel needed negative margins to stretch its rail full-bleed past the
 * body's padding. Rendering it inside the header fixes both: the header's
 * single border is the boundary, the tabs are visibly chrome rather than the
 * form's first field, and nothing has to fight the padding.
 *
 * Underline rather than a segmented pill because the active tab's underline
 * meets that border, which is what ties the selector to the panel it governs.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PanelTab<T extends string> {
  value: T;
  label: string;
  /** Rendered after the label, muted — e.g. a count. */
  hint?: string;
  disabled?: boolean;
}

export function PanelTabs<T extends string>({
  tabs, value, onChange, className,
}: {
  tabs: readonly PanelTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative px-2.5 pb-2.5 pt-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
              active
                // -bottom-px overlaps the header's border by a pixel. The
                // header sets pb-0 when it carries tabs, so this row's own
                // bottom padding IS the gap to that border — offsetting by
                // the padding instead left the underline floating below it.
                ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.hint && <span className="ml-1.5 text-[10px] text-muted-foreground">{t.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
