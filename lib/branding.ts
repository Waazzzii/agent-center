/**
 * Fetch agent-center branding config from the backend.
 * Mirrors admin-center's lib/branding.ts pattern.
 * Uses Next.js fetch caching — revalidates every hour, tagged per host.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

export interface CenterBranding {
  name: string | null
  logo_storage_path: string | null
  favicon_storage_path: string | null
  custom_theme: string | null
}

export async function getAgentCenterBranding(host: string): Promise<CenterBranding> {
  try {
    const res = await fetch(`${BACKEND_URL}/centers/agent/branding`, {
      headers: {
        "Content-Type": "application/json",
        "X-Wazzi-Domain": host,
      },
      next: { revalidate: 3600, tags: [`agc-branding:${host}`] },
    })
    if (!res.ok) return { name: null, logo_storage_path: null, favicon_storage_path: null, custom_theme: null }
    return res.json()
  } catch {
    return { name: null, logo_storage_path: null, favicon_storage_path: null, custom_theme: null }
  }
}
