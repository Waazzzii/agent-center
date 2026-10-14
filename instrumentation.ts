// Server + edge Sentry (route handlers, server components, middleware). A
// no-op without a DSN. Options: src/lib/sentry-options.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "./lib/sentry-options";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryBaseOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
  }
}

// Errors thrown while rendering server components / route handlers.
export const onRequestError = Sentry.captureRequestError;
