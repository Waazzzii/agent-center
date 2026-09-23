'use client';

/**
 * The routine editor's slide-out, and the compact row that opens it.
 *
 * The editor is a vertical flow — Trigger, then steps, then On completion —
 * and its job is to let you read that flow at a glance. Configuration inline
 * fought that: a webhook trigger alone rendered its URL, a how-to-trigger
 * block and an API key, so the one card you were least often editing took
 * more vertical space than every step combined.
 *
 * So the flow shows a one-line summary of each end, and editing happens in a
 * panel beside it. A slide-out rather than a centered dialog because the
 * flow stays visible while you work — useful when what you are configuring
 * (which items raise a decision, which agent runs next) only makes sense in
 * relation to the steps above it.
 *
 * Two pieces, deliberately separate: `ConfigRow` is the summary in the flow,
 * `ConfigSlideOut` is the panel. A caller owns the open state so it can also
 * be opened from elsewhere.
 */

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one-line summary that sits in the flow.
 *
 * `section` turns it into a BOOKEND: the bar that opens or closes the flow,
 * rather than one of the steps inside it. Trigger and On completion are not
 * steps — they cannot be reordered, cannot fail the run, and there is exactly
 * one of each — but they used to be told apart from steps only by colour,
 * which is the weakest signal available and the one some people cannot use at
 * all. So the bookends take a different SHAPE: full bleed to the edge of the
 * column, square-shouldered, with the section name set into a leading segment.
 * The steps sit inset from them as rounded, numbered cards. You can tell the
 * three apart in a squint, in greyscale.
 *
 * The section name living INSIDE the bar also removes the floating caption
 * that used to sit above each one, which read as a third kind of thing.
 */
export function ConfigRow({
  icon: Icon, label, summary, configured, onClick, badge, section,
}: {
  icon: LucideIcon;
  label: string;
  summary: string;
  /** Drives the accent. "Configured" means it will actually do something. */
  configured?: boolean;
  onClick: () => void;
  badge?: React.ReactNode;
  /** e.g. "Trigger" / "On completion". Renders the bookend form. */
  section?: string;
}) {
  if (section) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'group w-full flex items-stretch overflow-hidden rounded-md border text-left transition-colors',
          configured
            ? 'border-brand/40 bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/15'
            : 'border-dashed hover:bg-muted/30',
        )}
      >
        {/* The leading segment carries the section name. It is the part that
            makes the bar read as a boundary rather than a card. */}
        <span
          className={cn(
            'flex items-center gap-2 px-3 py-2.5 shrink-0 border-r',
            configured ? 'border-brand/30 bg-brand/10 dark:bg-brand/15' : 'border-dashed bg-muted/40',
          )}
        >
          <Icon className={cn('h-4 w-4 shrink-0', configured ? 'text-brand' : 'text-muted-foreground')} />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {section}
          </span>
        </span>

        <span className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              {badge}
            </span>
            <span className="block text-xs text-muted-foreground truncate">{summary}</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </span>
      </button>
    );
  }

  return (
    <Card
      className={cn(
        'py-0 transition-colors cursor-pointer',
        configured
          ? 'border-brand/40 bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 dark:hover:bg-brand/15'
          : 'border-dashed hover:bg-muted/30',
      )}
    >
      <CardContent className="px-4 py-2.5">
        <button type="button" onClick={onClick} className="w-full flex items-center gap-2.5 text-left">
          <Icon className={cn('h-4 w-4 shrink-0', configured ? 'text-brand' : 'text-muted-foreground')} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              {badge}
            </div>
            <div className="text-xs text-muted-foreground truncate">{summary}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </CardContent>
    </Card>
  );
}

/**
 * The panel.
 *
 * `onSave` is optional — a panel that only presents information (a webhook's
 * URL and key, say) has nothing to save, and showing a dead Save button
 * would imply otherwise.
 */
export function ConfigSlideOut({
  open, onOpenChange, title, description, children, onSave, saving, saveLabel = 'Save',
  tabs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  /**
   * A <PanelTabs> for panels whose content has mutually exclusive modes.
   *
   * Rendered INSIDE the header, above its single border, so the panel has one
   * boundary instead of two hairlines a few pixels apart — and so the tabs
   * read as chrome rather than as the form's first field.
   */
  tabs?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Wide enough for a JSON payload or a webhook URL without wrapping,
        // capped so it never swallows the flow it is meant to sit beside.
        className="w-full sm:max-w-xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className={cn('border-b px-5 pt-4', tabs ? 'gap-3 pb-0' : 'pb-4')}>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
          {/* -mx-0.5 so the first tab's padding lines up with the title
              rather than sitting inset from it. */}
          {tabs && <div className="-mx-0.5">{tabs}</div>}
        </SheetHeader>

        {/* The only scrolling region — the header and footer stay put, so
            Save never scrolls out of reach on a long form. */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        {onSave && (
          <SheetFooter className="border-t px-5 py-3 flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {saveLabel}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
