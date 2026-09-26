'use client';

/**
 * The top of every page, one shape.
 *
 * Pages had drifted: list pages used a 2xl bold title with a small brand
 * glyph, the run detail an xl title beside a blue tile, the agent editor no
 * breadcrumb at all while the run detail had one, and the decision desk a
 * semibold title. Same job, four answers.
 *
 *   [breadcrumb › trail]
 *   [icon tile]  Title  [badge]                         [actions]
 *                meta · line
 *
 * The icon sits on a soft brand tile at list and detail level alike, so a
 * page's identity reads the same whether you arrived from the sidebar or by
 * drilling in. `icon` may be any node — the run detail passes a step-type
 * tile so a step page wears its type.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title, icon, badge, description, meta, actions, breadcrumbs, className,
}: {
  title: React.ReactNode;
  /** A lucide icon (rendered on a brand tile) or a ready-made node. */
  icon?: LucideIcon | React.ReactNode;
  /** Status or state, beside the title. */
  badge?: React.ReactNode;
  /** One sentence under the title. Kept to one line; a longer one gets an inline "more". */
  description?: React.ReactNode;
  /** Facts under the title — timestamps, ids, links. Replaces description when both are wanted in one row. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
}) {
  let iconNode: React.ReactNode = null;
  if (icon) {
    // Lucide icons are forwardRef objects, not elements — anything that is
    // not already an element is treated as a component to render.
    if (!React.isValidElement(icon)) {
      const Icon = icon as LucideIcon;
      iconNode = (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-soft-fg">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      );
    } else {
      iconNode = icon;
    }
  }

  return (
    <header className={cn('space-y-3', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
          {breadcrumbs.map((c, i) => {
            const last = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={`${c.label}-${i}`}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                {c.href && !last ? (
                  <Link href={c.href} className="truncate transition-colors hover:text-foreground">{c.label}</Link>
                ) : (
                  <span className={cn('truncate', last && 'text-foreground font-medium')}>{c.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Stacks on a phone: title row first, actions on their own row
          beneath. Side by side at 375px the title truncated to three letters
          to make room for two buttons. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-x-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {iconNode}
          <div className="min-w-0 flex-1">
            <div className="flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight sm:truncate sm:text-2xl">{title}</h1>
              {badge}
            </div>
            {description && <HeaderDescription>{description}</HeaderDescription>}
            {meta && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {meta}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * The description line. One line by default; a description that does not fit
 * is cut with an ellipsis and gets an inline "more" that expands it in place
 * ("less" folds it back). Nothing moves until you ask — a long agent
 * description no longer pushes the whole editor down on load — and it works
 * the same by mouse, keyboard and touch. Short descriptions render exactly as
 * before, with no control at all.
 */
function HeaderDescription({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  // Measured on the one-line form only (expanded text never overflows), and
  // re-measured as the header resizes — window, sidebar collapse.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    const check = () => setCut(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, expanded]);

  const toggle = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      className="shrink-0 text-sm font-medium text-brand hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {expanded ? 'less' : 'more'}
    </button>
  );

  if (expanded) {
    return (
      <p className="mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground">
        {children} {toggle}
      </p>
    );
  }
  return (
    <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
      <p ref={ref} className="min-w-0 truncate text-sm text-muted-foreground">{children}</p>
      {cut && toggle}
    </div>
  );
}

/** A middot separator for PageHeader `meta` rows. */
export function MetaSep() {
  return <span aria-hidden className="text-text-dim">·</span>;
}
