'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui.store';
import { logout } from '@/lib/auth/oauth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  requireSuperAdmin?: boolean;
}

const navItems: NavItem[] = [
  {
    label: 'Organizations',
    href: '/organizations',
    icon: Building2,
    requireSuperAdmin: true,
  },
  {
    label: 'Connectors',
    href: '/connectors',
    icon: Plug,
  },
  {
    label: 'Groups',
    href: '/groups',
    icon: Users,
  },
  {
    label: 'Users',
    href: '/users',
    icon: UserCircle,
  },
  {
    label: 'OAuth Clients',
    href: '/oauth-clients',
    icon: Key,
    requireSuperAdmin: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { admin, isSuperAdmin, clearAuth } = useAuthStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();

  const handleLogout = async () => {
    clearAuth();
    await logout();
  };

  // Filter nav items based on role
  const visibleNavItems = navItems.filter(
    (item) => !item.requireSuperAdmin || isSuperAdmin()
  );

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
          <div className="flex h-16 items-center border-b px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Wazzi Admin</h1>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
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
                  <div className="text-xs font-medium text-muted-foreground">
                    Signed in as
                  </div>
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
                    {theme === 'light' ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <Sun className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleLogout}
                  >
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
