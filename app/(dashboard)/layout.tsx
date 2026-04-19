'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { ViewModeSidebar } from '@/components/layout/ViewModeSidebar';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { usePermissionsSync } from '@/hooks/use-permissions-sync';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware guarantees a session cookie; SessionProvider hydrates the store.
  // If admin is somehow null here, the signout route clears cookies and the
  // next middleware pass will bounce to /auth/login.
  const { admin, hydrated } = useAuthStore();
  const { selectedOrgId, switchToOrgAdminView } = useAdminViewStore();

  usePermissionsSync();

  useEffect(() => {
    // Wait for SessionProvider to hydrate before treating a null admin as
    // an invalidated session — otherwise we race the provider's effect.
    if (!hydrated) return;

    if (!admin) {
      // Session invalidated mid-use — drop cookies and let middleware redirect.
      window.location.replace('/auth/signout');
      return;
    }

    if (!selectedOrgId && admin.organization_id) {
      switchToOrgAdminView(admin.organization_id, admin.organization_id);
    }
  }, [admin, hydrated, selectedOrgId, switchToOrgAdminView]);

  if (!hydrated || !admin) {
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
