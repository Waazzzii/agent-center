'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/theme-toggle';
import { initiateLogin } from '@/lib/auth/oauth';
import { useAuthStore } from '@/stores/auth.store';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter();
  const { admin } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (admin) {
      const intendedPath = typeof window !== 'undefined'
        ? sessionStorage.getItem('post_login_redirect')
        : null;
      if (intendedPath && intendedPath !== '/login') {
        sessionStorage.removeItem('post_login_redirect');
        router.replace(intendedPath);
        return;
      }
      if (admin.role === 'super_admin') {
        router.replace('/organizations');
      } else {
        router.replace('/users');
      }
    }
  }, [admin, router]);

  if (admin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    );
  }

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      await initiateLogin();
    } catch (err: any) {
      setError(err.message || 'Failed to start sign-in');
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-primary/20 via-background to-background p-4">

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-sm overflow-hidden shadow-lg">

        {/* Logo section */}
        <div className="flex flex-col items-center px-8 pb-2 pt-0">
          <div className="flex items-center justify-center gap-3">
            <Image
              src="/logo.png"
              alt=""
              width={80}
              height={80}
              priority
              className="h-20 w-auto"
            />
            <Image
              src="/wazzi_light.png"
              alt="wazzi.io"
              width={120}
              height={40}
              priority
              className="h-5 w-auto dark:hidden"
            />
            <Image
              src="/wazzi_dark.png"
              alt="wazzi.io"
              width={120}
              height={40}
              priority
              className="h-5 w-auto hidden dark:block"
            />
          </div>
          <p className="text-base font-medium text-muted-foreground">
            Admin Portal
          </p>
        </div>

        <Separator />

        {/* Sign-in section */}
        <div className="flex flex-col gap-6 px-8 py-7">
          <div className="flex flex-col gap-2 text-center">
            <h2 className="text-3xl font-bold text-foreground">
              Welcome
            </h2>
            <p className="text-sm text-muted-foreground">
              Please log in with your Google account that is authorized to access the Admin Portal
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="w-full gap-3"
            onClick={handleLogin}
            disabled={loading}
          >
            <GoogleIcon className="h-5 w-5" />
            {loading ? 'Redirecting...' : 'Sign in with Google'}
          </Button>
        </div>

      </Card>
    </div>
  );
}
