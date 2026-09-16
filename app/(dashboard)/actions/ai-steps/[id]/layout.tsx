import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/actions/ai-steps/[id]/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "AI Step | ...".
 */
export const metadata: Metadata = {
  title: 'AI Step',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
