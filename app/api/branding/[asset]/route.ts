/**
 * Branding asset proxy — streams the org's logo or icon from wazzi-backend.
 *
 * STANDARD MODULE. Identical across every center except PRODUCT below.
 *
 * Exists because the backend resolves the org from an X-Wazzi-Domain header,
 * and neither <img src> nor <link rel="icon"> can set a custom header. A 404
 * here is the contract, not a failure: it tells the caller to fall back to the
 * bundled Wazzi mark.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { BACKEND_URL } from '@/lib/config'

/** This center's product slug in the `products` table. */
const PRODUCT = 'agc'

const ALLOWED = new Set(['logo', 'favicon'])

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ asset: string }> }
) {
  const { asset } = await params
  if (!ALLOWED.has(asset)) {
    return new NextResponse(null, { status: 404 })
  }

  const host = req.headers.get('host') ?? ''

  try {
    const res = await fetch(`${BACKEND_URL}/branding/${PRODUCT}/${asset}`, {
      headers: { 'X-Wazzi-Domain': host },
      cache: 'no-store',
    })
    if (!res.ok) return new NextResponse(null, { status: 404 })

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        // Safe to cache hard: callers append a ?v= derived from the storage
        // path, which changes on every upload.
        'Cache-Control': 'public, max-age=3600',
        // The backend serves org-uploaded SVG; keep its hardening on the way
        // through rather than re-exposing it unsandboxed on this origin.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
