'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { redirectToAuth } from '@/lib/auth/oauth';

export default function HomePage() {
  const router = useRouter();
  const { admin } = useAuthStore();

  useEffect(() => {
    if (admin) {
      router.push('/agents');
    } else {
      redirectToAuth();
    }
  }, [admin, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
