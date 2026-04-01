'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { AdminRole } from '@/types/api.types';
import { ViewModeSidebar } from '@/components/layout/ViewModeSidebar';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { getOrganizations } from '@/lib/api/organizations';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { usePermissionsSync } from '@/hooks/use-permissions-sync';
import { cn } from '@/lib/utils';
import { orgMainNavItems, firstPermittedHref } from '@/lib/nav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, isSuperAdmin, isOrgAdmin, hasPermission } = useAuthStore();
  const { viewMode, selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const [isChecking, setIsChecking] = useState(true);

  usePermissionsSync();

  useEffect(() => {
    // Check auth on mount
    if (!admin) {
      // Persist the intended destination so the callback can redirect there after login
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('post_login_redirect', window.location.pathname + window.location.search);
      }
      router.replace('/login');
      return;
    }

    // Auto-select first organization for regular admins and redirect to /users
    const autoSelectOrganization = async () => {
      // Only auto-select if user is NOT a super admin and no organization is currently selected
      if (!isSuperAdmin() && !selectedOrgId) {
        setIsChecking(true); // Prevent org-scoped pages from rendering during auto-select
        try {
          const { organizations } = await getOrganizations();
          if (organizations.length > 0) {
            const firstOrg = organizations[0];
            switchToOrgAdminView(firstOrg.id, firstOrg.name);
            // If the user is on a super-admin-only or root page, redirect to the first permitted main nav item
            if (pathname === '/organizations' || pathname === '/') {
              const bypass = isSuperAdmin() || isOrgAdmin();
              const dest = firstPermittedHref(orgMainNavItems, bypass, hasPermission, firstOrg.id);
              router.replace(dest ?? '/no-permission');
            }
            // Otherwise leave them on their intended page
          } else {
            // No organizations assigned - stay on current page but show message
            console.warn('No organizations assigned to this administrator');
          }
        } catch (error) {
          console.error('Failed to auto-select organization:', error);
        }
      }
      setIsChecking(false);
    };

    autoSelectOrganization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, selectedOrgId]);

  // Show loading only during initial check
  if (!admin || isChecking) {
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
    <ConfirmDialogProvider>
      <div className="flex h-screen overflow-hidden">
        <ViewModeSidebar />
        <div className="flex-1 flex flex-col overflow-hidden md:ml-64">
          <ViewSwitcher />
          <main className={cn(
            "flex-1 overflow-y-auto bg-background p-4 md:p-6",
            viewMode === 'super_admin' && "pt-20 md:pt-6"
          )}>
            <div className="mx-auto w-full max-w-6xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </ConfirmDialogProvider>
  );
}
