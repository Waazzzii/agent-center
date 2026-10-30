'use client';

import { useAuthStore } from '@/stores/auth.store';
import { NoPermissionContent } from '@/components/layout/no-permission-content';

/**
 * Agent Factory is in development: super admins only. The nav hides it
 * (superAdminOnly in lib/nav.ts) and wazzi-backend's factory routes refuse
 * everyone else; this stops a pasted URL from showing an empty shell.
 */
export default function FactoryLayout({ children }: { children: React.ReactNode }) {
  const isSuperAdmin = useAuthStore((s) => s.isSuperAdmin());
  if (!isSuperAdmin) return <NoPermissionContent />;
  return children;
}
