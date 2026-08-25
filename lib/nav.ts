/**
 * Shared nav item definitions and permission-aware routing helpers.
 * Imported by both the layout (for initial redirect) and the sidebar (for Settings entry link).
 */

export interface NavItem {
  label: string;
  href: string;
  permissionKeys?: string[];
  children?: NavItem[];
  /** Non-clickable section caption (e.g. "Building blocks"). No href/icon. */
  heading?: boolean;
}

/**
 * Main org nav. Agents is the workspace: the routines themselves, their run
 * history, and the SKILLS a routine's steps are assembled from.
 *
 * "Skills" is a flat group of step types — AI, Browser, Logins, Approvals —
 * rather than the previous nesting (Logins under Browser Scripts, the old
 * skill library under AI Steps). Those nestings implied a dependency that
 * isn't real: a login is not a property of browser scripts, it's another kind
 * of thing a step can be. One level, four siblings, reads as a palette.
 *
 * LABELS ONLY. Routes, permissions, tables and behaviour are unchanged —
 * "Routines" still lives at /agents, "AI" at /actions/ai-steps. Icons are
 * keyed by href in ViewModeSidebar, so renames here don't disturb them.
 *
 * The old skill library (/skills — the entities you attached to AI steps) is
 * deliberately absent. With AI steps now being the reusable unit themselves,
 * a second layer of attachable "skills" was a distinction without a
 * difference. The page still exists at its URL; it's just no longer somewhere
 * the nav will take you.
 */
export const orgMainNavItems: NavItem[] = [
  {
    label: 'Agents',
    href: '', // grouper — "Routines" below is the actual list page
    permissionKeys: ['agent_center_user'],
    children: [
      { label: 'Routines',   href: '/agents',        permissionKeys: ['agent_center_user'] },
      { label: 'Executions', href: '/agent-history', permissionKeys: ['agent_center_user'] },
      { label: 'Skills', href: '', heading: true },
      { label: 'AI',        href: '/actions/ai-steps',        permissionKeys: ['agent_center_user'] },
      { label: 'Browser',   href: '/actions/browser-scripts', permissionKeys: ['agent_center_user'] },
      { label: 'Logins',    href: '/actions/logins',          permissionKeys: ['agent_center_user'] },
      { label: 'Approvals', href: '/actions/approvals',       permissionKeys: ['agent_center_user'] },
    ],
  },
  { label: 'Action Required', href: '/interactions',    permissionKeys: ['agent_center_user'] },
  { label: 'Analytics',       href: '/agent-analytics', permissionKeys: ['agent_center_user'] },
  { label: 'Billing & Usage', href: '/billing',         permissionKeys: ['agent_center_user'] },
  { label: 'Clients',         href: '/clients',         permissionKeys: ['agent_center_user'] },
  { label: 'Access',          href: '/access',          permissionKeys: ['agent_center_user'] },
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
  const permitted = (item: NavItem) =>
    bypass || !item.permissionKeys || item.permissionKeys.some((k) => hasPermFn(orgId, k));

  for (const item of items) {
    // Prefer the item's OWN page when it has one (e.g. Agents → /agents),
    // so a parent that also has children doesn't redirect to its first child.
    if (item.href && permitted(item)) return item.href;
    // Otherwise it's a grouper — descend into its children.
    if (item.children?.length) {
      const childHref = firstPermittedHref(item.children, bypass, hasPermFn, orgId);
      if (childHref) return childHref;
    }
  }
  return null;
}
