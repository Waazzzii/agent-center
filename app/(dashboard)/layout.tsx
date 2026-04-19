'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { ViewModeSidebar } from '@/components/layout/ViewModeSidebar';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { usePermissionsSync } from '@/hooks/use-permissions-sync';
import { redirectToAuth } from '@/lib/auth/oauth';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { admin } = useAuthStore();
  const { selectedOrgId, switchToOrgAdminView } = useAdminViewStore();

  usePermissionsSync();

  useEffect(() => {
    if (!admin) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('post_login_redirect', window.location.pathname + window.location.search);
      }
      redirectToAuth();
      return;
    }

    // Set org context from the user's token if not already set
    if (!selectedOrgId && admin.organization_id) {
      switchToOrgAdminView(admin.organization_id, admin.organization_id);
    }
  }, [admin, selectedOrgId, router, switchToOrgAdminView]);

  if (!admin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <ConfirmDialogProvider>
      <div className="flex h-screen overflow-hidden">
        <ViewModeSidebar />
        <div className="flex-1 flex flex-col overflow-hidden md:ml-64">
          <main className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto w-full h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ConfirmDialogProvider>
  );
}
