/**
 * Shared nav item definitions and permission-aware routing helpers.
 * Imported by both the layout (for initial redirect) and the sidebar (for Settings entry link).
 */

export interface NavItem {
  label: string;
  href: string;
  permissionKeys?: string[];
  children?: NavItem[];
}

/** Main org nav — shown in the regular (non-settings) panel, alphabetical */
export const orgMainNavItems: NavItem[] = [
  { label: 'Agentic Workflows', href: '/agents',        permissionKeys: ['agent_center_user'] },
  { label: 'Agent Executions',  href: '/agent-history', permissionKeys: ['agent_center_user'] },
  { label: 'Approvals',         href: '/approvals',     permissionKeys: ['agent_center_user'] },
  { label: 'Skills',            href: '/skills',        permissionKeys: ['agent_center_user'] },
  { label: 'Browser Scripts',   href: '/record',        permissionKeys: ['agent_center_user'] },
  { label: 'Access',            href: '/access',        permissionKeys: ['agent_center_user'] },
];

/** Settings nav — no settings in the Agent Center */
export const orgSettingsNavItems: NavItem[] = [];

/**
 * Returns the href of the first nav item the user has permission for,
 * or null if none are accessible.
 *
 * @param items       Nav items to search (already in desired display order)
 * @param bypass      True for super_admin / org_admin — they skip permission checks
 * @param hasPermFn   The hasPermission function from the auth store
 * @param orgId       Currently selected org
 */
export function firstPermittedHref(
  items: NavItem[],
  bypass: boolean,
  hasPermFn: (orgId: string, key: string) => boolean,
  orgId: string
): string | null {
  for (const item of items) {
    // If item has children, recurse into them first
    if (item.children?.length) {
      const childHref = firstPermittedHref(item.children, bypass, hasPermFn, orgId);
      if (childHref) return childHref;
      continue;
    }
    if (bypass) return item.href;
    if (!item.permissionKeys) return item.href;
    if (item.permissionKeys.some((k) => hasPermFn(orgId, k))) return item.href;
  }
  return null;
}
