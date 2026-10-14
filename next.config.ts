import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs/config";

// @tailwindcss/node uses process.env.NODE_PATH to build its enhanced-resolve
// modules list. When opts.from is empty (a Turbopack behaviour), the CSS
// resolution context falls to the parent directory of cwd which has no
// node_modules. Adding the project's own node_modules here ensures tailwindcss
// is always findable regardless of the resolution context.
process.env.NODE_PATH = [
  path.join(__dirname, "node_modules"),
  ...(process.env.NODE_PATH ? [process.env.NODE_PATH] : []),
].join(path.delimiter);

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disabled to better mimic production behavior in development
  images: {
    unoptimized: true,
  },
};

/**
 * Sentry (browser + server error reporting; init in instrumentation*.ts).
 * Source maps are uploaded — and then not served publicly — only when the
 * build has SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT; without them the
 * build is unchanged apart from the SDK.
 */
const sentryUpload = !!(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { disable: !sentryUpload, deleteSourcemapsAfterUpload: true },
});
