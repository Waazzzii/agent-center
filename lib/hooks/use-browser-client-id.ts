'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'browser_scripts_client_id';

/**
 * Returns a stable UUID that identifies this browser instance.
 * Generated once and persisted in localStorage — survives page refreshes and
 * navigation, but is unique per browser/device. Passed to the recording API
 * so the backend can save and restore browser storage state (cookies, auth)
 * between recording sessions.
 */
export function useBrowserClientId(): string | null {
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    setClientId(id);
  }, []);

  return clientId;
}
