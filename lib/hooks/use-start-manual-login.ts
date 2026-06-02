'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { startLogin, clearLoginSession } from '@/lib/api/logins';
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
 * Before this hook existed, each page hand-rolled the same 3-step
 * sequence — and one of them (the edit page) was MISSING the
 * pre-clear step. That left stale cookies in the session row, and
 * when the operator clicked Log In a third time on a misbehaving
 * login the worker would re-seed the OLD broken state into the
 * fresh slot, defeating the whole point of clicking Log In again.
 * Centralizing here means every entry point gets the SAME behavior:
 *
 *   1. Pre-clear `browser_client_sessions.storage_state` in the DB
 *      to '{}'. Worker-side allocation reads from there and seeds
 *      the new slot with a CLEAN context. Best-effort: a transient
 *      Redis/DB hiccup on this call doesn't block the login.
 *
 *   2. POST /admin/logins/:id/login — kicks off a login_run (kind=
 *      'manual'), allocates a worker slot, navigates to login.url,
 *      pauses for the operator to interact with the noVNC view.
 *
 *   3. Stamp the global active-verify-sessions store so any page
 *      open to /interactions sees the spinner-row immediately. The
 *      caller's component then opens the dialog with the returned
 *      logId.
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
        // Pre-clear the persisted storage_state row. No logId yet
        // (slot hasn't been allocated), so this only touches the DB
        // row — the live worker context wipe doesn't apply.
        // Best-effort: failure here doesn't stop the login.
        await clearLoginSession(orgId, loginId).catch(() => {});

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
