'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { exchangeCodeForTokens } from '@/lib/auth/oauth';
import { useAuthStore } from '@/stores/auth.store';
import apiClient from '@/lib/api/client';
import { AdminUser } from '@/types/api.types';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      console.log('[AUTH] Starting OAuth callback handler');
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const state = searchParams.get('state');

      console.log('[AUTH] Received params - code:', code?.substring(0, 10) + '...', 'state:', state?.substring(0, 10) + '...');

      if (errorParam) {
        console.error('[AUTH] OAuth error:', errorParam);
        setError(errorParam);
        return;
      }

      // Verify state parameter
      const storedState = sessionStorage.getItem('oauth_state');
      console.log('[AUTH] Verifying state parameter');
      if (state !== storedState) {
        console.error('[AUTH] State mismatch! Expected:', storedState?.substring(0, 10) + '...', 'Got:', state?.substring(0, 10) + '...');
        setError('Invalid state parameter - possible CSRF attack');
        return;
      }
      console.log('[AUTH] ✓ State verified');

      // Clear stored state
      sessionStorage.removeItem('oauth_state');

      if (!code) {
        console.error('[AUTH] No authorization code received');
        setError('No authorization code received');
        return;
      }

      try {
        console.log('[AUTH] Exchanging code for tokens...');
        const { accessToken, refreshToken } = await exchangeCodeForTokens(code);
        console.log('[AUTH] ✓ Tokens received');

        // Set tokens temporarily
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);

        console.log('[AUTH] Fetching admin user info...');
        const response = await apiClient.get<AdminUser>('/admin/me');
        const admin = response.data;
        console.log('[AUTH] ✓ Admin user:', admin.email, '(' + admin.role + ')');

        // Store auth state
        setAuth(admin, accessToken, refreshToken);

        console.log('[AUTH] ✓ Redirecting to dashboard');
        // Honour any stored post-login destination (e.g. deep-linked from wazzi-kb)
        const intendedPath = sessionStorage.getItem('post_login_redirect');
        sessionStorage.removeItem('post_login_redirect');
        if (intendedPath && intendedPath !== '/login') {
          router.push(intendedPath);
        } else if (admin.role === 'super_admin') {
          router.push('/organizations');
        } else {
          router.push('/users');
        }
      } catch (err: any) {
        console.error('[AUTH] Error:', err.message);
        console.error('[AUTH] Error details:', err, err.response?.data);
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
            onClick={() => router.push('/login')}
            className="text-primary underline hover:no-underline"
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
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
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
            <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
