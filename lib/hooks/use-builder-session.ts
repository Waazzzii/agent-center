'use client';

/**
 * useBuilderSession — orchestration for one AI Script Builder session.
 *
 * Data flow (single source of truth = the GET snapshot):
 *   • Initial hydrate from GET (404 → notFound).
 *   • While status === 'provisioning': useProvisioningPoll (5s) until the VM
 *     is up and the agent loop flips the status.
 *   • Live: SSE on `builder:{sessionId}` → debounced (150ms) refetch of the
 *     authoritative GET. No client-side event merging.
 *   • Safety net: 10s poll while non-terminal, in case SSE is down.
 *   • Terminal: everything stops; localStorage marker cleared.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBuilderSession,
  sendBuilderMessage,
  sendBuilderApproval,
  stopBuilderSession,
  isBuilderTerminal,
  type BuilderSession,
} from '@/lib/api/script-builder';
import { useTopicVersions } from '@/lib/hooks/use-topic-versions';
import { useProvisioningPoll } from '@/lib/hooks/use-provisioning-poll';
import { clearActiveBuilderSession } from '@/lib/hooks/use-active-builder-session';

const REFETCH_DEBOUNCE_MS = 150;
const FALLBACK_POLL_MS = 10_000;

export interface UseBuilderSessionResult {
  session: BuilderSession | null;
  loading: boolean;
  notFound: boolean;
  /** SSE link state — surface as a connectivity badge. */
  connected: boolean;
  isProvisioning: boolean;
  provisioningElapsedMs: number;
  refresh: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  approve: (approved: boolean) => Promise<void>;
  stop: () => Promise<void>;
}

export function useBuilderSession(orgId: string | null, sessionId: string | null): UseBuilderSessionResult {
  const [session, setSession] = useState<BuilderSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminal = isBuilderTerminal(session?.status);

  const refresh = useCallback(async () => {
    if (!orgId || !sessionId) return;
    try {
      const snap = await getBuilderSession(orgId, sessionId);
      setSession(snap);
      if (isBuilderTerminal(snap.status)) clearActiveBuilderSession();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 403) {
        setNotFound(true);
        clearActiveBuilderSession();
      }
      // Transient errors: keep the last snapshot; the next poll retries.
    }
  }, [orgId, sessionId]);

  // ── Initial hydrate ──
  useEffect(() => {
    if (!orgId || !sessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snap = await getBuilderSession(orgId, sessionId);
        if (!cancelled) {
          setSession(snap);
          if (isBuilderTerminal(snap.status)) clearActiveBuilderSession();
        }
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (!cancelled && (status === 404 || status === 403)) {
          setNotFound(true);
          clearActiveBuilderSession();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, sessionId]);

  // ── Provisioning poll (VM boot) ──
  const provisioningActive = session?.status === 'provisioning';
  const { isProvisioning, elapsedMs: provisioningElapsedMs } = useProvisioningPoll<BuilderSession>({
    runId: provisioningActive && sessionId ? sessionId : null,
    pollFn: (id) => getBuilderSession(orgId!, id),
    isProvisioningStatus: (status) => status === 'provisioning',
    onReady: (snap) => setSession(snap),
    onError: () => { /* fallback poll keeps retrying */ },
  });

  // ── SSE → debounced authoritative refetch ──
  const onEvent = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void refresh(); }, REFETCH_DEBOUNCE_MS);
  }, [refresh]);

  // Versioned polling (5s) — replaces the SSE stream. The 10s fallback
  // poll below stays as belt-and-suspenders; builder sessions also pull
  // fresh state after each action completes (the API call returns it),
  // so realtime push was never load-bearing here.
  const { connected } = useTopicVersions({
    topics: sessionId ? [`builder:${sessionId}`] : [],
    onChange: onEvent,
    enabled: !!sessionId && !!orgId && !terminal && !notFound,
  });

  // ── Fallback poll while non-terminal ──
  useEffect(() => {
    if (!orgId || !sessionId || terminal || notFound) return;
    const interval = setInterval(() => { void refresh(); }, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [orgId, sessionId, terminal, notFound, refresh]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ── Mutations ──
  const sendMessage = useCallback(async (text: string) => {
    if (!orgId || !sessionId) return;
    await sendBuilderMessage(orgId, sessionId, text);
    await refresh();
  }, [orgId, sessionId, refresh]);

  const approve = useCallback(async (approved: boolean) => {
    if (!orgId || !sessionId) return;
    await sendBuilderApproval(orgId, sessionId, approved);
    // Optimistically clear the banner so it doesn't linger until refetch.
    setSession((prev) => (prev ? { ...prev, pendingApproval: null } : prev));
    await refresh();
  }, [orgId, sessionId, refresh]);

  const stop = useCallback(async () => {
    if (!orgId || !sessionId) return;
    await stopBuilderSession(orgId, sessionId);
    await refresh();
  }, [orgId, sessionId, refresh]);

  return {
    session,
    loading,
    notFound,
    connected,
    isProvisioning: isProvisioning || provisioningActive === true,
    provisioningElapsedMs,
    refresh,
    sendMessage,
    approve,
    stop,
  };
}
