'use client';

import Image from 'next/image';
import { useBranding } from '@/components/branding/BrandingProvider';

/**
 * Full-screen loading state while the app starts (session hydrating after
 * sign-in). The org's own logo when it has one, else the Wazzi lockup — the
 * same pair the sidebar shows, so the app "arrives" rather than swaps.
 *
 * Fades in after a short delay: a fast load never paints it at all, so it
 * only appears when someone is actually waiting. `message` names the rare
 * wait worth naming (signing out).
 */
export function CenterLoading({ message }: { message?: string }) {
  const { hasLogo, logoVersion } = useBranding();

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background">
      {/* Soft brand glow behind the mark — present, not decorative noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-3xl"
      />
      <div
        role="status"
        aria-live="polite"
        className="relative flex flex-col items-center gap-6 animate-in fade-in duration-500 delay-150 fill-mode-both"
      >
        {hasLogo ? (
          <Image
            src={`/api/branding/logo${logoVersion ? `?v=${logoVersion}` : ''}`}
            alt=""
            width={180}
            height={60}
            priority
            className="h-14 w-auto object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={80} height={80} priority className="h-14 w-auto" />
            <Image src="/wazzi_light.png" alt="wazzi.io" width={120} height={40} className="h-4 w-auto dark:hidden" />
            <Image src="/wazzi_dark.png" alt="wazzi.io" width={120} height={40} className="hidden h-4 w-auto dark:block" />
          </div>
        )}
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Agent Center</p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 rounded-full bg-brand animate-[center-loading_1.2s_ease-in-out_infinite]" />
        </div>
        {message ? (
          <p className="text-sm font-medium text-foreground">{message}</p>
        ) : (
          <span className="sr-only">Loading</span>
        )}
      </div>
    </div>
  );
}
