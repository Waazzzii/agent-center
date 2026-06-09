'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { startLogin } from '@/lib/api/logins';
import { setActiveVerifySession } from '@/lib/hooks/use-active-verify-sessions';

/**
 * Hook: shared "start a manual login HITL session" flow.
 *
 * Three pages have a Log In button that opens the noVNC HITL dialog
 * for a login profile:
 *   • Interactions page (group of agents blocked on this login)
 *   • /actions/logins list (manual log-in for the profile)
 *   • /actions/logins/[id] edit page (same, but per-profile context)
 *
 * Two steps every entry point shares:
 *
 *   1. POST /admin/logins/:id/login — kicks off a login_run (kind=
 *      'manual'), allocates a worker slot, navigates to login.url,
 *      pauses for the operator to interact with the noVNC view.
 *
 *   2. Stamp the global active-verify-sessions store so any page
 *      open to /interactions sees the spinner-row immediately. The
 *      caller's component then opens the dialog with the returned
 *      logId.
 *
 * NO pre-clear step. Under the persistent-profile architecture, the
 * worker reuses the per-login profile_path on every allocation and
 * Playwright re-attaches to whatever cookies / localStorage live on
 * disk — so opening a Log In session against an existing profile
 * keeps the operator in whatever logged-in state the site remembers
 * (which is normally what we want — they're often just re-verifying
 * or topping up an expired field). The earlier version of this hook
 * called clearLoginSession() to wipe browser_client_sessions
 * .storage_state before every Log In click — that was a holdover
 * from the pre-persistent-profile architecture where the DB blob
 * WAS the cookie store. It's no longer needed and was actively
 * counterproductive (re-logging-in unnecessarily when the operator
 * just wanted to re-confirm). The Logout button remains the only
 * nuclear option — it deletes the profile_path directory on the
 * worker via startLogout's server-side flow.
 *
 * Returns `{ start, starting }`. `start` returns null on failure
 * (toast already fired), or `{ logId }` on success — the caller
 * uses that to open the dialog.
 *
 * NOTE: this hook does NOT open the dialog itself — each page has
 * its own dialog state (viewingLoginId / activeForDialog / etc.).
 * Same reason it doesn't set the dialog-open boolean: that's
 * page-specific. The hook's job is the cross-page-shared work; UI
 * state stays where it belongs.
 */
export function useStartManualLogin() {
  const [starting, setStarting] = useState(false);

  const start = useCallback(
    async (
      orgId: string,
      loginId: string,
      label: string,
    ): Promise<{ logId: string } | null> => {
      setStarting(true);
      try {
        const result = await startLogin(orgId, loginId);

        // Stamp the cross-page store so /interactions / list pages
        // pick up the active session via their own polling /
        // event-stream wiring without each one duplicating the
        // tracker write.
        setActiveVerifySession({
          entityId: loginId,
          kind: 'login_manual',
          logId: result.executionLogId,
          label,
          mode: 'interactive',
        });

        return { logId: result.executionLogId };
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast.error(e.response?.data?.error || e.message || 'Failed to start login');
        return null;
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  return { start, starting };
}
