'use client';

import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Shield } from 'lucide-react';

export function ViewSwitcher() {
  const router = useRouter();
  const { isSuperAdmin } = useAuthStore();
  const { viewMode, selectedOrgName, switchToSuperAdminView } = useAdminViewStore();

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
    <div className="border-b bg-orange-100 dark:bg-orange-950/50 px-4 py-3 md:ml-64 border-orange-200 dark:border-orange-900">
      <div className="flex items-center justify-between">
        {/* Organization info - left side */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-200 dark:bg-orange-900">
            <Building2 className="h-5 w-5 text-orange-700 dark:text-orange-400" />
          </div>
          <div>
            {isSuperAdmin() ? (
              <>
                <div className="flex items-center gap-2 text-xs font-medium text-orange-700 dark:text-orange-400">
                  <Shield className="h-3 w-3" />
                  Super Admin - Managing Organization
                </div>
                <div className="text-sm font-semibold text-orange-900 dark:text-orange-300">{selectedOrgName}</div>
              </>
            ) : (
              <>
                <div className="text-xs font-medium text-orange-700 dark:text-orange-400">
                  Managing Organization
                </div>
                <div className="text-sm font-semibold text-orange-900 dark:text-orange-300">{selectedOrgName}</div>
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
            className="gap-2 bg-white dark:bg-orange-900 border-orange-300 dark:border-orange-800 text-orange-900 dark:text-orange-200 hover:bg-orange-200 hover:border-orange-400 dark:hover:bg-orange-800 hover:text-orange-950 dark:hover:text-orange-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Super Admin
          </Button>
        )}
      </div>
    </div>
  );
}
