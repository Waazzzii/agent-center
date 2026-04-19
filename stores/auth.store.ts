/**
 * Auth Store
 *
 * Holds the resolved /products/me user. Tokens are stored in httpOnly cookies
 * and are not accessible to JS. Hydration happens in a root server component
 * (see SessionProvider) — persistence here is a no-op by design.
 */

import { create } from 'zustand';
import type { ProductUser } from '@/types/api.types';

interface AuthState {
  admin: ProductUser | null;
  hydrated: boolean;
  setAdmin: (admin: ProductUser | null) => void;
  setHydrated: (hydrated: boolean) => void;
  updateAdmin: (admin: Partial<ProductUser>) => void;
  clearAuth: () => void;
  isSuperAdmin: () => boolean;
  /** @deprecated No distinct org_admin concept in /products/me — always returns false */
  isOrgAdmin: () => boolean;
  hasOrgAccess: (orgId: string) => boolean;
  hasPermission: (orgId: string, permissionKey: string) => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  admin: null,
  hydrated: false,

  setAdmin: (admin) => set({ admin }),

  setHydrated: (hydrated) => set({ hydrated }),

  clearAuth: () => set({ admin: null }),

  updateAdmin: (updates) => {
    const { admin } = get();
    if (admin) set({ admin: { ...admin, ...updates } as ProductUser });
  },

  isSuperAdmin: () => get().admin?.is_super_admin === true,

  isOrgAdmin: () => false,

  hasOrgAccess: (orgId: string) => {
    const { admin } = get();
    if (!admin) return false;
    if (admin.is_super_admin) return true;
    return (admin.memberships ?? []).some((m) => m.organization_id === orgId);
  },

  hasPermission: (orgId: string, permissionKey: string) => {
    const { admin } = get();
    if (!admin) return false;
    if (admin.is_super_admin) return true;

    const membership = (admin.memberships ?? []).find(
      (m) => m.organization_id === orgId
    );
    const perms =
      membership?.permissions ??
      (admin.organization_id === orgId ? admin.permissions : {});

    return perms?.[permissionKey] === true;
  },
}));
