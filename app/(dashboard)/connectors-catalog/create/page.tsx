'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Creation is now handled via a modal on the catalog list page.
export default function CreateConnectorRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/connectors-catalog');
  }, [router]);
  return null;
}
