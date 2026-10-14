/**
 * Sentry options shared by the browser, server and edge inits
 * (instrumentation-client.ts, instrumentation.ts).
 *
 * Errors, plus OPT-IN request tracing; no session replay. The SDK is a no-op
 * until a DSN is set:
 *   NEXT_PUBLIC_SENTRY_DSN                 browser + server (one Sentry project per center)
 *   SENTRY_DSN                             optional server-only override
 *   NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE  0..1, default 0 (tracing off)
 *
 * Tracing: page loads, navigations and fetches become spans, and requests to
 * our backends carry the W3C `traceparent` header (propagateTraceparent), so
 * the same trace id continues into wazzi-backend / agent-backend, which export
 * their spans (OpenTelemetry) to Google Cloud Trace. One id end to end: the
 * browser half in Sentry, the backend half in Cloud Trace, and the Monitoring
 * page's Traces tab links both. The backends must allow the `traceparent`,
 * `tracestate`, `sentry-trace` and `baggage` request headers in CORS before
 * the sample rate is raised above 0 — otherwise cross-origin preflights fail.
 * Source maps upload at build time only when SENTRY_AUTH_TOKEN, SENTRY_ORG and
 * SENTRY_PROJECT are set (next.config.ts).
 *
 * Backend errors are NOT here — wazzi-backend / agent-backend report to the
 * platform monitoring schema and GCP Error Reporting.
 */

import type { ErrorEvent, EventHint } from "@sentry/nextjs";

export const SENTRY_PRODUCT = "agent-center";

function traceRate(): number {
  const n = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function tracePropagationTargets(): (string | RegExp)[] {
  // BACKEND_URL / AGENT_BACKEND_URL exist only server-side (BFF proxies); undefined in the browser.
  const hosts = [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_AGENT_API_URL, process.env.NEXT_PUBLIC_BACKEND_URL,
                 process.env.BACKEND_URL, process.env.AGENT_BACKEND_URL]
    .filter((u): u is string => !!u)
    .map((u) => u.replace(/\/+$/, ""));
  return [/^\//, /^https:\/\/([a-z0-9-]+\.)*wazzi\.io(\/|$)/, ...hosts];
}

export function sentryBaseOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: !!dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: traceRate(),
    propagateTraceparent: true,
    // Same-origin requests always get trace headers; these are the cross-origin
    // ones (our backends). Anything else — Stripe, maps, analytics — never does.
    tracePropagationTargets: tracePropagationTargets(),
    sendDefaultPii: false,
    initialScope: { tags: { product: SENTRY_PRODUCT } },
    // Noise that is never ours to fix. Each entry here is a whole class of
    // browser/extension/network chatter that would otherwise eat the quota.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      /^AbortError/,
      /The operation was aborted/,
      /Load failed$/,               // Safari: fetch cancelled by navigation
      /^NetworkError when attempting to fetch resource/,
      /^Failed to fetch$/,
      /ChunkLoadError/,             // stale tab after a deploy; the next navigation reloads
      /Loading chunk \d+ failed/,
      "NEXT_REDIRECT",
      "NEXT_NOT_FOUND",
    ],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-(web-)?extension:\/\//],
    beforeSend(event: ErrorEvent, hint: EventHint) {
      // Bots and crawlers hitting odd paths are not users having a bad time.
      const ua = event.request?.headers?.["User-Agent"] ?? event.request?.headers?.["user-agent"] ?? "";
      if (/bot|crawler|spider|headless/i.test(ua)) return null;
      void hint;
      return event;
    },
  };
}
