/**
 * Auth Store
 * Zustand store for authentication state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AdminRole, type AdminUser } from '@/types/api.types';

interface AuthState {
  admin: AdminUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (admin: AdminUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateAdmin: (admin: Partial<AdminUser>) => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  isSuperAdmin: () => boolean;
  isOrgAdmin: () => boolean;
  hasOrgAccess: (orgId: string) => boolean;
  /** Check if the current user has a specific permission in an org.
   *  super_admin and org_admin always return true (they bypass permission checks). */
  hasPermission: (orgId: string, permissionKey: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (admin, accessToken, refreshToken) => {
        // Store tokens in localStorage for API client
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);

        set({ admin, accessToken, refreshToken });
      },

      clearAuth: () => {
        // Only remove auth-related items, preserve UI settings like theme
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
        if (admin) {
          set({ admin: { ...admin, ...updates } });
        }
      },

      isSuperAdmin: () => {
        const { admin } = get();
        return admin?.role === AdminRole.SUPER_ADMIN;
      },

      isOrgAdmin: () => {
        const { admin } = get();
        return admin?.role === AdminRole.ORG_ADMIN;
      },

      hasOrgAccess: (orgId: string) => {
        const { admin } = get();
        if (!admin) return false;
        if (admin.role === AdminRole.SUPER_ADMIN) return true;
        return admin.assignedOrganizations.includes(orgId);
      },

      hasPermission: (orgId: string, permissionKey: string) => {
        const { admin } = get();
        if (!admin) return false;
        // super_admin and org_admin bypass all permission checks
        if (admin.role === AdminRole.SUPER_ADMIN || admin.role === AdminRole.ORG_ADMIN) return true;
        return admin.orgPermissions?.[orgId]?.[permissionKey] === true;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        admin: state.admin,
        // Don't persist tokens (they're in localStorage)
      }),
    }
  )
);
