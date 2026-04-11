'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared hook for polling a backend resource that may be in "provisioning"
// state while a worker VM boots. Used by both Browser Scripts (RunScriptModal)
// and Agent HITL (BrowserHITLDialog) so the provisioning UX is consistent.
// ---------------------------------------------------------------------------

export interface UseProvisioningPollOptions<T extends { status: string }> {
  /** The run/session ID to poll. Set to null to disable polling. */
  runId: string | null;
  /** Fetch function — receives runId, returns an object with at least { status }. */
  pollFn: (runId: string) => Promise<T>;
  /** Return true while the status means "still provisioning". */
  isProvisioningStatus: (status: string) => boolean;
  /** Called once when provisioning finishes (status is no longer provisioning). */
  onReady: (data: T) => void;
  /** Called if the poll fetch throws (e.g. 503, network error). */
  onError: (err: unknown) => void;
  /** Poll interval in ms. Default 3000. */
  intervalMs?: number;
}

export interface UseProvisioningPollResult {
  /** True while runId is set and the last polled status was still provisioning. */
  isProvisioning: boolean;
  /** Milliseconds elapsed since polling started (updates every poll tick). */
  elapsedMs: number;
  /** Manually stop polling and reset state. */
  cancel: () => void;
}

export function useProvisioningPoll<T extends { status: string }>({
  runId,
  pollFn,
  isProvisioningStatus,
  onReady,
  onError,
  intervalMs = 3000,
}: UseProvisioningPollOptions<T>): UseProvisioningPollResult {
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Keep callbacks in refs so the interval closure always sees the latest
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const pollFnRef = useRef(pollFn);
  pollFnRef.current = pollFn;
  const isProvisioningStatusRef = useRef(isProvisioningStatus);
  isProvisioningStatusRef.current = isProvisioningStatus;

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = 0;
    setIsProvisioning(false);
    setElapsedMs(0);
  }, []);

  useEffect(() => {
    if (!runId) {
      cleanup();
      return;
    }

    // Start polling
    startTimeRef.current = Date.now();
    setIsProvisioning(true);
    setElapsedMs(0);

    intervalRef.current = setInterval(async () => {
      try {
        const data = await pollFnRef.current(runId);

        setElapsedMs(Date.now() - startTimeRef.current);

        if (isProvisioningStatusRef.current(data.status)) {
          return; // still waiting
        }

        // Provisioning complete
        cleanup();
        onReadyRef.current(data);
      } catch (err) {
        cleanup();
        onErrorRef.current(err);
      }
    }, intervalMs);

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, intervalMs]);

  return { isProvisioning, elapsedMs, cancel: cleanup };
}
