'use client';

/**
 * MultiSelectTags — dropdown multi-select with removable tag chips.
 *
 * Displays selected items as tags with X buttons above a dropdown
 * that shows all available options with checkmarks.
 *
 * The option menu renders in a portal with fixed positioning so it floats
 * above any `overflow` container it lives in (e.g. a scrollable dialog body)
 * instead of being clipped — and it flips up / sizes itself to the available
 * viewport space so the full list is visible without scrolling the page.
 */

import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
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
  /** Show a search box inside the dropdown (auto-on past 6 options). */
  searchable?: boolean;
  /** When set, renders a "+ {createLabel}" footer that calls onCreateNew. */
  onCreateNew?: () => void;
  createLabel?: string;
}

export function MultiSelectTags({ options, selected, onChange, placeholder = 'Select…', disabled, searchable, onCreateNew, createLabel = 'Create new' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the floating menu relative to the trigger, flipping up and
  // sizing to whichever side has more room so the list isn't cramped.
  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const dropUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.floor(dropUp ? spaceAbove : spaceBelow));
    setMenuStyle({
      position: 'fixed',
      left: r.left,
      width: r.width,
      maxHeight,
      ...(dropUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  }, []);

  // Close on outside click (trigger *and* portal menu are both "inside").
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keep the menu glued to the trigger while open (scroll/resize/reflow).
  useEffect(() => {
    if (!open) { setMenuStyle(null); return; }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    // capture: catch scrolls on any ancestor container, not just window
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const showSearch = searchable ?? options.length > 6;
  const q = query.trim().toLowerCase();
  const visibleOptions = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

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
    <div className="relative">
      {/* Selected tags + trigger */}
      <div
        ref={triggerRef}
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

      {/* Dropdown — portaled to <body> so it floats above overflow containers */}
      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="z-50 flex flex-col overflow-hidden rounded-md border bg-popover shadow-md"
        >
          {showSearch && (
            <div className="border-b p-1.5 shrink-0">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                  className="w-full rounded-md border border-input bg-transparent py-1.5 pl-7 pr-2 text-xs outline-none focus:border-brand"
                />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">No options available</div>
            ) : visibleOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">No matches</div>
            ) : (
              visibleOptions.map((opt) => {
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
          {onCreateNew && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onCreateNew(); }}
              className="flex w-full shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-brand transition-colors hover:bg-muted/50"
            >
              <Plus className="h-3 w-3" /> {createLabel}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
