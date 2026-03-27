'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BrowseConnectorsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/connectors'); }, [router]);
  return null;
}
