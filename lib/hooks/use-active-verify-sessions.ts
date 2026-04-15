'use client';

/**
 * Persistent store for in-flight login verify sessions (and similar per-entity
 * browser sessions we want to be able to reconnect to).
 *
 * Unlike the single-session `use-active-browser-session` (browser script editor),
 * this is a MAP keyed by entity id (login id) so multiple verifies can be in
 * flight at once.
 *
 * Each entry stores:
 *   logId  — the execution log id (also the Redis routing key for the browser slot)
 *   kind   — 'login_verify' for now, extensible to 'agent_hitl' etc.
 *   label  — what to show the user ("Verifying: Salesforce")
 *   createdAt
 *
 * Closing the dialog does NOT clear the entry — the backend keeps running.
 * The entry is cleared when:
 *   - The backend status transitions to completed/failed/aborted (polled in UI)
 *   - The user explicitly aborts
 *   - TTL expires (2h — matches backend session cap)
 */

const STORAGE_KEY = 'active_verify_sessions';
const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000;

export type VerifyKind = 'login_verify' | 'login_manual';

export interface ActiveVerifySession {
  entityId: string;   // e.g. login id
  kind:     VerifyKind;
  logId:    string;
  label:    string;
  /** 'observe' = user can close/abort; 'interactive' = user must Done or Abort. */
  mode:     'observe' | 'interactive';
  createdAt: number;
}

function readAll(): Record<string, ActiveVerifySession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const map = JSON.parse(raw) as Record<string, ActiveVerifySession>;
    const cutoff = Date.now() - MAX_SESSION_AGE_MS;
    let changed = false;
    for (const [k, v] of Object.entries(map)) {
      if (!v || v.createdAt < cutoff) { delete map[k]; changed = true; }
    }
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    return map;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

function writeAll(map: Record<string, ActiveVerifySession>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  // Broadcast to listeners in this tab (storage event only fires cross-tab)
  try { window.dispatchEvent(new CustomEvent('active-verify-sessions-changed')); } catch { /* SSR */ }
}

export function getActiveVerifySession(entityId: string): ActiveVerifySession | null {
  if (typeof window === 'undefined') return null;
  return readAll()[entityId] ?? null;
}

export function listActiveVerifySessions(): ActiveVerifySession[] {
  if (typeof window === 'undefined') return [];
  return Object.values(readAll());
}

export function setActiveVerifySession(session: Omit<ActiveVerifySession, 'createdAt'>): void {
  if (typeof window === 'undefined') return;
  const map = readAll();
  map[session.entityId] = { ...session, createdAt: Date.now() };
  writeAll(map);
}

export function clearActiveVerifySession(entityId: string): void {
  if (typeof window === 'undefined') return;
  const map = readAll();
  if (map[entityId]) {
    delete map[entityId];
    writeAll(map);
  }
}

/**
 * Subscribe to changes in the active verify sessions store.  Fires on both
 * cross-tab `storage` events and same-tab `active-verify-sessions-changed`.
 */
export function subscribeActiveVerifySessions(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) listener(); };
  const onCustom  = () => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener('active-verify-sessions-changed', onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('active-verify-sessions-changed', onCustom);
  };
}
