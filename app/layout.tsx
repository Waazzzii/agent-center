import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { TokenRefreshProvider } from "@/components/auth/TokenRefreshProvider";
import { SessionProvider } from "@/components/auth/SessionProvider";
import { getBranding, faviconHref } from "@/lib/branding";
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

/**
 * Title and icon come from the org this hostname belongs to. The template is
 * what makes per-page titles cheap: a page declares `title: 'Connectors'` and
 * Next composes "Connectors | Casago Agent Center". No page fetches branding.
 */
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host") ?? "";
  const branding = await getBranding(host);
  const icon = faviconHref(branding);

  return {
    title: {
      default: branding.site_name,
      template: `%s | ${branding.site_name}`,
    },
    description: "Manage organizations, connectors, users, and OAuth clients",
    applicationName: branding.site_name,
    icons: { icon, shortcut: icon, apple: icon },
  };
}

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

  // Deduped with generateMetadata's call by the Next data cache — same URL,
  // same tag, one backend request.
  const branding = await getBranding(host);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The icon is declared in generateMetadata above — Next renders the
            <link> tags itself, so hand-written ones here would duplicate. */}
        {branding.custom_theme && (
          <style id="agc-custom-theme" dangerouslySetInnerHTML={{ __html: branding.custom_theme }} />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <BrandingProvider hasLogo={branding.has_logo} logoVersion={branding.logo_version ?? undefined}>
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
