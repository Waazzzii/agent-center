'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';

/**
 * Returns true if the current user has the required permission(s).
 * Pass a single key or an array — any match grants access.
 * super_admin and org_admin always return true.
 *
 * Render <NoPermissionContent /> when this returns false — do not redirect,
 * so the URL and sidebar context are preserved.
 */
export function useRequirePermission(permissionKey: string | string[]): boolean {
  const { admin, isSuperAdmin, isOrgAdmin, hasPermission } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();

  if (!admin) return true; // layout handles auth redirect
  if (isSuperAdmin() || isOrgAdmin()) return true;
  if (!selectedOrgId) return true; // layout handles org selection

  const keys = Array.isArray(permissionKey) ? permissionKey : [permissionKey];
  return keys.some((k) => hasPermission(selectedOrgId, k));
}
