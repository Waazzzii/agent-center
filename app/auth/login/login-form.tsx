"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildAuthorizationUrl } from "@/lib/auth";

function generateRandom(length = 64): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Default 20 min: must EXCEED the backend's magic-code window (15 min). A
// shorter verifier lifetime means a code the backend still accepts mints an
// auth code this app can no longer exchange, and the user gets "session
// expired" after doing everything right (then it works on the retry).
function setCookie(name: string, value: string, maxAgeSec = 1200) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax${secure}`;
}

function LoginRedirectInner() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/";
  const [error, setError] = useState(searchParams.get("error") ?? "");

  useEffect(() => {
    let cancelled = false;
    async function redirect() {
      try {
        const state = generateRandom(32);
        const codeVerifier = generateRandom(64);
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // State-keyed cookies: multiple in-flight logins (other tabs, other
        // products on localhost) can't clobber each other's verifier.
        setCookie(`pkce_verifier_${state}`, codeVerifier);
        setCookie(`oauth_redirect_${state}`, redirectTo);

        const redirectUri = `${window.location.origin}/auth/callback`;
        const authUrl = buildAuthorizationUrl({ redirectUri, state, codeChallenge });
        if (!cancelled) window.location.replace(authUrl);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to start sign-in");
      }
    }
    redirect();
    return () => {
      cancelled = true;
    };
  }, [redirectTo]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="text-center space-y-4">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Redirecting to sign-in…</p>
        )}
      </div>
    </div>
  );
}

export function LoginRedirect() {
  return (
    <Suspense fallback={null}>
      <LoginRedirectInner />
    </Suspense>
  );
}
