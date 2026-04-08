'use client';

import { createContext, useContext } from 'react';

interface BrandingContextValue {
  hasLogo: boolean;
  logoVersion?: string;
}

const BrandingContext = createContext<BrandingContextValue>({ hasLogo: false });

export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({
  children,
  hasLogo,
  logoVersion,
}: {
  children: React.ReactNode;
  hasLogo: boolean;
  logoVersion?: string;
}) {
  return (
    <BrandingContext.Provider value={{ hasLogo, logoVersion }}>
      {children}
    </BrandingContext.Provider>
  );
}
