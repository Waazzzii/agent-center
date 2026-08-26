'use client';

import * as React from 'react';
import { Info, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { BrowserScript } from '@/lib/api/scripts';

/**
 * The login form's shared building blocks.
 *
 * Extracted from the edit page so the CREATE page can present the same thing.
 * They were identical work rendered two different ways: creating a login needs
 * the same script slots as editing one — you cannot even save a login without a
 * verify script, so "pick one from a list that might be empty" was a dead end
 * whenever the login being set up was the first of its kind.
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
 * A script slot: pick an existing script, or record a new one.
 *
 * With no scripts to choose from, recording becomes the only offered action. An
 * empty select reads as "something is broken"; a single labelled button reads as
 * "do this next" — which is the common case on a brand-new login, where the
 * verify script does not exist yet.
 *
 * Login and verify scripts are hidden from the general Scripts list (they belong
 * to their login), so this row is also the only way to open one for editing.
 */
export function ScriptSlot({
  label, info, scripts, value, onChange, onRecord, onEdit, onDelete,
  recordLabel, emptyHint, allowNone = false, noneLabel = '— None —', required = false,
  disabled = false,
}: {
  label: string;
  info?: React.ReactNode;
  scripts: BrowserScript[];
  value: string | null;
  onChange: (id: string | null) => void;
  onRecord: () => void;
  onEdit: (script: BrowserScript) => void;
  /** Delete the selected script outright. Omit to hide the action. */
  onDelete?: (script: BrowserScript) => void;
  recordLabel: string;
  emptyHint?: string;
  allowNone?: boolean;
  noneLabel?: string;
  required?: boolean;
  /** Greys the whole slot out — used where a login row must exist first. */
  disabled?: boolean;
}) {
  const selected = scripts.find((s) => s.id === value) ?? null;

  return (
    <Field label={label} info={info} required={required}>
      {scripts.length === 0 ? (
        <div className="flex items-center gap-2.5">
          <Button
            type="button" variant="outline" size="sm"
            onClick={onRecord} disabled={disabled} className="shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {recordLabel}
          </Button>
          {emptyHint && (
            <span className="text-[10px] text-muted-foreground leading-snug">{emptyHint}</span>
          )}
        </div>
      ) : (
        <div className={cn('flex items-center gap-2', CONTROL_W)}>
          <Select
            value={value ?? '__none__'}
            onValueChange={(v) => onChange(v === '__none__' ? null : v)}
            disabled={disabled}
          >
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="Select a script…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" disabled={!allowNone}>
                {allowNone ? noneLabel : 'Select a script…'}
              </SelectItem>
              {scripts.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <Button
              type="button" variant="outline" size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => onEdit(selected)}
              disabled={disabled}
              title={`Open "${selected.name}" in the editor`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button" variant="outline" size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onRecord}
            disabled={disabled}
            title={recordLabel}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {/* Deleting lives here because this page is the script's only home —
              they are hidden from the Scripts list, so there was nowhere else to
              remove one from. */}
          {selected && onDelete && (
            <Button
              type="button" variant="ghost" size="icon"
              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(selected)}
              disabled={disabled}
              title={`Delete "${selected.name}"`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
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
