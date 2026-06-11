'use client';

// AI Script Builder — localStorage marker for the active build session.
// Separate storage key from use-active-browser-session so the builder and
// the manual script editor never collide (the completion handoff opens
// RunScriptModal, which manages its own key).

const STORAGE_KEY = 'script_builder_active_session';

/** Builder sessions are server-bounded at ~60 min; allow slack for reads. */
const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000;

export interface ActiveBuilderSession {
  sessionId: string;
  orgId: string;
  createdAt: number;
}

export function getActiveBuilderSession(): ActiveBuilderSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: ActiveBuilderSession = JSON.parse(raw);
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

export function setActiveBuilderSession(session: Omit<ActiveBuilderSession, 'createdAt'>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, createdAt: Date.now() }));
}

export function clearActiveBuilderSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
