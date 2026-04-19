import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TokenRefreshProvider } from "@/components/auth/TokenRefreshProvider";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { getAgentCenterBranding } from "@/lib/branding";
import { cookies, headers } from "next/headers";
import { BrandingProvider } from "@/components/branding/BrandingProvider";
import { COOKIE_NAME, getSessionFromToken } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Wazzi",
    template: "%s | Wazzi",
  },
  description: "Wazzi Admin Dashboard - Manage organizations, connectors, users, and OAuth clients",
  applicationName: "Wazzi",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get("host") ?? "";
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = token ? await getSessionFromToken(token, host) : null;

  const branding = await getAgentCenterBranding(host);

  const faviconVersion = branding.favicon_storage_path?.split("/").pop()?.split(".")[0]?.slice(-12);
  const logoVersion    = branding.logo_storage_path?.split("/").pop()?.split(".")[0]?.slice(-12);

  const faviconHref = branding.favicon_storage_path
    ? `/api/branding/favicon?v=${faviconVersion}`
    : branding.logo_storage_path
    ? `/api/branding/logo?v=${logoVersion}`
    : '/favicon.png';

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href={faviconHref} />
        <link rel="apple-touch-icon" href={faviconHref} />
        {branding.custom_theme && (
          <style id="agc-custom-theme" dangerouslySetInnerHTML={{ __html: branding.custom_theme }} />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <BrandingProvider hasLogo={!!branding.logo_storage_path} logoVersion={logoVersion}>
            <SessionProvider session={session}>
              <TokenRefreshProvider />
              {children}
            </SessionProvider>
            <Toaster
              position="bottom-right"
              richColors
              expand={true}
              visibleToasts={5}
              closeButton
            />
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
