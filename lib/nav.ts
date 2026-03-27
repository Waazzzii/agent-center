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
  { label: 'Agentic Workflows', href: '/agents',        permissionKeys: ['agents_manager'] },
  { label: 'Agent History',     href: '/agent-history', permissionKeys: ['agents_manager'] },
  { label: 'Approvals',         href: '/approvals',     permissionKeys: ['agents_manager'] },
  { label: 'Skills',            href: '/skills',        permissionKeys: ['agents_manager'] },
];

/** Settings nav — shown in the settings panel, alphabetical */
export const orgSettingsNavItems: NavItem[] = [
  {
    label: 'Access',
    href: '/access-groups',
    permissionKeys: ['admin_users', 'admin_groups'],
    children: [
      { label: 'Users',   href: '/users',         permissionKeys: ['admin_users'] },
      { label: 'Groups',  href: '/access-groups', permissionKeys: ['admin_groups'] },
    ],
  },
  { label: 'AI Agent', href: '/ai-agent', permissionKeys: ['admin_ai_agent'] },
  { label: 'Connectors', href: '/connectors', permissionKeys: ['admin_connectors'] },
  {
    label: 'Audit',
    href: '/audit-logs',
    permissionKeys: ['admin_audit_logs', 'admin_oauth_clients'],
    children: [
      { label: 'Logs',   href: '/audit-logs',    permissionKeys: ['admin_audit_logs'] },
      { label: 'OAuth',  href: '/oauth-clients', permissionKeys: ['admin_oauth_clients'] },
    ],
  },
  {
    label: 'Centers',
    href: '/centers/data-sources',
    permissionKeys: ['admin_data_sources', 'admin_products'],
    children: [
      { label: 'Data Sources', href: '/centers/data-sources', permissionKeys: ['admin_data_sources'] },
      { label: 'Products',     href: '/centers/products',     permissionKeys: ['admin_products'] },
    ],
  },
  { label: 'Organization', href: '/organization', permissionKeys: ['admin_organization'] },
];

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
