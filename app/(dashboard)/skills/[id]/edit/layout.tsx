import type { Metadata } from 'next'

/**
 * Metadata-only layout.
 *
 * app/(dashboard)/skills/[id]/edit/page.tsx is a client component, and a "use client" module cannot
 * export `metadata`. Next composes this against the root layout's
 * `%s | <Company> <Center>` template, so the tab reads "Edit Skill | ...".
 */
export const metadata: Metadata = {
  title: 'Edit Skill',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
