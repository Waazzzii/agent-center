'use client';

/**
 * An editable payload that looks like a read-only one.
 *
 * A <textarea> cannot colour its own text, so this is two layers: a
 * highlighted <pre> that sets the size and does the reading, and a
 * transparent <textarea> laid exactly over it that does the typing. Same
 * font, padding and line height on both, scroll kept in step, so the caret
 * lands on the coloured character it is editing. It shares PayloadBlock's
 * frame — border, height, Copy, "Show all" — so the two payload blocks on
 * the desk page read as a pair rather than a viewer next to a form field.
 *
 * Only JSON-shaped text is coloured; anything else shows plain so a half-
 * typed edit never flickers between styles.
 */

import * as React from 'react';
import { Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { JsonHighlight, isJsonText } from '@/components/execution/JsonHighlight';

const TEXT = 'px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words';

export function JsonEditor({
  value, onChange, disabled, collapsedLines = 14, className, placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  collapsedLines?: number;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const preRef = React.useRef<HTMLPreElement>(null);
  const lines = value.split('\n').length;
  const overflows = lines > collapsedLines;
  const maxH = open ? '70vh' : `${collapsedLines * 1.625}rem`;

  return (
    <div className={cn('group/payload relative overflow-hidden rounded-md border bg-muted/30 focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20', className)}>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(value); toast.success('Copied'); }}
        className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-md border bg-card/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 shadow-sm backdrop-blur transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/payload:opacity-100"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>

      <div className="relative" style={{ maxHeight: maxH }}>
        {/* The mirror. A trailing newline keeps its height honest when the
            text ends in one — otherwise the textarea gains a line the pre
            does not have and the two drift apart at the bottom. */}
        <pre
          ref={preRef}
          aria-hidden
          className={cn(TEXT, 'min-h-[10rem] overflow-auto text-foreground')}
          style={{ maxHeight: maxH }}
        >
          {isJsonText(value) ? <JsonHighlight text={value} /> : value}
          {'\n'}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => { if (preRef.current) { preRef.current.scrollTop = e.currentTarget.scrollTop; preRef.current.scrollLeft = e.currentTarget.scrollLeft; } }}
          disabled={disabled}
          spellCheck={false}
          placeholder={placeholder}
          className={cn(
            TEXT,
            'absolute inset-0 z-10 h-full w-full resize-none overflow-auto bg-transparent text-transparent caret-foreground outline-none',
            'selection:bg-brand/25 disabled:cursor-not-allowed',
            // The mirror is what you read, so its text must not be selected
            // twice: the textarea owns selection, the mirror owns colour.
            'placeholder:text-muted-foreground',
          )}
        />
      </div>

      {overflows && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative z-20 flex w-full items-center justify-center gap-1 border-t bg-card/60 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</> : <><ChevronDown className="h-3.5 w-3.5" /> Show all {lines} lines</>}
        </button>
      )}
    </div>
  );
}
