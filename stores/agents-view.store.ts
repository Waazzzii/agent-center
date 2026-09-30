/**
 * Agents View Store
 *
 * How the user prefers to see the Agents page — the flat list or agents
 * grouped by group — and which groups they have collapsed. Persisted to
 * localStorage so the choice sticks across page loads until they change it.
 *
 * localStorage rather than a cookie: the page is client-rendered (it shows a
 * spinner until its first fetch), so nothing on the server needs to read it.
 * The trade-off is that it is per browser, not per user.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AgentsViewMode = 'list' | 'grouped';

interface AgentsViewState {
  viewMode: AgentsViewMode;
  /** Group ids (or the 'ungrouped' bucket key) the user has collapsed. Default is expanded. */
  collapsedGroups: string[];
  setViewMode: (mode: AgentsViewMode) => void;
  toggleGroup: (key: string) => void;
}

export const useAgentsViewStore = create<AgentsViewState>()(
  persist(
    (set) => ({
      viewMode: 'list',
      collapsedGroups: [],

      setViewMode: (viewMode) => set({ viewMode }),

      toggleGroup: (key) =>
        set((state) => ({
          collapsedGroups: state.collapsedGroups.includes(key)
            ? state.collapsedGroups.filter((k) => k !== key)
            : [...state.collapsedGroups, key],
        })),
    }),
    { name: 'agents-view-storage' },
  ),
);

/** Key for the bucket of agents that belong to no group. */
export const UNGROUPED_KEY = 'ungrouped';
