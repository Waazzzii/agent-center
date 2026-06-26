'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tag } from '@/lib/api/tags';
import { tagBadgeClass } from './tag-colors';

interface TagBadgeProps {
  tag: Pick<Tag, 'name' | 'color'>;
  /** When provided, renders a removable X button. */
  onRemove?: () => void;
  className?: string;
  title?: string;
}

/** A single colored tag pill. Used in tables, pickers, and the manage screen. */
export function TagBadge({ tag, onRemove, className, title }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap',
        tagBadgeClass(tag.color),
        className,
      )}
      title={title ?? tag.name}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="-mr-0.5 ml-0.5 rounded-full hover:opacity-70"
          aria-label={`Remove ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

interface TagListProps {
  tags?: Tag[] | null;
  /** Show at most this many before collapsing into a "+N" chip. */
  max?: number;
  /** Rendered when there are no tags. Defaults to an em dash. */
  empty?: React.ReactNode;
  className?: string;
}

/**
 * Renders a row of tag badges for a table cell, collapsing overflow into a
 * "+N" chip (the full list shows on hover via title).
 */
export function TagList({ tags, max = 3, empty, className }: TagListProps) {
  if (!tags || tags.length === 0) {
    return <span className="text-muted-foreground">{empty ?? '—'}</span>;
  }
  const shown = tags.slice(0, max);
  const overflow = tags.length - shown.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {shown.map((t) => (
        <TagBadge key={t.id} tag={t} />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded-full border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted-foreground"
          title={tags.map((t) => t.name).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
