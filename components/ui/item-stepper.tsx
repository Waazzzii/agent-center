'use client';

/**
 * components/ui/item-stepper.tsx
 *
 * ◀  [ Item 2 of 5 ▾ ]  ▶ — step through a set of things, one at a time.
 *
 * One component rather than a pattern re-implemented per screen, because the
 * whole point is that moving between login pool browsers and moving between
 * decision rules FEEL the same. Two hand-rolled copies drift: one grows a
 * native <select> with its arrow jammed against the right edge, the other a
 * button list, and the app stops reading as one thing.
 *
 * Arrows for the common case (two or three items, you want the next one); the
 * dropdown for when there are ten and you want a specific one.
 *
 * WHY THE TRIGGER GETS EXPLICIT CHILDREN
 *
 * SelectItem wraps its children in Radix's ItemText, and Radix mirrors
 * ItemText into the trigger. So a hint placed in an option ("Needs login",
 * "Decision · Off") would ALSO appear in the trigger, making it long and
 * noisy. Passing SelectValue its own children overrides that: the trigger
 * shows just the position, while each option still says what it is — which is
 * what lets opening the dropdown show every item's state at once.
 */

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface StepperItem {
  value: string;
  /** Shown in the trigger and at the start of each option. */
  label: string;
  /** Shown after the label in the dropdown only — status, kind, and so on. */
  hint?: React.ReactNode;
  /** Optional leading icon in the dropdown. */
  icon?: React.ReactNode;
  /** Mute the option, e.g. a rule that is switched off. */
  muted?: boolean;
}

export function ItemStepper({
  items,
  value,
  onChange,
  noun,
  showPosition = false,
  className,
  triggerClassName,
}: {
  items: StepperItem[];
  value: string | null;
  onChange: (value: string) => void;
  /** "browser", "rule" — for the arrow buttons' accessible names. */
  noun: string;
  /**
   * Show "2 of 5" beside the arrows. For items whose LABEL is meaningful (a
   * rule called "Phoenix queue"), where putting the position in the label
   * would push the name out. Items labelled positionally already say it.
   */
  showPosition?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const idx = Math.max(0, items.findIndex((i) => i.value === value));
  const current = items[idx];
  if (!current) return null;

  const step = (delta: number) => {
    const next = items[idx + delta];
    if (next) onChange(next.value);
  };

  const arrow =
    'inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground ' +
    'transition-colors hover:bg-muted hover:text-foreground ' +
    'disabled:pointer-events-none disabled:opacity-30';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        className={arrow}
        aria-label={`Previous ${noun}`}
        disabled={idx === 0}
        onClick={() => step(-1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <Select value={current.value} onValueChange={onChange}>
        <SelectTrigger size="sm" className={cn('min-w-[150px]', triggerClassName)}>
          <SelectValue>{current.label}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          {items.map((it) => (
            <SelectItem key={it.value} value={it.value} className={cn(it.muted && 'text-muted-foreground')}>
              {it.icon}
              <span className="truncate">{it.label}</span>
              {it.hint && <span className="ml-3 text-xs text-muted-foreground">{it.hint}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        type="button"
        className={arrow}
        aria-label={`Next ${noun}`}
        disabled={idx === items.length - 1}
        onClick={() => step(1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {showPosition && (
        <span className="ml-1 text-xs tabular-nums text-muted-foreground">
          {idx + 1} of {items.length}
        </span>
      )}
    </div>
  );
}
