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

function setCookie(name: string, value: string, maxAgeSec = 600) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
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

        setCookie("pkce_verifier", codeVerifier);
        setCookie("oauth_state", state);
        setCookie("oauth_redirect", redirectTo);

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
