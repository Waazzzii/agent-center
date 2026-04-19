'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Shield, Database, Zap } from 'lucide-react';

interface ClientInfo {
  client_name: string;
  organization_name: string | null;
  organization_id: string | null;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function AuthorizeContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);

  // Extract state parameter which contains the auth session
  const state = searchParams.get('state');
  const clientId = searchParams.get('client_id');

  useEffect(() => {
    // Fetch client info from client_id
    if (clientId) {
      fetchClientInfo(clientId);
    }
  }, [clientId]);

  async function fetchClientInfo(clientId: string) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiUrl}/oauth/clients/${clientId}/info`);
      if (response.ok) {
        const data: ClientInfo = await response.json();
        setClientInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch client info:', err);
    }
  }

  async function handleContinue() {
    if (!state) {
      setError('Missing authentication state. Please try again.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Redirect back to backend to continue OAuth flow
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const params = new URLSearchParams({
        state: state,
        continue: 'true', // Flag to tell backend to proceed to Google
      });

      window.location.href = `${apiUrl}/authorize/continue?${params}`;
    } catch (err: any) {
      setError(err.message || 'Failed to continue authentication');
      setLoading(false);
    }
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <h2 className="mb-2 text-xl font-semibold text-destructive">Invalid Request</h2>
          <p className="text-sm text-muted-foreground">
            Missing authentication state. Please try initiating the connection again.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-primary/20 via-background to-background p-4">

      <Card className="w-full max-w-lg overflow-hidden shadow-lg">

        {/* Header with logos */}
        <div className="flex flex-col items-center px-8 pb-2 pt-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Image
              src="/logo.png"
              alt=""
              width={60}
              height={60}
              priority
              className="h-15 w-auto"
            />
            <div className="flex flex-col">
              <Image
                src="/wazzi_light.png"
                alt="wazzi.io"
                width={100}
                height={30}
                priority
                className="h-4 w-auto dark:hidden"
              />
              <Image
                src="/wazzi_dark.png"
                alt="wazzi.io"
                width={100}
                height={30}
                priority
                className="h-4 w-auto hidden dark:block"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* Authorization request */}
        <div className="flex flex-col gap-6 px-8 py-7">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-bold text-foreground">
              Authorization Request
            </h1>
            {clientInfo?.organization_name && (
              <p className="text-sm font-medium text-muted-foreground">
                <span className="text-foreground">{clientInfo.organization_name}</span>
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              <span className="font-medium">{clientInfo?.client_name || 'An application'}</span> is requesting access to your Wazzi account.
            </p>
          </div>

          {/* Permissions list */}
          <div className="space-y-3 bg-muted/30 rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              This application will be able to:
            </p>
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Access your data</p>
                <p className="text-xs text-muted-foreground">Read and search content from your organization</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Perform operations</p>
                <p className="text-xs text-muted-foreground">Execute authorized actions on your behalf</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Secure connection</p>
                <p className="text-xs text-muted-foreground">OAuth 2.0 with PKCE for maximum security</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              size="lg"
              className="w-full gap-3"
              onClick={handleContinue}
              disabled={loading}
            >
              <GoogleIcon className="h-5 w-5" />
              {loading ? 'Redirecting...' : 'Continue with Google'}
            </Button>
            <p className="text-xs text-center text-muted-foreground px-4">
              You'll be redirected to Google to sign in. Use the email address associated with your Wazzi account.
            </p>
          </div>
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-8 py-4 bg-muted/30">
          <p className="text-xs text-center text-muted-foreground">
            By continuing, you authorize <span className="font-medium">{clientInfo?.client_name || 'this application'}</span> to access your Wazzi account on your behalf.
            You can revoke access at any time.
          </p>
        </div>
      </Card>
    </div>
  );
}

export default function McpAuthorizePage() {
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
      <AuthorizeContent />
    </Suspense>
  );
}
