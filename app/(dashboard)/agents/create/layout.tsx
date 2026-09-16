import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/agents/create/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "New Routine | ...".
 */
export const metadata: Metadata = {
  title: 'New Routine',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
