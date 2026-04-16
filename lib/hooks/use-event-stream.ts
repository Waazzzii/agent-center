/**
 * useEventStream — subscribe to the backend SSE stream for a set of topics.
 *
 * Usage:
 *
 *   useEventStream({
 *     topics: [`org:${orgId}:interactions`],
 *     onEvent: (ev) => load(),
 *   });
 *
 * Behavior:
 *   • Opens EventSource to `${NEXT_PUBLIC_AGENT_API_URL}/events/stream` with
 *     the user's token as ?token= (EventSource can't set custom headers).
 *   • Auto-reconnects with exponential backoff (native EventSource also
 *     reconnects, but we layer our own so we can cap attempts and surface
 *     a connection status).
 *   • Tab visibility aware — when document.visibilityState === 'hidden'
 *     the stream is closed to free the connection; it re-opens automatically
 *     when the tab becomes visible again.  Zero load from background tabs.
 *   • Deduped + debounced event callbacks can be layered by the caller.
 *
 * The hook returns { connected } so pages can optionally surface a live
 * indicator; by default it's invisible infrastructure.
 */

import { useEffect, useRef, useState } from 'react';

export interface RealtimeEvent {
  topic?: string;
  type: string;
  entityId?: string;
  data?: Record<string, unknown>;
  at?: string;
}

interface Options {
  /** Topics to subscribe to.  When empty, the hook does nothing. */
  topics: string[];
  /** Called for every matching event.  Should be stable (useCallback). */
  onEvent: (ev: RealtimeEvent) => void;
  /** If false, the hook is idle even when topics are provided.  Useful for
   *  gating on auth readiness or org selection. */
  enabled?: boolean;
}

const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || 'http://localhost:8080';
const MAX_BACKOFF_MS = 30_000;

export function useEventStream({ topics, onEvent, enabled = true }: Options) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Stable topic key so we only reconnect when the topic set actually changes.
  const topicKey = topics.slice().sort().join('|');

  useEffect(() => {
    if (!enabled || topics.length === 0) return;
    if (typeof window === 'undefined') return;

    let es: EventSource | null = null;
    let backoffMs = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden') return; // wait for visible

      const token = localStorage.getItem('access_token');
      if (!token) {
        // No token yet — try again shortly.  Avoid spamming.
        reconnectTimer = setTimeout(open, 2000);
        return;
      }

      const url = new URL(`${AGENT_API_URL}/events/stream`);
      url.searchParams.set('topics', topics.join(','));
      url.searchParams.set('token', token);

      es = new EventSource(url.toString());

      es.addEventListener('hello', () => {
        backoffMs = 1000; // reset backoff on successful handshake
        setConnected(true);
      });

      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as RealtimeEvent;
          onEventRef.current(data);
        } catch {
          // Malformed frame — ignore.
        }
      };

      es.onerror = () => {
        setConnected(false);
        if (es) {
          es.close();
          es = null;
        }
        if (disposed) return;
        // Reconnect with exponential backoff, capped.
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        reconnectTimer = setTimeout(open, backoffMs);
      };
    };

    const close = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (es) { es.close(); es = null; }
      setConnected(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Tab hidden — drop the connection to free the server resource.
        close();
      } else if (!es) {
        // Tab back — reopen immediately.
        backoffMs = 1000;
        open();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    open();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, enabled]);

  return { connected };
}
