'use client';

/**
 * The rhythm of a form.
 *
 * Every panel had been spacing its own fields: `space-y-1`, `space-y-1.5`,
 * `text-xs` labels here, default labels there, a grid with gap-3 next to one
 * with gap-4. None of it wrong on its own; together it is why the inspector
 * felt "off". These three fix the distances once:
 *
 *   FieldGroup   a titled section. 24px between groups, a rule above each
 *                one after the first.
 *   FieldRow     two fields side by side, 16px apart.
 *   Field        label · 6px · control · 6px · hint.
 *
 * Controls are 34px tall across Input, Button, SelectTrigger and
 * SearchableSelect — Field does not restyle them, it only positions them.
 */

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function FieldGroup({
  title, description, children, className, actions,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Right-aligned beside the title — an "Add" button, a toggle. */
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-4 [&+&]:mt-6 [&+&]:border-t [&+&]:pt-6', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>}
            {description && <p className="mt-1 text-xs text-muted-foreground/80">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}

export function Field({
  label, hint, required, htmlFor, children, className, trailing,
}: {
  label: React.ReactNode;
  /** One line under the control. Keep it to what changes the user's decision. */
  hint?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  /** Sits at the right end of the label row — a "How this works" link, a count. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[13px] text-foreground/90">
          {label}
          {required && <span aria-hidden className="text-danger">*</span>}
        </Label>
        {trailing && <span className="text-xs text-muted-foreground">{trailing}</span>}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
