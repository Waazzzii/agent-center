/**
 * UI Store
 * Zustand store for UI state (theme, sidebar, etc.)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarOpen: true,

      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === 'light' ? 'dark' : 'light';
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', newTheme === 'dark');
          }
          // Sync with next-themes so its inline script applies the correct class on every page load
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('theme', newTheme);
          }
          return { theme: newTheme };
        }),

      setTheme: (theme) =>
        set(() => {
          if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('dark', theme === 'dark');
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('theme', theme);
          }
          return { theme };
        }),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: 'ui-storage',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', state.theme === 'dark');
        }
        // Keep next-themes in sync so its inline script is correct on next page load
        if (state && typeof localStorage !== 'undefined') {
          localStorage.setItem('theme', state.theme);
        }
      },
    }
  )
);
