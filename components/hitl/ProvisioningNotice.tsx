'use client';

import { Loader2 } from 'lucide-react';

/**
 * Shared "waiting for the browser session" notice.
 *
 * Used by any surface that allocates a browser slot — RunScriptModal,
 * BrowserHITLDialog, login verify/manual flows — so the wait looks the same
 * wherever you meet it.
 *
 * DELIBERATELY QUIET. This used to be an amber card headed "Spinning up a
 * browser", explaining that all slots were in use and a new one was being
 * prepared, typically taking 10–60 seconds. Every part of that described the
 * old dynamically-scaled pool:
 *
 *   • Capacity is FIXED now. There is no scale-up to wait for — a slot is
 *     either free, in which case this lasts about five seconds, or it is not,
 *     in which case the request is rejected outright and you see an error
 *     rather than this.
 *   • So "all browser slots are currently in use" was simply false: it is the
 *     ordinary path, shown every time, worded as though something were wrong.
 *   • Amber, a server icon and a paragraph of explanation is a lot of ceremony
 *     for five seconds. It taught people that opening the editor is an event.
 *
 * A spinner and four words is the right weight for a five-second wait. The
 * escalation stays, because a fixed pool that has not answered in fifteen
 * seconds genuinely is stuck — but it stays a sentence, not a banner.
 */
export function ProvisioningNotice({
  elapsedMs,
  showPersistenceHint = true,
}: {
  /** Optional — after ~15s we say so. With fixed capacity a slot arrives in
   *  about five seconds, so a longer wait is worth naming rather than hiding
   *  behind an indefinite spinner. */
  elapsedMs?: number;
  /** Show the "you can close this window" line. Turn off for interactive flows
   *  where closing isn't allowed (e.g. manual login). */
  showPersistenceHint?: boolean;
}) {
  const slow = (elapsedMs ?? 0) > 15_000;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">
          {slow ? 'Still connecting to the browser…' : 'Connecting to the browser…'}
        </p>
        {slow && (
          <p className="text-xs text-muted-foreground/70 max-w-xs text-center">
            Longer than usual — a slot normally arrives in a few seconds.
          </p>
        )}
        {showPersistenceHint && slow && (
          <p className="text-xs text-muted-foreground/70">
            You can close this window; the session will be waiting.
          </p>
        )}
      </div>
    </div>
  );
}
