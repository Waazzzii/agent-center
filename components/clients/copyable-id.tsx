'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders an opaque id (e.g. a client public_id) as monospace text with a
 * one-click copy affordance. Non-secret, so it's always shown in full-ish —
 * truncated visually but copied in full. Stops row-click propagation so it's
 * safe to drop into a clickable table row.
 */
export function CopyableId({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context / denied permission).
      // Silently no-op — the value is still visible to select manually.
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 max-w-full', className)}>
      <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs" title={value}>
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied' : 'Copy ID'}
        className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}
