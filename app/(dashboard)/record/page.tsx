'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Legacy redirect — Browser Scripts moved to /actions/browser-scripts
export default function RecordRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/actions/browser-scripts'); }, [router]);
  return null;
}
