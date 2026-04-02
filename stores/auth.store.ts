/**
 * Auth Store
 * Zustand store for authentication state — uses ProductUser from /products/me
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductUser } from '@/types/api.types';

interface AuthState {
  admin: ProductUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (admin: ProductUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateAdmin: (admin: Partial<ProductUser>) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  isSuperAdmin: () => boolean;
  /** @deprecated No distinct org_admin concept in /products/me — always returns false */
  isOrgAdmin: () => boolean;
  hasOrgAccess: (orgId: string) => boolean;
  hasPermission: (orgId: string, permissionKey: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (admin, accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        set({ admin, accessToken, refreshToken });
      },

      clearAuth: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('auth-storage');
        sessionStorage.clear();
        set({ admin: null, accessToken: null, refreshToken: null });
      },

      updateTokens: (accessToken, refreshToken) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        set({ accessToken, refreshToken });
      },

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

        // Look up the specific membership for this org
        const membership = (admin.memberships ?? []).find(
          (m) => m.organization_id === orgId
        );
        // Fall back to top-level permissions if this is the token's primary org
        const perms =
          membership?.permissions ??
          (admin.organization_id === orgId ? admin.permissions : {});

        return perms?.[permissionKey] === true;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ admin: state.admin }),
    }
  )
);
