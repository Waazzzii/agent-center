/**
 * Proactive token refresh scheduler.
 *
 * Platform-agnostic — how to read the expiry and how to perform the refresh
 * are injected via TokenRefreshOptions. This keeps the core logic identical
 * across wazzi-kb (cookie-based tokens) and wazzi-frontend (localStorage-based
 * tokens) with no duplication.
 *
 * Multi-tab safety via navigator.locks:
 *   - Only one tab performs the network refresh at a time.
 *   - After acquiring the lock, each tab re-reads the expiry; if another tab
 *     already refreshed while it was waiting, it skips the call and reschedules.
 *   - If the lock cannot be acquired within LOCK_WAIT_MS, the tab checks
 *     whether the token is already fresh and reschedules if so. It does NOT
 *     attempt a blind refresh — the reactive 401 layer is the final backstop.
 *
 * ─── Test values — restore before going live ─────────────────────────────────
 * REFRESH_BEFORE_EXPIRY_MS  10_000  →  60_000  (1 min)
 * REFRESH_TIMEOUT_MS         3_000  →  10_000  (10 sec)
 * LOCK_WAIT_MS               2_000  →   5_000  (5 sec)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const REFRESH_BEFORE_EXPIRY_MS = 10_000 // fire this many ms before expiry
const REFRESH_TIMEOUT_MS               = 3_000  // max time for the refresh network call
const LOCK_WAIT_MS                     = 2_000  // max time to wait for the lock

let refreshTimer: ReturnType<typeof setTimeout> | null = null

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TokenRefreshOptions {
  /**
   * Return the current access-token expiry as a Unix timestamp (seconds),
   * or null if the user is not logged in.
   */
  readExp: () => number | null

  /**
   * Perform the token refresh. Must store the new tokens and return the new
   * expiry (Unix seconds). Return null to signal an unrecoverable failure.
   * The provided AbortSignal will fire after REFRESH_TIMEOUT_MS.
   */
  refresh: (signal: AbortSignal) => Promise<number | null>

  /**
   * Path to hard-navigate to when the session cannot be recovered
   * (e.g. "/auth/login" or "/login").
   */
  loginPath: string

  /**
   * Unique navigator.locks name. Must differ between apps sharing an origin.
   * e.g. "kb-token-refresh" or "admin-token-refresh".
   */
  lockName: string

  /**
   * Optional extra event listeners (e.g. StorageEvent for localStorage-based
   * apps to pick up token updates written by other tabs).
   * Receives a `reschedule` callback to call with the new expiry.
   * Must return a cleanup function.
   */
  extraListeners?: (reschedule: (exp: number) => void) => () => void
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clearAndRedirect(loginPath: string): void {
  stop()
  window.location.replace(loginPath)
}

// ─── Core scheduler ───────────────────────────────────────────────────────────

export function scheduleTokenRefresh(exp: number, opts: TokenRefreshOptions): void {
  if (refreshTimer) clearTimeout(refreshTimer)

  const delayMs = Math.max(0, exp * 1000 - Date.now() - REFRESH_BEFORE_EXPIRY_MS)

  refreshTimer = setTimeout(async () => {
    const runRefresh = async (): Promise<void> => {
      // Re-read — another tab may have already refreshed while we waited for the lock.
      const currentExp = opts.readExp()
      if (currentExp && currentExp * 1000 - Date.now() > REFRESH_BEFORE_EXPIRY_MS) {
        scheduleTokenRefresh(currentExp, opts)
        return
      }

      const newExp = await opts.refresh(AbortSignal.timeout(REFRESH_TIMEOUT_MS))
      newExp !== null
        ? scheduleTokenRefresh(newExp, opts)
        : clearAndRedirect(opts.loginPath)
    }

    if (!("locks" in navigator)) {
      // Web Locks not available — refresh directly (old browser / non-secure context).
      await runRefresh()
      return
    }

    try {
      await navigator.locks.request(
        opts.lockName,
        { signal: AbortSignal.timeout(LOCK_WAIT_MS) },
        () => runRefresh(),
      )
    } catch {
      // Could not acquire the lock in time.
      // Check whether another tab already did the refresh; if yes, reschedule.
      // If not, let the token expire — the 401 / middleware layer handles recovery.
      const freshExp = opts.readExp()
      if (freshExp && freshExp * 1000 - Date.now() > REFRESH_BEFORE_EXPIRY_MS) {
        scheduleTokenRefresh(freshExp, opts)
      }
    }
  }, delayMs)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Start the scheduler. Returns a cleanup function suitable for useEffect.
 * No-op (returns empty cleanup) when the user is not logged in.
 */
export function start(opts: TokenRefreshOptions): () => void {
  const exp = opts.readExp()
  if (!exp) return () => {}

  if (exp * 1000 < Date.now()) {
    clearAndRedirect(opts.loginPath)
    return () => {}
  }

  scheduleTokenRefresh(exp, opts)

  // Re-arm when the user returns to the tab (handles laptop-sleep / backgrounding).
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") return
    const freshExp = opts.readExp()
    if (!freshExp || freshExp * 1000 < Date.now()) {
      clearAndRedirect(opts.loginPath)
      return
    }
    scheduleTokenRefresh(freshExp, opts)
  }
  document.addEventListener("visibilitychange", handleVisibilityChange)

  const cleanupExtra = opts.extraListeners?.(
    (newExp) => scheduleTokenRefresh(newExp, opts),
  )

  return () => {
    stop()
    document.removeEventListener("visibilitychange", handleVisibilityChange)
    cleanupExtra?.()
  }
}

/** Cancel any pending refresh timer. */
export function stop(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}
