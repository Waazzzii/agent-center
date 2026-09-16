import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/agent-history/[id]/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Execution | ...".
 */
export const metadata: Metadata = {
  title: 'Execution',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
