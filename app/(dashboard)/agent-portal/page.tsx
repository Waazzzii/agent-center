import { redirect } from 'next/navigation';

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agent Portal',
}

export default function AgentPortalPage() {
  redirect('/agent-portal/browser');
}
