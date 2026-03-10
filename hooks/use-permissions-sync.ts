"use client";

/**
 * usePermissionsSync
 *
 * Opens a Server-Sent Events connection to /admin/me/events.
 * When the backend publishes a `permissions_changed` event for this user
 * (triggered by any access group assignment or removal), the hook silently
 * re-fetches /admin/me and updates the Zustand store — no re-login needed.
 *
 * Authentication uses a one-time ticket (POST /admin/me/events/ticket) so the
 * real JWT never appears in server logs or browser history.
 *
 * Reconnects automatically with exponential backoff on connection errors.
 */

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth.store";
import apiClient from "@/lib/api/client";
import type { AdminUser } from "@/types/api.types";

const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function usePermissionsSync() {
  const admin = useAuthStore((s) => s.admin);
  const updateAdmin = useAuthStore((s) => s.updateAdmin);
  const retryDelay = useRef(BASE_RETRY_MS);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!admin) return;

    async function connect() {
      // Fetch a short-lived one-time ticket so the JWT never appears in logs
      let ticket: string;
      try {
        const { data } = await apiClient.post<{ ticket: string }>("/admin/me/events/ticket");
        ticket = data.ticket;
      } catch {
        // Can't get a ticket — retry after backoff
        retryTimer.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS);
          connect();
        }, retryDelay.current);
        return;
      }

      const es = new EventSource(`${API_URL}/admin/me/events?ticket=${ticket}`);
      esRef.current = es;

      es.addEventListener("permissions_changed", async () => {
        try {
          const { data } = await apiClient.get<AdminUser>("/admin/me");
          updateAdmin(data);
        } catch {
          // Non-fatal — permissions will be refreshed on next token renewal
        }
      });

      es.onopen = () => {
        retryDelay.current = BASE_RETRY_MS; // reset backoff on successful connection
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        // Reconnect with exponential backoff (fetches a fresh ticket each time)
        retryTimer.current = setTimeout(() => {
          retryDelay.current = Math.min(retryDelay.current * 2, MAX_RETRY_MS);
          connect();
        }, retryDelay.current);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [admin?.id, updateAdmin]); // reconnect only if the logged-in user changes
}
