"use client";

/**
 * Last-resort boundary: an error in the root layout itself. Reports to Sentry
 * (a no-op without a DSN) and renders a minimal page — the root layout, and so
 * the site chrome and styles, are what failed.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: 16 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>Please try again. If it keeps happening, reload the page.</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
