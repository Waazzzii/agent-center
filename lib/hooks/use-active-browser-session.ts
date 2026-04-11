'use client';

const STORAGE_KEY = 'browser_scripts_active_session';

/** Max age (ms) before we consider a session stale without even checking the API.
 *  Matches the backend's default SLOT_MAX_MS (2 hours). */
const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000;

export interface ActiveBrowserSession {
  runId: string;
  orgId: string;
  scriptId: string | null;
  mode: 'test' | 'record';
  createdAt: number;
}

/** Read the active session from localStorage, discarding stale entries. */
export function getActiveBrowserSession(): ActiveBrowserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: ActiveBrowserSession = JSON.parse(raw);
    if (Date.now() - session.createdAt > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Persist a new active session. */
export function setActiveBrowserSession(session: Omit<ActiveBrowserSession, 'createdAt'>): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...session, createdAt: Date.now() }),
  );
}

/** Clear the active session (called on clean exit). */
export function clearActiveBrowserSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
