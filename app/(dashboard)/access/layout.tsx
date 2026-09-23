import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/access/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Authorization | ...".
 * The route stays /access; only the label changed.
 */
export const metadata: Metadata = {
  title: 'Authorization',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
