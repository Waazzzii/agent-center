'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth.store';
import { useAdminViewStore } from '@/stores/admin-view.store';
import {
  LogOut,
  Moon,
  Sun,
  ChevronDown,
  ChevronRight,
  X,
  Bot,
  CheckCircle,
  History,
  BarChart3,
  ShieldCheck,
  Video,
  LayoutGrid,
  Wand2,
  LogIn,
  MessageSquare,
  Sparkles,
  Receipt,
} from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui.store';
import { orgMainNavItems as mainItems, type NavItem } from '@/lib/nav';
import { useBranding } from '@/components/branding/BrandingProvider';

// Icons resolved at render time so the recursive renderer doesn't need a
// pre-transformed tree. Keyed by href; groupers (no href) keyed by label.
const ICON_BY_HREF: Record<string, React.ElementType> = {
  '/agents':                  LayoutGrid,
  '/agent-history':           History,
  '/actions/ai-steps':        Sparkles,
  '/skills':                  Wand2,
  '/actions/browser-scripts': Video,
  '/actions/logins':          LogIn,
  '/actions/approvals':       CheckCircle,
  '/interactions':            MessageSquare,
  '/agent-analytics':         BarChart3,
  '/billing':                 Receipt,
  '/access':                  ShieldCheck,
};
const ICON_BY_LABEL: Record<string, React.ElementType> = {
  'Agents': Bot,
};
const iconFor = (item: NavItem): React.ElementType =>
  ICON_BY_HREF[item.href] ?? ICON_BY_LABEL[item.label] ?? Bot;

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

  // True when `item` (or any descendant) is the current route. Drives both
  // "is this branch active" highlighting and auto-expansion of the active path.
  const isActiveHref = (href: string) =>
    !!href && (pathname === href || pathname.startsWith(`${href}/`));
  const containsActive = (item: NavItem): boolean =>
    isActiveHref(item.href) || (item.children ?? []).some(containsActive);

  // Auto-expand every ancestor of the active route so the current page is
  // always revealed in the tree (respecting manual collapses).
  useEffect(() => {
    const toExpand = new Set<string>();
    const walk = (items: NavItem[]) => {
      for (const it of items) {
        if (it.children?.length) {
          if (!manuallyClosed.current.has(navKey(it)) && containsActive(it)) {
            toExpand.add(navKey(it));
          }
          walk(it.children);
        }
      }
    };
    walk(mainItems);
    if (toExpand.size > 0) {
      setExpandedItems((prev) => new Set([...prev, ...toExpand]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // POST to server signout so httpOnly cookies are actually cleared.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/signout';
    document.body.appendChild(form);
    form.submit();
  };

  const permitted = (item: NavItem) =>
    !item.permissionKeys || !selectedOrgId || item.permissionKeys.some((k) => hasPermission(selectedOrgId, k));

  const closeMobile = () => { if (sidebarOpen) toggleSidebar(); };

  // Recursive renderer — supports the 3 levels (Agents → AI Steps → Skills).
  // depth 0 = top-level; nested levels indent under a left guide rail.
  const renderItem = (item: NavItem, depth: number): React.ReactNode => {
    if (item.heading) {
      return (
        <div key={`h:${item.label}`} className="px-3 pt-3 pb-1 text-[11px] font-medium text-muted-foreground">
          {item.label}
        </div>
      );
    }

    const Icon = iconFor(item);
    const key = navKey(item);
    const visibleChildren = (item.children ?? []).filter((c) => c.heading || permitted(c));
    const hasChildren = visibleChildren.length > 0;
    const isExpanded = hasChildren && expandedItems.has(key);
    const selfActive = isActiveHref(item.href);
    const iconSize = depth === 0 ? 'h-5 w-5' : 'h-4 w-4';

    const chevron = isExpanded
      ? <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      : <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />;

    let row: React.ReactNode;
    if (!item.href) {
      // Pure grouper (Agents) — click toggles expansion.
      row = (
        <button
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => toggleExpanded(key)}
        >
          <Icon className={cn(iconSize, 'shrink-0')} />
          <span className="flex-1">{item.label}</span>
          {chevron}
        </button>
      );
    } else if (hasChildren) {
      // A page that also has children (AI Steps, Browser Scripts): link + chevron.
      row = (
        <div
          className={cn(
            'flex w-full items-center rounded-lg text-sm font-medium transition-colors',
            selfActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <Link
            href={item.href}
            className="flex flex-1 items-center gap-3 px-3 py-2"
            onClick={() => {
              manuallyClosed.current.delete(key);
              setExpandedItems((prev) => new Set([...prev, key]));
              closeMobile();
            }}
          >
            <Icon className={cn(iconSize, 'shrink-0')} />
            <span className="flex-1 text-left">{item.label}</span>
          </Link>
          <button onClick={() => toggleExpanded(key)} className="pr-3 py-2" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
            {chevron}
          </button>
        </div>
      );
    } else {
      // Leaf link.
      row = (
        <Link
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            selfActive
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
          onClick={closeMobile}
        >
          <Icon className={cn(iconSize, 'shrink-0')} />
          <span className="flex-1 text-left">{item.label}</span>
        </Link>
      );
    }

    return (
      <div key={key}>
        {row}
        {hasChildren && isExpanded && (
          <div className="mt-0.5 ml-3 space-y-0.5 border-l border-sidebar-border pl-2">
            {visibleChildren.map((child) => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const visibleNavItems = mainItems.filter(permitted);

  return (
    <>
      {/* The mobile menu button lives in the dashboard layout's top header bar
          (MobileTopBar), not here — keeping it out of the transformed <aside>
          and out of the page content so it never overlaps page headings. */}
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

          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {visibleNavItems.length === 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No access granted yet
              </div>
            )}
            {visibleNavItems.map((item) => renderItem(item, 0))}
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
