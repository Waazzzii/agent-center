/**
 * Slack Interactivity → agent-backend.
 *
 * Gives every organization a clean, own-domain Request URL:
 *
 *   https://<their agent center domain>/api/slack/interactions
 *
 * which matters because each client owns their own Slack app and configures
 * its Request URL themselves. Pointing them all at one platform hostname
 * would work, but their Wazzi domain is the host they already know, and it is
 * how the org is identified everywhere else.
 *
 * NOT routed through the catch-all BFF at /api/agent/[...path], for two
 * reasons that would each break it silently:
 *
 *   1. That proxy forwards only content-type / accept / accept-encoding.
 *      X-Slack-Signature and X-Slack-Request-Timestamp would be dropped and
 *      every request would fail verification with no obvious cause.
 *   2. It attaches the caller's session cookie as a bearer token. Slack has
 *      no session, and this endpoint must not look authenticated — its only
 *      proof of origin is the signature.
 *
 * The body is forwarded as raw BYTES. The signature is an HMAC over the exact
 * payload Slack sent; parsing and re-serialising anywhere along the path
 * changes those bytes and invalidates it.
 */

import { NextRequest, NextResponse } from "next/server";
import { AGENT_BACKEND_URL } from "@/lib/config";

/** The headers that carry Slack's proof of origin, plus the body's type. */
const SLACK_HEADERS = [
  "x-slack-signature",
  "x-slack-request-timestamp",
  "x-slack-retry-num",
  "x-slack-retry-reason",
  "content-type",
];

export async function POST(request: NextRequest): Promise<Response> {
  const headers = new Headers();
  for (const name of SLACK_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // arrayBuffer, never .json()/.text()-then-restringify — see the note above.
  const body = await request.arrayBuffer();

  try {
    const upstream = await fetch(`${AGENT_BACKEND_URL}/api/slack/interactions`, {
      method: "POST",
      headers,
      body,
    });
    // Slack only cares about the status; anything non-2xx makes it retry and
    // show the reader an error, so pass the real one through rather than
    // flattening it to 200.
    return new NextResponse(await upstream.text(), { status: upstream.status });
  } catch (err) {
    // A 502 tells Slack to retry, which is the right outcome when the backend
    // is briefly unreachable — the alternative is a click that vanishes.
    console.error("[slack-interactions proxy] upstream unreachable", err);
    return new NextResponse("Upstream unavailable", { status: 502 });
  }
}
