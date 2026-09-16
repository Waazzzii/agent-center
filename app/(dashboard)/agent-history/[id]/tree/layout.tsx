import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/agent-history/[id]/tree/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Execution Tree | ...".
 */
export const metadata: Metadata = {
  title: 'Execution Tree',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
