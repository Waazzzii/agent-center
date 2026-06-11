/**
 * useTopicVersions — versioned-polling replacement for useEventStream (SSE).
 *
 * Usage (drop-in shape for the old SSE hook):
 *
 *   useTopicVersions({
 *     topics: [`org:${orgId}:interactions`],
 *     onChange: (changedTopics) => load(true),
 *   });
 *
 * How it works:
 *   • Every publishEvent() on the backend bumps a monotonic version counter
 *     per topic in Redis.
 *   • This hook polls GET /api/agent/events/versions?topics=... (a ~100-byte
 *     response, one Redis MGET server-side) every POLL_VISIBLE_MS while the
 *     tab is visible, and NOT AT ALL while hidden.
 *   • When any topic's version moves past the last seen value, onChange
 *     fires with the changed topic names — the page then refetches whatever
 *     heavy data it owns (same silent-refresh logic it used with SSE).
 *
 * Why polling instead of SSE: an SSE stream counts as an in-flight request
 * on Cloud Run — it pins the serving instance as "active" (billed) for the
 * stream's entire lifetime and blocks instance drain during deploys. The
 * stateless version poll has none of those problems, and the worst-case
 * staleness (one poll interval) is acceptable on every surface that used
 * SSE.
 *
 * Differences from the SSE hook a migrating surface must account for:
 *   • No event payloads — you learn THAT a topic changed, not what the
 *     event was. Pages refetch state instead of branching on event types.
 *   • First successful poll establishes the baseline WITHOUT firing
 *     onChange — pages already load their data on mount; firing would just
 *     double-fetch.
 */

import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Topics to watch. When empty, the hook is idle. */
  topics: string[];
  /** Called with the names of topics whose version moved. Should be stable
   *  or at least safe to call from a ref (we read the latest via ref). */
  onChange: (changedTopics: string[]) => void;
  /** Gate on auth/org readiness. */
  enabled?: boolean;
  /** Poll cadence while the tab is visible. Default 5s. */
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 5_000;
const MAX_ERROR_BACKOFF_MS = 60_000;

export function useTopicVersions({ topics, onChange, enabled = true, intervalMs = DEFAULT_INTERVAL_MS }: Options) {
  const [connected, setConnected] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable topic key so we only restart the loop when the set actually changes.
  const topicKey = topics.slice().sort().join('|');

  useEffect(() => {
    if (!enabled || topics.length === 0) return;
    if (typeof window === 'undefined') return;

    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSeen: Record<string, number> | null = null; // null until baseline poll
    let errorCount = 0;

    const schedule = (ms: number) => {
      if (disposed) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (disposed) return;
      // Hidden tabs poll nothing — visibility handler resumes us.
      if (document.visibilityState === 'hidden') return;

      try {
        const url = new URL('/api/agent/events/versions', window.location.origin);
        url.searchParams.set('topics', topics.join(','));
        const res = await fetch(url.toString(), { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { versions } = (await res.json()) as { versions: Record<string, number> };

        errorCount = 0;
        setConnected(true);

        if (lastSeen === null) {
          // Baseline — record without firing. The page loaded its own data
          // on mount; an immediate onChange would double-fetch.
          lastSeen = versions;
        } else {
          const changed: string[] = [];
          for (const [topic, v] of Object.entries(versions)) {
            if ((lastSeen[topic] ?? 0) !== v) changed.push(topic);
          }
          lastSeen = versions;
          if (changed.length > 0) {
            onChangeRef.current(changed);
          }
        }
        schedule(intervalMs);
      } catch {
        setConnected(false);
        errorCount++;
        // Exponential backoff on errors, capped. Never gives up entirely —
        // the poll is bounded and cheap, and unlike the old SSE viewer
        // loops it stops automatically when the tab is hidden or closed.
        schedule(Math.min(intervalMs * Math.pow(2, errorCount), MAX_ERROR_BACKOFF_MS));
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Back from hidden: poll immediately (catch up), then resume cadence.
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    tick();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, enabled, intervalMs]);

  return { connected };
}
