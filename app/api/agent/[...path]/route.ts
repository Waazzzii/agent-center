/**
 * Catchall BFF route → agent-backend.
 *
 * agent-backend accepts the same bearer token as wazzi-backend (it verifies
 * by calling /products/me upstream). The session cookie is read server-side
 * and forwarded as Authorization: Bearer.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AGENT_BACKEND_URL } from "@/lib/config";
import { COOKIE_NAME } from "@/lib/auth";

const PASS_REQ_HEADERS = new Set(["content-type", "accept", "accept-encoding"]);

async function proxy(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: string,
): Promise<Response> {
  const { path } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  const url = new URL(request.url);
  const target = `${AGENT_BACKEND_URL}/${path.join("/")}${url.search}`;

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (PASS_REQ_HEADERS.has(k.toLowerCase())) headers.set(k, v);
  }
  if (!headers.has("content-type") && method !== "GET" && method !== "DELETE") {
    headers.set("content-type", "application/json");
  }
  headers.set("X-Wazzi-Domain", request.headers.get("host") ?? "");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: BodyInit | undefined;
  if (method !== "GET" && method !== "DELETE" && method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  const backendRes = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
    // @ts-expect-error — Node fetch supports `duplex`, but the DOM types don't.
    duplex: "half",
  });

  const resHeaders = new Headers();
  for (const [k, v] of backendRes.headers) {
    const lk = k.toLowerCase();
    if (lk === "content-encoding" || lk === "transfer-encoding" || lk === "connection") continue;
    resHeaders.set(k, v);
  }

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: resHeaders,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params, "GET");
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params, "POST");
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params, "PATCH");
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params, "PUT");
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, ctx.params, "DELETE");
}
