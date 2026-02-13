'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { AdminRole } from '@/types/api.types';
import { ViewModeSidebar } from '@/components/layout/ViewModeSidebar';
import { ViewSwitcher } from '@/components/layout/ViewSwitcher';
import { getOrganizations } from '@/lib/api/organizations';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, isSuperAdmin } = useAuthStore();
  const { selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check auth on mount
    if (!admin) {
      // Use replace to prevent adding to history stack
      router.replace('/login');
      return;
    }

    // Auto-select first organization for regular admins and redirect to /users
    const autoSelectOrganization = async () => {
      // Only auto-select if user is NOT a super admin and no organization is currently selected
      if (!isSuperAdmin() && !selectedOrgId) {
        try {
          const { organizations } = await getOrganizations();
          if (organizations.length > 0) {
            const firstOrg = organizations[0];
            switchToOrgAdminView(firstOrg.id, firstOrg.name);
            // Always redirect regular admins to /users page
            if (pathname === '/organizations' || pathname === '/') {
              router.replace('/users');
            }
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
  }, [admin, isSuperAdmin, selectedOrgId, pathname, router, switchToOrgAdminView]);

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
