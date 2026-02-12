'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { ViewModeSidebar } from '@/components/layout/ViewModeSidebar';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { admin } = useAuthStore();

  useEffect(() => {
    if (!admin) {
      router.push('/login');
    }
  }, [admin, router]);

  if (!admin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <ViewModeSidebar />
      <div className="flex-1 flex flex-col overflow-hidden md:ml-64">
        <ViewSwitcher />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
