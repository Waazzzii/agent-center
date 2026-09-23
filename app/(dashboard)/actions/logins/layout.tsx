import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/actions/logins/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Logins | ...".
 */
export const metadata: Metadata = {
  title: 'Login Scripts',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
