/**
 * Shared nav item definitions and permission-aware routing helpers.
 * Imported by both the layout (for initial redirect) and the sidebar (for Settings entry link).
 */

export interface NavItem {
  label: string;
  href: string;
  permissionKeys?: string[];
}

/** Main org nav — shown in the regular (non-settings) panel, alphabetical */
export const orgMainNavItems: NavItem[] = [
  { label: 'Agentic Workflows', href: '/agents',         permissionKeys: ['agents_read'] },
  { label: 'Agent History',    href: '/agent-history',  permissionKeys: ['agents_read'] },
  { label: 'Approvals',        href: '/approvals',      permissionKeys: ['approvals_read'] },
  { label: 'Skills',         href: '/skills',         permissionKeys: ['skills_read'] },
];

/** Settings nav — shown in the settings panel, alphabetical */
export const orgSettingsNavItems: NavItem[] = [
  { label: 'Access Groups',   href: '/access-groups',  permissionKeys: ['access_groups_read'] },
  { label: 'AI Agent',        href: '/ai-agent',       permissionKeys: ['agents_read'] },
  { label: 'Audit Logs',      href: '/audit-logs',     permissionKeys: ['audit_logs_read'] },
  { label: 'Knowledge Base',  href: '/knowledge-base', permissionKeys: ['knowledgebase_admin_read'] },
  { label: 'MCP Connections', href: '/connectors',     permissionKeys: ['connectors_read'] },
  { label: 'OAuth Clients',   href: '/oauth-clients',  permissionKeys: ['oauth_clients_read'] },
  { label: 'Organization',    href: '/organization',   permissionKeys: ['organization_read'] },
  { label: 'Users',           href: '/users',          permissionKeys: ['users_read'] },
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
    if (bypass) return item.href;
    if (!item.permissionKeys) return item.href;
    if (item.permissionKeys.some((k) => hasPermFn(orgId, k))) return item.href;
  }
  return null;
}
