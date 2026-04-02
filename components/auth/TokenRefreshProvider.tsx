"use client"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth.store"
import { refreshAccessToken } from "@/lib/auth/oauth"
import { start } from "@/lib/auth/token-refresh"
import apiClient from "@/lib/api/client"
import type { ProductUser } from "@/types/api.types"

/**
 * Mounts the token refresh scheduler for agent-center.
 *
 * Token storage: localStorage (access_token, refresh_token).
 * Expiry:        decoded from the JWT's exp claim.
 * Refresh:       calls wazzi-backend /oauth/token, then re-fetches /products/me
 *                to keep the resolved permissions current.
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
  const admin        = useAuthStore((s) => s.admin)
  const updateTokens = useAuthStore((s) => s.updateTokens)
  const updateAdmin  = useAuthStore((s) => s.updateAdmin)
  const clearAuth    = useAuthStore((s) => s.clearAuth)

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

          // Re-fetch resolved user so permissions stay current after any
          // access level changes
          try {
            const { data } = await apiClient.get<{ user: ProductUser }>("/products/me")
            updateAdmin(data.user)
          } catch {
            // Non-fatal — stale permissions are better than a broken refresh loop
          }

          return Math.floor(Date.now() / 1000) + result.expiresIn
        } catch {
          return null
        }
      },

      onSessionExpired: clearAuth,
      lockName: "agent-center-token-refresh",
      loginPath: "/login",

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
  }, [admin, updateTokens, clearAuth, updateAdmin])

  return null
}
