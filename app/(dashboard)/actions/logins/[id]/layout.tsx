import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/actions/logins/[id]/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Login | ...".
 */
export const metadata: Metadata = {
  title: 'Login',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
