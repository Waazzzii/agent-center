'use client';

import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Shield, Menu } from 'lucide-react';

export function ViewSwitcher() {
  const router = useRouter();
  const { isSuperAdmin } = useAuthStore();
  const { viewMode, selectedOrgName, switchToSuperAdminView } = useAdminViewStore();
  const { toggleSidebar } = useUIStore();

  // Don't show in super admin view
  if (viewMode === 'super_admin') {
    return null;
  }

  // Don't show if no organization selected
  if (!selectedOrgName) {
    return null;
  }

  const handleBackToSuperAdmin = () => {
    switchToSuperAdminView();
    router.push('/organizations');
  };

  return (
    <div className="border-b bg-orange-100 dark:bg-orange-950/50 border-orange-200 dark:border-orange-900">
      <div className="px-4 py-4 flex items-center gap-3">
        {/* Hamburger menu for mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9 flex-shrink-0"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5 text-orange-700 dark:text-orange-400" />
        </Button>

        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-orange-200 dark:bg-orange-900 flex-shrink-0">
            <Building2 className="h-4 w-4 md:h-5 md:w-5 text-orange-700 dark:text-orange-400" />
          </div>
          <div className="min-w-0 flex-1">
            {isSuperAdmin() ? (
              <>
                <div className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                  <Shield className="h-3 w-3 flex-shrink-0" />
                  <span>Super Admin Managing</span>
                </div>
                <div className="text-sm font-semibold text-orange-900 dark:text-orange-300 truncate">{selectedOrgName}</div>
              </>
            ) : (
              <>
                <div className="text-xs font-medium text-orange-700 dark:text-orange-400">
                  Managing Organization
                </div>
                <div className="text-sm font-semibold text-orange-900 dark:text-orange-300 truncate">{selectedOrgName}</div>
              </>
            )}
          </div>
        </div>

        {/* Back to Super Admin button - only for super admins */}
        {isSuperAdmin() && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToSuperAdmin}
            className="gap-1 md:gap-2 bg-white dark:bg-orange-900 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200 hover:bg-orange-200 hover:border-orange-400 dark:hover:bg-orange-800 hover:text-orange-950 dark:hover:text-orange-100 flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Super Admin</span>
            <span className="sm:hidden">Back</span>
          </Button>
        )}
      </div>
    </div>
  );
}
