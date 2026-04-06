import { type NextRequest, NextResponse } from "next/server"

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") ?? ""

  const res = await fetch(`${BACKEND_URL}/centers/agent/favicon`, {
    headers: {
      "X-Wazzi-Domain": host,
    },
    cache: "no-store",
  })

  if (!res.ok) return new NextResponse(null, { status: 404 })

  const buffer = await res.arrayBuffer()
  const contentType = res.headers.get("content-type") ?? "image/png"
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  })
}
