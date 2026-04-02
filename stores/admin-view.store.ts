/**
 * Admin View Store
 * Manages view switching between super admin and org admin contexts
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdminViewMode = 'super_admin' | 'org_admin';

interface AdminViewState {
  viewMode: AdminViewMode;
  selectedOrgId: string | null;
  selectedOrgName: string | null;

  // Switch to super admin view
  switchToSuperAdminView: () => void;

  // Switch to org admin view for a specific organization
  switchToOrgAdminView: (orgId: string, orgName: string) => void;

  // Check if currently in org admin view
  isOrgAdminView: () => boolean;

  // Check if currently in super admin view
  isSuperAdminView: () => boolean;

  // Clear view selection
  clearView: () => void;
}

export const useAdminViewStore = create<AdminViewState>()(
  persist(
    (set, get) => ({
      viewMode: 'org_admin',
      selectedOrgId: null,
      selectedOrgName: null,

      switchToSuperAdminView: () => {
        set({
          viewMode: 'org_admin',
          selectedOrgId: null,
          selectedOrgName: null,
        });
      },

      switchToOrgAdminView: (orgId: string, orgName: string) => {
        set({
          viewMode: 'org_admin',
          selectedOrgId: orgId,
          selectedOrgName: orgName,
        });
      },

      isOrgAdminView: () => {
        const { viewMode } = get();
        return viewMode === 'org_admin';
      },

      isSuperAdminView: () => {
        const { viewMode } = get();
        return viewMode === 'super_admin';
      },

      clearView: () => {
        set({
          viewMode: 'org_admin',
          selectedOrgId: null,
          selectedOrgName: null,
        });
      },
    }),
    {
      name: 'admin-view-storage',
    }
  )
);
