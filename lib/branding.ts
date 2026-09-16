/**
 * Branding — the org's logo, icon and company name for this center.
 *
 * STANDARD MODULE. Byte-identical across every center except PRODUCT and the
 * fallback name below. If you change it here, change it everywhere; anything
 * center-specific belongs in a different file.
 *
 * Resolution happens entirely in wazzi-backend (services/branding.service.ts),
 * which coalesces per-center override -> organization default -> platform
 * default. This side only asks and renders.
 *
 * ── Why this costs nothing per page ─────────────────────────────────────────
 * A hostname maps to exactly one organization, so branding is a pure function
 * of the host. The fetch below is tagged and revalidated hourly by the Next
 * data cache, so a whole hour of requests for a host share ONE backend call —
 * and page titles never call this at all: the root layout installs a
 * `%s | <Company> <Center>` template once, and each page contributes only a
 * static string like 'Reservations'.
 */

import { BACKEND_URL } from '@/lib/config'

/** This center's product slug in the `products` table. */
const PRODUCT = 'agc'

export interface Branding {
  /** The client, e.g. "Casago". */
  company_name: string
  /** This center, e.g. "Agent Center" — renameable per org. */
  product_name: string
  /** The two joined, de-duplicated: the <title> suffix. */
  site_name: string
  has_logo: boolean
  has_favicon: boolean
  /** Short token that changes on every upload; appended as ?v= so browsers
   *  actually pick up a new icon. */
  logo_version: string | null
  favicon_version: string | null
  custom_theme: string | null
}

/** Used when the backend is unreachable or the host resolves to no org — an
 *  unbranded center still has to render. */
const FALLBACK: Branding = {
  company_name: 'Wazzi',
  product_name: 'Agent Center',
  site_name: 'Wazzi Agent Center',
  has_logo: false,
  has_favicon: false,
  logo_version: null,
  favicon_version: null,
  custom_theme: null,
}

/** Bundled marks used when the org has uploaded nothing. */
export const DEFAULT_LOGO_SRC = '/brand/wazzi-logo.png'
export const DEFAULT_ICON_SRC = '/brand/wazzi-icon.png'

/** Where the browser loads the org logo from, without a version token — for
 *  callers that probe for a logo with the image request itself. */
export const LOGO_PROXY_PATH = '/api/branding/logo'

export async function getBranding(host: string): Promise<Branding> {
  if (!host) return FALLBACK
  try {
    const res = await fetch(`${BACKEND_URL}/branding/${PRODUCT}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Wazzi-Domain': host,
      },
      next: { revalidate: 3600, tags: [`branding:${host}`] },
    })
    if (!res.ok) return FALLBACK
    const data = (await res.json()) as Partial<Branding>
    // Spread over FALLBACK rather than trusting the payload: an older backend
    // that has not shipped the new fields yet would otherwise yield an
    // undefined site_name, and `undefined` in a title template renders the
    // literal string "undefined" in the browser tab.
    return { ...FALLBACK, ...data }
  } catch {
    return FALLBACK
  }
}

/**
 * The <link rel="icon"> href. Points at this app's own proxy, because the
 * backend keys off an X-Wazzi-Domain header that a <link> cannot send.
 */
export function faviconHref(branding: Branding): string {
  if (!branding.has_favicon) return DEFAULT_ICON_SRC
  const version = branding.favicon_version
  return `/api/branding/favicon${version ? `?v=${version}` : ''}`
}

/** The <img src> for the logo, same reasoning as faviconHref. */
export function logoHref(branding: Branding): string {
  if (!branding.has_logo) return DEFAULT_LOGO_SRC
  const version = branding.logo_version
  return `/api/branding/logo${version ? `?v=${version}` : ''}`
}
