"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth.store"
import { refreshAccessToken } from "@/lib/auth/oauth"
import { start } from "@/lib/auth/token-refresh"
import apiClient from "@/lib/api/client"
import type { AdminUser } from "@/types/api.types"

/**
 * Mounts the token refresh scheduler for wazzi-frontend (admin UI).
 *
 * Token storage: localStorage (access_token, refresh_token).
 * Expiry:        decoded from the JWT's exp claim.
 * Refresh:       calls the backend /oauth/token endpoint directly.
 *
 * Cross-tab sync (extraListeners):
 *   When the tab that wins the lock writes new tokens to localStorage, the
 *   browser fires a StorageEvent on every other tab for the same origin.
 *   Those tabs pick up the new expiry and reschedule — no extra network call.
 */

function getTokenExp(token: string | null): number | null {
  if (!token) return null
  try {
    const part = token.split(".")[1]
    if (!part) return null
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

export function TokenRefreshProvider() {
  const admin = useAuthStore((s) => s.admin)
  const updateTokens = useAuthStore((s) => s.updateTokens)
  const updateAdmin = useAuthStore((s) => s.updateAdmin)
  const clearAuth = useAuthStore((s) => s.clearAuth)

  useEffect(() => {
    if (!admin) return

    return start({
      readExp: () => getTokenExp(localStorage.getItem("access_token")),

      refresh: async (signal) => {
        const storedRefresh = localStorage.getItem("refresh_token")
        if (!storedRefresh) return null
        try {
          const result = await refreshAccessToken(storedRefresh, signal)
          localStorage.setItem("access_token", result.accessToken)
          localStorage.setItem("refresh_token", result.refreshToken)
          updateTokens(result.accessToken, result.refreshToken)
          // Refresh admin data so permissions stay current after any access group changes
          try {
            const { data } = await apiClient.get<AdminUser>("/admin/me")
            updateAdmin(data)
          } catch {
            // Non-fatal — stale admin is better than a broken refresh loop
          }
          return Math.floor(Date.now() / 1000) + result.expiresIn
        } catch {
          return null
        }
      },

      onSessionExpired: clearAuth,

      lockName: "admin-token-refresh",
      loginPath: "/login",

      // StorageEvent fires on other tabs when this tab writes to localStorage,
      // allowing them to reschedule without making their own network call.
      extraListeners: (reschedule) => {
        const handleStorage = (e: StorageEvent): void => {
          if (e.key !== "access_token" || !e.newValue) return
          const newExp = getTokenExp(e.newValue)
          if (newExp) {
            updateTokens(e.newValue, localStorage.getItem("refresh_token") ?? "")
            reschedule(newExp)
          }
        }
        window.addEventListener("storage", handleStorage)
        return () => window.removeEventListener("storage", handleStorage)
      },
    })
  }, [admin, updateTokens, clearAuth])

  return null
}
