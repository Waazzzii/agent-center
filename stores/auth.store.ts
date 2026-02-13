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
  isSuperAdmin: () => boolean;
  hasOrgAccess: (orgId: string) => boolean;
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

      hasOrgAccess: (orgId: string) => {
        const { admin } = get();
        if (!admin) return false;
        if (admin.role === AdminRole.SUPER_ADMIN) return true;
        return admin.assignedOrganizations.includes(orgId);
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
