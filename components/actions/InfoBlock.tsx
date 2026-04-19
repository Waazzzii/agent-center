'use client';

import { Info } from 'lucide-react';

/**
 * Shared informational block styled consistently with EntityPreviewNotice —
 * primary color accent + Info icon.  Use anywhere you'd otherwise reach for
 * an ad-hoc colored banner (amber / indigo / sky / violet).
 */
export function InfoBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-brand/20 bg-brand-soft px-3 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">{children}</div>
    </div>
  );
}
