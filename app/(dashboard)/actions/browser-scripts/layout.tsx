import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/actions/browser-scripts/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Browser Scripts | ...".
 */
export const metadata: Metadata = {
  title: 'Browser Scripts',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
