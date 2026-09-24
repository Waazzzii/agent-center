'use client';

/**
 * A read-only payload, sized for the payloads people actually get.
 *
 * Collapsed to a readable height by default, with the line count in the
 * corner so you know what you are not seeing, and one click to open to the
 * full thing (capped at most of the viewport, scrolling inside). Copy floats
 * over the content on hover. JSON is coloured, runtime keys dimmed.
 *
 * The desk page rendered "what the agent concluded" as a fixed 16rem
 * monochrome <pre>: a forty-field output needed the inner scrollbar to read
 * and gave no sign of how much more there was.
 */

import * as React from 'react';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { JsonHighlight, isJsonText } from '@/components/execution/JsonHighlight';

export function PayloadBlock({
  value, empty = 'Nothing recorded.', collapsedLines = 14, className,
}: {
  /** An object (pretty-printed here) or an already-formatted string. */
  value: unknown;
  empty?: string;
  /** Lines shown before the block needs opening. */
  collapsedLines?: number;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const text = React.useMemo(() => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string') {
      try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
    }
    return JSON.stringify(value, null, 2);
  }, [value]);

  if (!text) return <p className="px-3 py-3 text-xs italic text-muted-foreground">{empty}</p>;

  const lines = text.split('\n').length;
  const overflows = lines > collapsedLines;

  return (
    <div className={cn('group/payload relative overflow-hidden rounded-md border bg-muted/30', className)}>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(text); toast.success('Copied'); }}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/payload:opacity-100"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
      <pre
        className={cn(
          'overflow-auto px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words',
          open ? 'max-h-[70vh]' : 'max-h-[var(--collapsed)]',
        )}
        style={{ ['--collapsed' as string]: `${collapsedLines * 1.625}rem` }}
      >
        {isJsonText(text) ? <JsonHighlight text={text} /> : text}
      </pre>
      {overflows && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-center gap-1 border-t bg-card/60 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground',
            // A fade over the last lines says "there is more" before you read
            // the button.
            !open && 'before:pointer-events-none before:absolute before:inset-x-0 before:bottom-7 before:h-10 before:bg-gradient-to-t before:from-muted/80 before:to-transparent',
          )}
        >
          {open ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {lines} lines</>}
        </button>
      )}
    </div>
  );
}
