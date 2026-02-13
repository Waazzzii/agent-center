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
  const [debugSteps, setDebugSteps] = useState<string[]>([]);
  const { setAuth } = useAuthStore();

  const addDebugStep = (step: string) => {
    console.log(step);
    setDebugSteps(prev => [...prev, step]);
  };

  useEffect(() => {
    const handleCallback = async () => {
      addDebugStep('Starting OAuth callback handler');
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');
      const state = searchParams.get('state');

      addDebugStep(`Received params - code: ${code?.substring(0, 10)}..., state: ${state?.substring(0, 10)}...`);

      if (errorParam) {
        addDebugStep(`OAuth error: ${errorParam}`);
        setError(errorParam);
        return;
      }

      // Verify state parameter
      const storedState = sessionStorage.getItem('oauth_state');
      addDebugStep(`Verifying state parameter`);
      if (state !== storedState) {
        addDebugStep(`State mismatch! Expected: ${storedState?.substring(0, 10)}..., Got: ${state?.substring(0, 10)}...`);
        setError('Invalid state parameter - possible CSRF attack');
        return;
      }
      addDebugStep('✓ State verified');

      // Clear stored state
      sessionStorage.removeItem('oauth_state');

      if (!code) {
        addDebugStep('No authorization code received');
        setError('No authorization code received');
        return;
      }

      try {
        addDebugStep('Exchanging code for tokens...');
        const { accessToken, refreshToken } = await exchangeCodeForTokens(code);
        addDebugStep('✓ Tokens received');

        // Set tokens temporarily
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);

        addDebugStep('Fetching admin user info...');
        const response = await apiClient.get<AdminUser>('/admin/me');
        const admin = response.data;
        addDebugStep(`✓ Admin user: ${admin.email} (${admin.role})`);

        // Store auth state
        setAuth(admin, accessToken, refreshToken);

        addDebugStep('✓ Redirecting to dashboard');
        // Super admins go to organizations page, regular admins go to users page
        if (admin.role === 'super_admin') {
          router.push('/organizations');
        } else {
          router.push('/users');
        }
      } catch (err: any) {
        addDebugStep(`✗ Error: ${err.message}`);
        console.error('[CALLBACK] Error details:', err, err.response?.data);
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
      <div className="w-full max-w-md text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-muted-foreground mb-6">Completing authentication...</p>

        {/* Debug steps */}
        {debugSteps.length > 0 && (
          <div className="mt-6 rounded-lg border border-border bg-card p-4 text-left">
            <h3 className="text-sm font-semibold mb-2">Debug Steps:</h3>
            <div className="space-y-1">
              {debugSteps.map((step, index) => (
                <div key={index} className="text-xs font-mono text-muted-foreground">
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}
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
