import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/record/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Record | ...".
 */
export const metadata: Metadata = {
  title: 'Record',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
