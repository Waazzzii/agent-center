import type { Metadata } from 'next'

/**
 * Metadata-only layout for the Interactions parent. Its children (Logins,
 * Decisions) each set their own title, which overrides this; this is only the
 * fallback and the value Next uses if a child ever omits one.
 */
export const metadata: Metadata = {
  title: 'Interactions',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
