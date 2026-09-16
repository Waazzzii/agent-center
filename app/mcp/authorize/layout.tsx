import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/mcp/authorize/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Authorize | ...".
 */
export const metadata: Metadata = {
  title: 'Authorize',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
