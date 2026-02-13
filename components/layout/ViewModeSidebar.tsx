'use client';

import { useEffect, useState } from 'react';
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
  UsersRound,
  Link as LinkIcon,
  FileText,
  ChevronDown,
  Settings,
} from 'lucide-react';
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

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  superAdminOnly?: boolean;
  orgAdminOnly?: boolean;
}

// Super Admin View Navigation
const superAdminNavItems: NavItem[] = [
  {
    label: 'Organizations',
    href: '/organizations',
    icon: Building2,
    superAdminOnly: true,
  },
  {
    label: 'Connectors Catalog',
    href: '/connectors-catalog',
    icon: Database,
    superAdminOnly: true,
  },
  {
    label: 'OAuth Clients',
    href: '/oauth-clients',
    icon: Key,
    superAdminOnly: true,
  },
  {
    label: 'Administrators',
    href: '/administrators',
    icon: Shield,
    superAdminOnly: true,
  },
  {
    label: 'Refresh Tokens',
    href: '/refresh-tokens',
    icon: Ticket,
    superAdminOnly: true,
  },
  {
    label: 'Audit Logs',
    href: '/audit-logs',
    icon: FileText,
    superAdminOnly: true,
  },
];

// Org Admin View Navigation
const orgAdminNavItems: NavItem[] = [
  {
    label: 'Users',
    href: '/users',
    icon: UserCircle,
    orgAdminOnly: true,
  },
  {
    label: 'Groups',
    href: '/groups',
    icon: UsersRound,
    orgAdminOnly: true,
  },
  {
    label: 'Connectors',
    href: '/connectors',
    icon: Plug,
    orgAdminOnly: true,
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    orgAdminOnly: true,
  },
];

export function ViewModeSidebar() {
  const pathname = usePathname();
  const { admin, isSuperAdmin, clearAuth } = useAuthStore();
  const { viewMode, selectedOrgName, selectedOrgId, switchToOrgAdminView } = useAdminViewStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);

  // Load organizations when in org admin view
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

  const handleLogout = async () => {
    clearAuth();
    await logout();
  };

  // Determine which nav items to show based on view mode
  const navItems = viewMode === 'super_admin' ? superAdminNavItems : orgAdminNavItems;

  // Filter based on user role
  const visibleNavItems = navItems.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin();
    if (item.orgAdminOnly) return true; // Both super admin and org admin can see
    return true;
  });

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={toggleSidebar}
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen w-64 border-r bg-sidebar transition-transform',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center justify-center border-b px-6">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground',
                  viewMode === 'super_admin' ? 'bg-primary' : 'bg-secondary'
                )}
              >
                {viewMode === 'super_admin' ? (
                  <Shield className="h-5 w-5" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>
              <h1 className="text-lg font-semibold">Wazzi Admin</h1>
            </div>
          </div>

          {/* Organization Selector - only in org admin view */}
          {viewMode === 'org_admin' ? (
            <div className="border-b px-4 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    disabled={loading}
                  >
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
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  ) : organizations.length === 0 ? (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      No organizations available
                    </div>
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
            /* Super Admin View Badge */
            <div className="border-b px-4 py-3">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-primary/10 text-primary">
                <Shield className="h-3 w-3" />
                Super Admin View
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
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
                  onClick={() => {
                    if (sidebarOpen) toggleSidebar();
                  }}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
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
                          : 'bg-secondary/10 text-secondary'
                      )}
                    >
                      {admin.role === AdminRole.SUPER_ADMIN ? 'Super Admin' : 'Org Admin'}
                    </span>
                  </div>
                </div>
                <div className="mb-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleTheme}
                    className="flex-shrink-0"
                  >
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
