'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { AdminRole } from '@/types/api.types';
import {
  Building2,
  Plug,
  Users,
  UserCircle,
  Key,
  LogOut,
  Menu,
  Moon,
  Sun,
  Shield,
  Database,
  Ticket,
  FileText,
  ChevronDown,
  ChevronRight,
  Settings,
  X,
  Wand2,
  Bot,
  CheckCircle,
  ChevronLeft,
  ShieldCheck,
  History,
  Layers,
  Globe,
  UsersRound,
  UserRound,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/ui.store';
import { logout } from '@/lib/auth/oauth';
import { getOrganizations } from '@/lib/api/organizations';
import type { Organization } from '@/types/api.types';
import { orgMainNavItems as mainItems, orgSettingsNavItems as settingsItems, firstPermittedHref } from '@/lib/nav';

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  permissionKeys?: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
  permissionKeys?: string[];
  children?: NavChild[];
}

// Super Admin system-level nav
const superAdminNavItems: NavItem[] = [
  { label: 'Organizations',      href: '/organizations',      icon: Building2, superAdminOnly: true },
  { label: 'Connectors Catalog', href: '/connectors-catalog', icon: Database,  superAdminOnly: true },
  { label: 'OAuth Clients',      href: '/oauth-clients',      icon: Key,       superAdminOnly: true },
  { label: 'Administrators',     href: '/administrators',     icon: Shield,    superAdminOnly: true },
  { label: 'Refresh Tokens',     href: '/refresh-tokens',    icon: Ticket,    superAdminOnly: true },
  { label: 'Audit Logs',         href: '/audit-logs',        icon: FileText,  superAdminOnly: true },
];

// Merge icons onto shared nav items so they work in the sidebar
const MAIN_ICONS: Record<string, React.ElementType> = {
  '/agents':        Bot,
  '/agent-history': History,
  '/approvals':     CheckCircle,
  '/skills':        Wand2,
};
const SETTINGS_ICONS: Record<string, React.ElementType> = {
  '/access-groups':  UsersRound,
  '/ai-agent':       Bot,
  '/audit-logs':     FileText,
  '/centers/data-sources': Layers,
  '/connectors':     Plug,
  '/oauth-clients':  Key,
  '/organization':   Building2,
  '/users':          UserCircle,
};
const CHILDREN_ICONS: Record<string, React.ElementType> = {
  '/centers/data-sources':  Database,
  '/centers/products':      Globe,
  '/users':          UserRound,
  '/access-groups':  UsersRound,
  '/ai-agent':       Bot,
  '/connectors':     Plug,
  '/audit-logs':     FileText,
  '/oauth-clients':  Key,
};

const orgMainNavItems: NavItem[] = mainItems.map(({ children: _ch, ...i }) => ({ ...i, icon: MAIN_ICONS[i.href] ?? Bot }));
const orgSettingsNavItems: NavItem[] = settingsItems.map(({ children, ...i }) => ({
  ...i,
  icon: SETTINGS_ICONS[i.href] ?? Building2,
  children: children?.map((c) => ({ ...c, icon: CHILDREN_ICONS[c.href] ?? Settings })),
})) as NavItem[];

// Paths that belong to the settings panel (triggers settings mode)
const SETTINGS_PATHS = ['/users', '/connectors', '/access-groups', '/oauth-clients', '/knowledge-base', '/audit-logs', '/organization', '/ai-agent', '/centers'];

export function ViewModeSidebar() {
  const pathname = usePathname();
  const { admin, isSuperAdmin, hasPermission, isOrgAdmin, hasOrgAccess } = useAuthStore();
  const { viewMode, selectedOrgName, selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsMode, setSettingsMode] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Tracks items the user has explicitly collapsed so auto-expand doesn't override them
  const manuallyClosed = useRef<Set<string>>(new Set());

  // Auto-detect settings mode from current path.
  // When first entering settings, collapse all nav items so the user starts clean.
  const prevSettingsMode = useRef(false);
  const suppressNextAutoExpand = useRef(false);
  useEffect(() => {
    const inSettings = SETTINGS_PATHS.some((p) => pathname.startsWith(p));
    if (inSettings && !prevSettingsMode.current) {
      // Just entered settings — collapse everything and suppress the auto-expand
      // that will fire in the next effect on this same render cycle.
      setExpandedItems(new Set());
      manuallyClosed.current = new Set();
      suppressNextAutoExpand.current = true;
    }
    prevSettingsMode.current = inSettings;
    setSettingsMode(inSettings);
  }, [pathname]);

  // Auto-expand parent items whose children (or own href) match the current path,
  // but respect items the user has manually collapsed and skip on fresh settings entry.
  useEffect(() => {
    if (suppressNextAutoExpand.current) {
      suppressNextAutoExpand.current = false;
      return;
    }
    const newExpanded = new Set<string>();
    for (const item of orgSettingsNavItems) {
      if (!item.children?.length) continue;
      if (manuallyClosed.current.has(item.href)) continue;
      if (
        item.children.some((c) => pathname.startsWith(c.href)) ||
        pathname.startsWith(item.href)
      ) {
        newExpanded.add(item.href);
      }
    }
    if (newExpanded.size > 0) {
      setExpandedItems((prev) => new Set([...prev, ...newExpanded]));
    }
  }, [pathname]);

  useEffect(() => {
    if (viewMode === 'org_admin') {
      loadOrganizations();
    }
  }, [viewMode]);

  const loadOrganizations = async () => {
    try {
      setLoading(true);
      const { organizations: orgs } = await getOrganizations();
      setOrganizations(orgs);
    } catch (error) {
      console.error('Failed to load organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchOrganization = (org: Organization) => {
    switchToOrgAdminView(org.id, org.name);
  };

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
        manuallyClosed.current.add(href);
      } else {
        next.add(href);
        manuallyClosed.current.delete(href);
      }
      return next;
    });
  };

  const { clearAuth } = useAuthStore();

  const handleLogout = async () => {
    clearAuth();
    await logout();
  };

  const bypassPermissions = isSuperAdmin() || isOrgAdmin();

  // Any admin permission key for "has settings access"
  const settingsPermKeys = orgSettingsNavItems.flatMap((i) => i.permissionKeys ?? []);
  const hasAnySettingsAccess = bypassPermissions || (selectedOrgId
    ? settingsPermKeys.some((k) => hasPermission(selectedOrgId, k))
    : false);

  // Build visible nav list
  let visibleNavItems: NavItem[];

  if (viewMode === 'super_admin') {
    visibleNavItems = superAdminNavItems;
  } else if (settingsMode) {
    visibleNavItems = orgSettingsNavItems.filter((item) => {
      if (bypassPermissions) return true;
      if (!item.permissionKeys || !selectedOrgId) return false;
      return item.permissionKeys.some((key) => hasPermission(selectedOrgId, key));
    });
  } else {
    visibleNavItems = orgMainNavItems.filter((item) => {
      if (bypassPermissions) return true;
      if (!item.permissionKeys || !selectedOrgId) return false;
      return item.permissionKeys.some((key) => hasPermission(selectedOrgId, key));
    });
  }

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = hasChildren && expandedItems.has(item.href);
    const isChildActive = hasChildren && item.children!.some((c) => pathname.startsWith(c.href));
    const isActive = !hasChildren && pathname.startsWith(item.href);
    // A parent whose own href matches a child's href is a pure grouper (no dedicated page).
    // Other parents (e.g. Centers) navigate to their own page AND can be toggled via the chevron.
    const isGrouper = hasChildren && item.children!.some((c) => c.href === item.href);

    const visibleChildren = hasChildren
      ? item.children!.filter((child) => {
          if (bypassPermissions) return true;
          if (!child.permissionKeys || !selectedOrgId) return false;
          return child.permissionKeys.some((k) => hasPermission(selectedOrgId, k));
        })
      : [];

    return (
      <div key={item.href}>
        {hasChildren ? (
          <div
            className={cn(
              'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
              !isGrouper && pathname.startsWith(item.href) && !isChildActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            {isGrouper ? (
              // Pure grouper: whole row toggles — no dedicated page to navigate to
              <button
                className="flex flex-1 items-center gap-3 px-3 py-2 text-left"
                onClick={() => toggleExpanded(item.href)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                }
              </button>
            ) : (
              // Navigable parent: label navigates (and re-expands), chevron independently toggles
              <>
                <Link
                  href={item.href}
                  className="flex flex-1 items-center gap-3 px-3 py-2"
                  onClick={() => {
                    // Intentional navigation clears manual-close so section re-expands
                    manuallyClosed.current.delete(item.href);
                    setExpandedItems((prev) => new Set([...prev, item.href]));
                    if (sidebarOpen) toggleSidebar();
                  }}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </Link>
                <button
                  onClick={() => toggleExpanded(item.href)}
                  className="pr-3 py-2"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                    : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                  }
                </button>
              </>
            )}
          </div>
        ) : (
          <Link
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
            onClick={() => { if (sidebarOpen) toggleSidebar(); }}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        )}

        {/* Children */}
        {hasChildren && isExpanded && visibleChildren.length > 0 && (
          <div className="mt-0.5 ml-4 space-y-0.5 border-l border-sidebar-border pl-3">
            {visibleChildren.map((child) => {
              const ChildIcon = child.icon;
              const childActive = pathname.startsWith(child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    childActive
                      ? 'font-medium bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                  onClick={() => { if (sidebarOpen) toggleSidebar(); }}
                >
                  <ChildIcon className="h-4 w-4 shrink-0" />
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {viewMode === 'super_admin' && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed left-4 top-4 z-50 md:hidden h-12 w-12 rounded-lg bg-background/95 backdrop-blur shadow-lg border"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={toggleSidebar} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-screen w-64 border-r bg-sidebar transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="" width={80} height={80} className="h-11 w-auto" />
              <Image src="/wazzi_light.png" alt="wazzi.io" width={120} height={40} className="h-3 w-auto dark:hidden" />
              <Image src="/wazzi_dark.png" alt="wazzi.io" width={120} height={40} className="h-3 w-auto hidden dark:block" />
            </div>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar} aria-label="Close menu">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Organization Selector / Mode badge */}
          {viewMode === 'org_admin' ? (
            <div className="border-b px-4 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between" disabled={loading}>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="truncate text-sm font-medium">
                        {selectedOrgName || 'Select Organization'}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  {loading ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">Loading...</div>
                  ) : organizations.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">No organizations available</div>
                  ) : (
                    organizations.map((org) => (
                      <DropdownMenuItem
                        key={org.id}
                        onClick={() => handleSwitchOrganization(org)}
                        className="cursor-pointer"
                        disabled={org.id === selectedOrgId}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{org.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{org.slug}</div>
                          </div>
                          {org.id === selectedOrgId && (
                            <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="border-b px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary">
                <Shield className="h-3 w-3" />
                Super Admin View
              </div>
            </div>
          )}

          {/* Settings panel header */}
          {viewMode === 'org_admin' && settingsMode && (
            <div className="border-b px-2 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => setSettingsMode(false)}
                asChild
              >
                <Link href={firstPermittedHref(orgMainNavItems, bypassPermissions, hasPermission, selectedOrgId ?? '') ?? '/no-permission'}>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </Link>
              </Button>
              <div className="px-3 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Settings
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {visibleNavItems.length === 0 && viewMode === 'org_admin' && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No access granted yet
              </div>
            )}
            {visibleNavItems.map(renderNavItem)}

            {/* Settings entry point — shown in main mode when user has any admin access */}
            {viewMode === 'org_admin' && !settingsMode && hasAnySettingsAccess && (
              <Link
                href={firstPermittedHref(orgSettingsNavItems, bypassPermissions, hasPermission, selectedOrgId ?? '') ?? '/no-permission'}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
                onClick={() => { if (sidebarOpen) toggleSidebar(); }}
              >
                <Settings className="h-5 w-5" />
                Settings
              </Link>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            {admin && (
              <>
                <div className="mb-3 rounded-lg bg-sidebar-accent p-3">
                  <div className="text-xs font-medium text-muted-foreground">Signed in as</div>
                  <div className="mt-1 text-sm font-semibold">{admin.email}</div>
                  <div className="mt-1">
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        admin.role === AdminRole.SUPER_ADMIN
                          ? 'bg-primary/10 text-primary'
                          : admin.role === AdminRole.ORG_ADMIN
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                      )}
                    >
                      {admin.role === AdminRole.SUPER_ADMIN ? 'Super Admin'
                      : admin.role === AdminRole.ORG_ADMIN ? 'Administrator'
                      : 'User'}
                    </span>
                  </div>
                </div>
                <div className="mb-3 flex gap-2">
                  <Button variant="outline" size="icon" onClick={toggleTheme} className="flex-shrink-0">
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
