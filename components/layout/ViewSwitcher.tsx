'use client';

import { useRouter } from 'next/navigation';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ViewSwitcher() {
  const router = useRouter();
  const { isSuperAdmin } = useAuthStore();
  const { viewMode, selectedOrgName, switchToSuperAdminView, isOrgAdminView } = useAdminViewStore();

  // Only show for super admins
  if (!isSuperAdmin()) {
    return null;
  }

  // Don't show in super admin view
  if (viewMode === 'super_admin') {
    return null;
  }

  const handleBackToSuperAdmin = () => {
    switchToSuperAdminView();
    router.push('/organizations');
  };

  return (
    <div className="border-b bg-primary/5 px-4 py-3 md:ml-64">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">
              Managing Organization
            </div>
            <div className="text-sm font-semibold">{selectedOrgName}</div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleBackToSuperAdmin}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Super Admin
        </Button>
      </div>
    </div>
  );
}
