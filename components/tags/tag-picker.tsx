'use client';

/**
 * TagPicker — assignment input for an entity's edit/create form. Shows the
 * currently-selected tags as removable pills, with a search box that filters
 * existing tags and offers to create a new one inline.
 *
 * State model: the parent owns `selected` (tag ids) and the `tags` list.
 * onCreate should persist a new tag and return it; the picker selects it and
 * the parent should fold it into `tags` so it renders immediately.
 */

import { useMemo, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/lib/api/tags';
import { TagBadge } from './tag-badge';
import { tagSwatchClass } from './tag-colors';

interface TagPickerProps {
  tags: Tag[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Persist a new tag (by name) and return it. Omit to disable inline create. */
  onCreate?: (name: string) => Promise<Tag | null>;
  disabled?: boolean;
  placeholder?: string;
}

export function TagPicker({ tags, selected, onChange, onCreate, disabled, placeholder = 'Add tags…' }: TagPickerProps) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const selectedTags = selected.map((id) => byId.get(id)).filter(Boolean) as Tag[];

  const q = input.trim().toLowerCase();
  const suggestions = tags.filter(
    (t) => !selected.includes(t.id) && (q === '' || t.name.toLowerCase().includes(q)),
  );
  const exactExists = tags.some((t) => t.name.toLowerCase() === q);
  const canCreate = !!onCreate && q.length > 0 && !exactExists;

  const add = (id: string) => {
    onChange([...selected, id]);
    setInput('');
    inputRef.current?.focus();
  };

  const remove = (id: string) => onChange(selected.filter((v) => v !== id));

  const handleCreate = async () => {
    if (!onCreate || !q || creating) return;
    setCreating(true);
    try {
      const created = await onCreate(input.trim());
      if (created) {
        onChange([...selected, created.id]);
        setInput('');
        inputRef.current?.focus();
      }
    } finally {
      setCreating(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions.length > 0) add(suggestions[0].id);
      else if (canCreate) handleCreate();
    } else if (e.key === 'Backspace' && input === '' && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-[38px] flex-wrap items-center gap-1 rounded-md border border-input px-2 py-1.5 text-sm',
          open && 'border-brand ring-1 ring-brand/20',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}
      >
        {selectedTags.map((t) => (
          <TagBadge key={t.id} tag={t} onRemove={disabled ? undefined : () => remove(t.id)} />
        ))}
        <input
          ref={inputRef}
          value={input}
          disabled={disabled}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (suggestions.length > 0 || canCreate) && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(t.id); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', tagSwatchClass(t.color))} />
              <span className="flex-1 truncate">{t.name}</span>
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
              className="flex w-full items-center gap-2 border-t px-3 py-1.5 text-left text-xs text-brand transition-colors hover:bg-muted/50"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              Create “{input.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
