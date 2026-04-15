'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy redirect — Approvals was merged into the unified Interactions page.
export default function ApprovalsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/interactions'); }, [router]);
  return null;
}
