'use client';

import { useSyncExternalStore } from 'react';

/**
 * `true` when `query` matches. Server and first client render return
 * `fallback`, so a component that changes shape by viewport does not
 * hydrate as one shape and snap to another.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
