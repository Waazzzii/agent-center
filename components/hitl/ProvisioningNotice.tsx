'use client';

import { Loader2, Server } from 'lucide-react';

/**
 * Shared "waiting for a browser VM" notice.
 *
 * Used by any surface that allocates a browser slot — RunScriptModal,
 * BrowserHITLDialog, login verify/manual flows — so the user gets the same
 * message regardless of which flow they're in.
 *
 * This is intentionally a pure presentational component; the caller decides
 * when to show it (typically while `isProvisioning` from useProvisioningPoll
 * is true).
 */
export function ProvisioningNotice({
  elapsedMs,
  showPersistenceHint = true,
}: {
  /** Optional — if provided, we nudge the "this may take a minute" copy after 30s. */
  elapsedMs?: number;
  /** Show the "you can close this window" footer. Turn off for interactive
   *  flows where closing isn't allowed (e.g. manual login). */
  showPersistenceHint?: boolean;
}) {
  const long = (elapsedMs ?? 0) > 30_000;

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
        <div className="h-14 w-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <Server className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Waiting for a browser VM</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            All browser slots are currently in use. A new VM is being provisioned
            {long ? ' — it&apos;s taking a little longer than usual, hang tight' : ' — this typically takes 1–2 minutes'}.
            The browser will open automatically once it&apos;s ready.
          </p>
        </div>
        {showPersistenceHint && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>You can close this window and come back — your session will be waiting for you.</span>
          </div>
        )}
        {!showPersistenceHint && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>Please wait…</span>
          </div>
        )}
      </div>
    </div>
  );
}
