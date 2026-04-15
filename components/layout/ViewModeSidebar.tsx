'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  LogOut,
  Menu,
  Moon,
  Sun,
  ChevronDown,
  ChevronRight,
  X,
  Wand2,
  Bot,
  CheckCircle,
  History,
  BarChart3,
  ShieldCheck,
  Video,
  Zap,
  LogIn,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui.store';
import { logout } from '@/lib/auth/oauth';
import { orgMainNavItems as mainItems } from '@/lib/nav';
import { useBranding } from '@/components/branding/BrandingProvider';

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
  permissionKeys?: string[];
  children?: NavChild[];
}

// Merge icons onto shared nav items so they work in the sidebar
const MAIN_ICONS: Record<string, React.ElementType> = {
  '/agents':           Bot,
  '/agent-history':    History,
  '/agent-analytics':  BarChart3,
  '/interactions':     MessageSquare,
  '/approvals':        CheckCircle,
  '/skills':           Wand2,
  '/record':           Video,
  '/access':           ShieldCheck,
};
// Icons for grouper items (no href) — keyed by label
const GROUPER_ICONS: Record<string, React.ElementType> = {
  'Actions': Zap,
};
const CHILD_ICONS: Record<string, React.ElementType> = {
  '/actions/ai-steps':        Sparkles,
  '/actions/logins':          LogIn,
  '/actions/browser-scripts': Video,
};
const orgMainNavItems: NavItem[] = mainItems.map((item) => ({
  ...item,
  icon: MAIN_ICONS[item.href] ?? GROUPER_ICONS[item.label] ?? Bot,
  children: item.children?.map((child) => ({ ...child, icon: CHILD_ICONS[child.href] ?? Bot })),
}));

export function ViewModeSidebar() {
  const pathname = usePathname();
  const { admin, hasPermission } = useAuthStore();
  const { selectedOrgId } = useAdminViewStore();
  const { hasLogo, logoVersion } = useBranding();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const manuallyClosed = useRef<Set<string>>(new Set());

  // Stable key for nav items.  Most items use their href; grouper items
  // (children-only, no own page) fall back to their label.
  const navKey = (item: { href: string; label: string }) => item.href || `group:${item.label}`;

  useEffect(() => {
    const newExpanded = new Set<string>();
    for (const item of orgMainNavItems) {
      if (!item.children?.length) continue;
      const key = navKey(item);
      if (manuallyClosed.current.has(key)) continue;
      const hrefMatchesPath = item.href && pathname.startsWith(item.href);
      if (
        item.children.some((c) => pathname.startsWith(c.href)) ||
        hrefMatchesPath
      ) {
        newExpanded.add(key);
      }
    }
    if (newExpanded.size > 0) {
      setExpandedItems((prev) => new Set([...prev, ...newExpanded]));
    }
  }, [pathname]);

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

  const visibleNavItems = orgMainNavItems.filter((item) => {
    if (!item.permissionKeys || !selectedOrgId) return true;
    return item.permissionKeys.some((key) => hasPermission(selectedOrgId, key));
  });

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const key = navKey(item);
    const isExpanded = hasChildren && expandedItems.has(key);
    const isChildActive = hasChildren && item.children!.some((c) => pathname.startsWith(c.href));
    const isActive = !hasChildren && !!item.href && pathname.startsWith(item.href);
    // A "grouper" is a parent nav item that has no own page and exists only
    // to expand/collapse its children.  Either: the parent's href matches
    // one of its children (legacy), or the parent has no href at all.
    const isGrouper = hasChildren && (!item.href || item.children!.some((c) => c.href === item.href));

    const visibleChildren = hasChildren
      ? item.children!.filter((child) => {
          if (!child.permissionKeys || !selectedOrgId) return true;
          return child.permissionKeys.some((k) => hasPermission(selectedOrgId, k));
        })
      : [];

    return (
      <div key={key}>
        {hasChildren ? (
          <div
            className={cn(
              'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
              !isGrouper && item.href && pathname.startsWith(item.href) && !isChildActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            {isGrouper ? (
              <button
                className="flex flex-1 items-center gap-3 px-3 py-2 text-left"
                onClick={() => toggleExpanded(key)}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
                }
              </button>
            ) : (
              <>
                <Link
                  href={item.href}
                  className="flex flex-1 items-center gap-3 px-3 py-2"
                  onClick={() => {
                    manuallyClosed.current.delete(key);
                    setExpandedItems((prev) => new Set([...prev, key]));
                    if (sidebarOpen) toggleSidebar();
                  }}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                </Link>
                <button
                  onClick={() => toggleExpanded(key)}
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
          <div className="relative flex h-16 items-center justify-center border-b px-4 py-2">
            {hasLogo ? (
              <Image
                src={`/api/branding/logo${logoVersion ? `?v=${logoVersion}` : ''}`}
                alt=""
                width={120}
                height={40}
                className="h-10 w-auto object-contain"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <Image src="/logo.png" alt="" width={80} height={80} className="h-11 w-auto" />
                <Image src="/wazzi_light.png" alt="wazzi.io" width={120} height={40} className="h-3 w-auto dark:hidden" />
                <Image src="/wazzi_dark.png" alt="wazzi.io" width={120} height={40} className="h-3 w-auto hidden dark:block" />
              </div>
            )}
            <Button variant="ghost" size="icon" className="absolute right-2 md:hidden" onClick={toggleSidebar} aria-label="Close menu">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Mobile menu button (visible only on mobile when sidebar is closed) */}
          <Button
            variant="ghost"
            size="icon"
            className="fixed left-4 top-4 z-50 md:hidden h-12 w-12 rounded-lg bg-background/95 backdrop-blur shadow-lg border"
            onClick={toggleSidebar}
            aria-label="Toggle menu"
            style={{ display: sidebarOpen ? 'none' : undefined }}
          >
            <Menu className="h-6 w-6" />
          </Button>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {visibleNavItems.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No access granted yet
              </div>
            )}
            {visibleNavItems.map(renderNavItem)}
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            {admin && (
              <>
                <div className="mb-3 rounded-lg bg-sidebar-accent p-3">
                  <div className="text-xs font-medium text-muted-foreground">Signed in as</div>
                  <div className="mt-1 text-sm font-semibold">{admin.email}</div>
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
