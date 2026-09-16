import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/billing/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Billing & Usage | ...".
 */
export const metadata: Metadata = {
  title: 'Billing & Usage',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
