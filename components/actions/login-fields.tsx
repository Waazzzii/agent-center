'use client';

import * as React from 'react';
import Link from 'next/link';
import { Info, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { ScriptPickerDialog } from './ScriptPickerDialog';
import { cn } from '@/lib/utils';
import type { BrowserScript } from '@/lib/api/scripts';

/**
 * The login form's shared building blocks.
 *
 * Extracted from the edit page so the CREATE page can present the same thing.
 * They were identical work rendered two different ways: creating a login needs
 * the same script slot as editing one, and "pick one from a list that might be
 * empty" was a dead end whenever the login being set up was the first of its
 * kind.
 *
 * Kept as presentational pieces with no data fetching, so create (no row yet)
 * and edit (a row with credentials, 2FA and run history) can both use them
 * without either inheriting the other's lifecycle.
 */

export const CONTROL_W = 'max-w-lg';

/**
 * A small ⓘ next to a label. Explanatory copy lives in here rather than as a
 * line of prose under every control — the explanation is needed once, while the
 * vertical space it costs is paid on every render.
 */
export function InfoBubble({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          // Not a form control: keep it out of the tab order and let the label
          // it annotates carry the accessible description.
          tabIndex={-1}
          className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
          aria-label="More information"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs leading-snug">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/** One labelled control: label above, control below, explanation behind an ⓘ. */
export function Field({
  label, info, required = false, action, children, className,
}: {
  label: string;
  info?: React.ReactNode;
  required?: boolean;
  /** Rendered at the right end of the label row, e.g. a destructive link. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className={cn('flex items-center gap-1.5', CONTROL_W)}>
        <Label className="text-xs">
          {label}{required && <span className="text-destructive"> *</span>}
        </Label>
        {info && <InfoBubble>{info}</InfoBubble>}
        {action && <div className="ml-auto shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Indented block for things that BELONG to the field above it (a script's
 * credentials under the script that declares them), so the relationship is
 * visible rather than stated in prose.
 */
export function FieldNest({ children }: { children: React.ReactNode }) {
  return <div className="pl-3">{children}</div>;
}

/**
 * A script slot: shows what is selected, opens a picker to change it.
 *
 * The picker used to be a native select. That worked at three scripts and fell
 * apart at twenty — no search, no ordering, and no way to see what a script was
 * without selecting it. Worse, edit and delete hung off the SLOT, so removing a
 * script you did not want selected meant selecting it first, which silently
 * repointed the login.
 *
 * Now the slot only displays and opens; ScriptPickerDialog does the choosing,
 * searching and managing. Nothing in the picker changes this login except
 * clicking a row.
 *
 * With no scripts at all, recording is the only offered action — an empty
 * picker reads as "something is broken", a single labelled button reads as
 * "do this next", and that is the common case on a brand-new login.
 */
export function ScriptSlot({
  label, info, scripts, value, onChange, manageHref, manageLabel,
  emptyHint, required = false,
  disabled = false,
}: {
  label: string;
  info?: React.ReactNode;
  scripts: BrowserScript[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** The Login Scripts page — where recording, editing and deleting happen. */
  manageHref: string;
  manageLabel?: string;
  emptyHint?: string;
  required?: boolean;
  /** Greys the whole slot out — used where a login row must exist first. */
  disabled?: boolean;
}) {
  const selected = scripts.find((s) => s.id === value) ?? null;
  const [pickerOpen, setPickerOpen] = React.useState(false);

  return (
    <Field label={label} info={info} required={required}>
      {scripts.length === 0 ? (
        <div className="flex items-center gap-2.5">
          <Button type="button" variant="outline" size="sm" disabled={disabled} asChild={!disabled} className="shrink-0">
            {disabled
              ? <span><Settings2 className="h-3.5 w-3.5 mr-1 inline" />{manageLabel ?? 'Manage scripts'}</span>
              : <Link href={manageHref}><Settings2 className="h-3.5 w-3.5 mr-1" />{manageLabel ?? 'Manage scripts'}</Link>}
          </Button>
          {emptyHint && (
            <span className="text-[10px] text-muted-foreground leading-snug">{emptyHint}</span>
          )}
        </div>
      ) : (
        <div className={cn('flex items-center gap-2', CONTROL_W)}>
          {/* The button IS the current value — clicking anywhere on it opens
              the picker, so there is no separate "change" affordance to hunt
              for. */}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={disabled}
            className={cn(
              'flex-1 min-w-0 flex items-center justify-between gap-2 rounded-md border bg-background',
              'px-3 h-9 text-sm text-left transition-colors',
              disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/40',
            )}
            title={selected ? `${selected.name} — click to change` : 'Choose a script'}
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.name : 'Select a script…'}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {scripts.length} available
            </span>
          </button>
          <Button
            type="button" variant="outline" size="icon"
            className="h-9 w-9 shrink-0"
            disabled={disabled}
            title={manageLabel ?? 'Manage scripts'}
            asChild={!disabled}
          >
            {disabled ? <span><Settings2 className="h-4 w-4" /></span>
                      : <Link href={manageHref}><Settings2 className="h-4 w-4" /></Link>}
          </Button>
        </div>
      )}

      <ScriptPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={`Choose a ${label.toLowerCase()}`}
        description="Recording, editing and deleting live on the Login Scripts page — nothing here changes a script, only which one this login uses."
        scripts={scripts}
        value={value}
        onSelect={onChange}
        manageHref={manageHref}
        manageLabel={manageLabel}
      />
    </Field>
  );
}

/**
 * A section that cannot be configured until the login row exists.
 *
 * Shown rather than hidden, on purpose: the point of matching the edit page is
 * that someone creating a login can see the whole shape of what they are
 * setting up. Hiding credentials and 2FA until after the first save is what made
 * creation feel like a different, lesser form.
 */
export function PendingSection({
  title, description, children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed p-4 space-y-1 opacity-70">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
