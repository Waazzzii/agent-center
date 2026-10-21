'use client';

/**
 * Standard pager under a table. Controlled: the page owns page state (and, for
 * server-paged lists, refetches on change). Renders nothing for a single page.
 */

import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function TablePagination({
  page, totalPages, onPageChange, total, className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional total row count, shown alongside the page indicator. */
  total?: number;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const btn = 'inline-grid h-8 w-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className={cn('flex items-center justify-between gap-2 text-sm text-muted-foreground', className)}>
      <span>
        Page {page} of {totalPages}
        {typeof total === 'number' ? ` · ${total} total` : ''}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
