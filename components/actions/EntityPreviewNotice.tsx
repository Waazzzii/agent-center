'use client';

import Link from 'next/link';
import { Info, ExternalLink } from 'lucide-react';

/**
 * Standardized banner shown above entity previews in action configuration
 * dialogs.  Explains that the entity is reusable and provides a link to its
 * edit page.
 *
 * By default the body says "The preview below is read-only", which applies
 * to entity types where no fields are configurable at the workflow level
 * (AI Step, Login, Browser Script).  For sub-agents — where batch_size and
 * max_concurrent ARE editable below — pass a `bodyOverride` describing what
 * the preview actually shows.
 */
export function EntityPreviewNotice({
  entityLabel,
  editHref,
  editLabel,
  bodyOverride,
}: {
  /** e.g. "AI step", "login profile", "browser script", "sub-agent" */
  entityLabel: string;
  /** Route to the CRUD page for this entity type */
  editHref: string;
  /** Link text, e.g. "Actions → Logins" */
  editLabel: string;
  /** Optional override for the body sentence before the link. */
  bodyOverride?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        {bodyOverride ?? `This is a reusable ${entityLabel}. The preview below is read-only.`}{' '}
        <Link href={editHref} className="inline-flex items-center gap-0.5 text-primary hover:underline font-medium">
          {bodyOverride ? `Edit in ${editLabel}` : `edit in ${editLabel}`}
          <ExternalLink className="h-3 w-3" />
        </Link>
        .
      </div>
    </div>
  );
}
