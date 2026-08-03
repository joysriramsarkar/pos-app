import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { OfflineProvider } from "@/lib/offline/offline-context";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { ForcePasswordChangeDialog } from "@/components/pos/ForcePasswordChangeDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";

/**
 * Fonts are system stacks (see globals.css) — no Google Fonts fetch at build time.
 * This keeps `next build` working offline / behind firewalls.
 */

export const metadata: Metadata = {
  title: "Lakhan Bhandar POS - লক্ষ্মণ ভাণ্ডার",
  description: "Point of Sale system for Lakhan Bhandar grocery store. Fast billing, inventory management, and customer credit tracking.",
  keywords: ["POS", "Point of Sale", "Grocery Store", "Billing", "Inventory", "Lakhan Bhandar"],
  authors: [{ name: "জয়শ্রীরাম সরকার" }],
  icons: {
    icon: "/favicon.ico",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },
  ],
};

import { SplashScreenRemover } from "@/components/providers/SplashScreenRemover";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground" suppressHydrationWarning>
        <div
          id="splash-screen"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#ffffff',
            transition: 'opacity 0.3s ease',
          }}
        >
          <img src="/logo.svg" alt="Lakhan Bhandar" style={{ width: '80px', height: '80px' }} />
          <p style={{ marginTop: '14px', color: '#2563eb', fontWeight: 600, fontSize: '18px', fontFamily: 'sans-serif' }}>
            লক্ষ্মণ ভাণ্ডার (Lakhan Bhandar)
          </p>
          <div
            style={{
              marginTop: '18px',
              width: '28px',
              height: '28px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'splash-spin 0.8s linear infinite',
            }}
          />
          <style dangerouslySetInnerHTML={{ __html: '@keyframes splash-spin { to { transform: rotate(360deg); } }' }} />
        </div>

        <SplashScreenRemover />

        <ErrorBoundary>
          <SessionProvider>
            <OfflineProvider>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <I18nProvider>
                  {children}
                  <ForcePasswordChangeDialog />
                  <Toaster />
                </I18nProvider>
              </ThemeProvider>
            </OfflineProvider>
          </SessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}

