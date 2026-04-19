'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCodeForTokens, redirectToAuth } from '@/lib/auth/oauth';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import apiClient from '@/lib/api/client';
import { ProductUser } from '@/types/api.types';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuthStore();
  useUIStore(); // ensures the store initialises and applies the correct dark/light class

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const state = searchParams.get('state');

      if (errorParam) {
        setError(errorParam);
        return;
      }

      // Verify state parameter
      const storedState = sessionStorage.getItem('oauth_state');
      if (state !== storedState) {
        setError('Invalid state parameter - possible CSRF attack');
        return;
      }

      // Clear stored state
      sessionStorage.removeItem('oauth_state');

      if (!code) {
        setError('No authorization code received');
        return;
      }

      try {
        const { accessToken, refreshToken } = await exchangeCodeForTokens(code);

        // Set tokens temporarily
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);

        const response = await apiClient.get<{ user: ProductUser }>('/products/me');
        const admin = response.data.user;

        // Store auth state
        setAuth(admin, accessToken, refreshToken);

        // Honour any stored post-login destination (e.g. deep-linked from another center)
        const intendedPath = sessionStorage.getItem('post_login_redirect');
        sessionStorage.removeItem('post_login_redirect');
        if (intendedPath && intendedPath !== '/login') {
          router.push(intendedPath);
        } else {
          router.push('/agents');
        }
      } catch (err: any) {
        console.error('[AUTH] Authentication failed:', err.message);
        setError(err.message || 'Failed to complete authentication');
      }
    };

    handleCallback();
  }, [searchParams, router, setAuth]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
          <h2 className="mb-2 text-xl font-semibold text-destructive">Authentication Error</h2>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => redirectToAuth()}
            className="text-brand hover:no-underline"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Securely Logging You In</h2>
          <p className="text-sm text-muted-foreground">
            Please wait while we complete your authentication...
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center">
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
