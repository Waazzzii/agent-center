'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import { AdminRole, BYPASS_PERMISSION_ROLES } from '@/types/api.types';
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
  Settings,
  BookOpen,
  X,
  Wand2,
  Bot,
  CheckCircle,
  ChevronLeft,
  ShieldCheck,
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

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
  permissionKeys?: string[];
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
  '/agents': Bot,
  '/hitl':   CheckCircle,
  '/skills': Wand2,
};
const SETTINGS_ICONS: Record<string, React.ElementType> = {
  '/access-groups':  ShieldCheck,
  '/audit-logs':     FileText,
  '/knowledge-base': BookOpen,
  '/connectors':     Plug,
  '/oauth-clients':  Key,
  '/organization':   Building2,
  '/users':          UserCircle,
};

const orgMainNavItems: NavItem[] = mainItems.map((i) => ({ ...i, icon: MAIN_ICONS[i.href] ?? Bot }));
const orgSettingsNavItems: NavItem[] = settingsItems.map((i) => ({ ...i, icon: SETTINGS_ICONS[i.href] ?? Building2 }));

// Paths that belong to the settings panel (triggers settings mode)
const SETTINGS_PATHS = ['/users', '/connectors', '/access-groups', '/oauth-clients', '/knowledge-base', '/audit-logs', '/organization'];

export function ViewModeSidebar() {
  const pathname = usePathname();
  const { admin, isSuperAdmin, hasPermission, isOrgAdmin, hasOrgAccess } = useAuthStore();
  const { viewMode, selectedOrgName, selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsMode, setSettingsMode] = useState(false);

  // Auto-detect settings mode from current path
  useEffect(() => {
    const inSettings = SETTINGS_PATHS.some((p) => pathname.startsWith(p));
    setSettingsMode(inSettings);
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
              {/* ENABLE_MAIN_NAV — uncomment the block below to restore the Back button */}
              {/* <Button
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
              </Button> */}
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
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
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
              );
            })}

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
