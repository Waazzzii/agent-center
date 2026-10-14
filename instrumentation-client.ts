// Browser-side Sentry. Loaded by Next before the app; a no-op without
// NEXT_PUBLIC_SENTRY_DSN. Options: src/lib/sentry-options.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryBaseOptions } from "./lib/sentry-options";

Sentry.init(sentryBaseOptions(process.env.NEXT_PUBLIC_SENTRY_DSN));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
