'use client';

/**
 * MultiSelectTags — dropdown multi-select with removable tag chips.
 *
 * Displays selected items as tags with X buttons above a dropdown
 * that shows all available options with checkmarks.
 */

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MultiSelectTags({ options, selected, onChange, placeholder = 'Select…', disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const remove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const selectedOptions = options.filter((o) => selected.includes(o.value));

  return (
    <div ref={ref} className="relative">
      {/* Selected tags + trigger */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((p) => !p)}
        onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen((p) => !p); } }}
        className={cn(
          'w-full min-h-[32px] flex items-center flex-wrap gap-1 rounded-md border px-2 py-1 text-left text-sm transition-colors cursor-pointer',
          open ? 'border-brand ring-1 ring-brand/20' : 'border-input hover:border-foreground/30',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground text-xs">{placeholder}</span>
        ) : (
          selectedOptions.map((opt) => (
            <span key={opt.value} className="inline-flex items-center gap-0.5 bg-brand-soft text-brand-soft-fg rounded px-1.5 py-0.5 text-[11px] font-medium">
              {opt.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); remove(opt.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); remove(opt.value); } }}
                className="hover:text-destructive ml-0.5 cursor-pointer"
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </span>
          ))
        )}
        <ChevronDown className={cn('h-3 w-3 text-muted-foreground ml-auto shrink-0 transition-transform', open && 'rotate-180')} />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto py-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground italic">No options available</div>
          ) : (
            options.map((opt) => {
              const isSelected = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors"
                >
                  <div className={cn(
                    'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                    isSelected ? 'bg-brand border-brand' : 'border-border',
                  )}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span className={cn(isSelected && 'font-medium')}>{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
