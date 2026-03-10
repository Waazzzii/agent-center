'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';

/**
 * Returns whether the current user has the given permission in the selected org.
 * super_admin and org_admin always return true.
 */
export function usePermission(permissionKey: string): boolean {
  const { hasPermission } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  return hasPermission(selectedOrgId ?? '', permissionKey);
}
