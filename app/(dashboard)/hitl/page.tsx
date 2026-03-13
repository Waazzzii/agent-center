'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HitlRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/approvals'); }, [router]);
  return null;
}
