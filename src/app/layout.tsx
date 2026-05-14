import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { OfflineProvider } from "@/lib/offline/offline-context";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { ForcePasswordChangeDialog } from "@/components/pos/ForcePasswordChangeDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { Noto_Sans_Bengali } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoBengali = Noto_Sans_Bengali({
  variable: "--font-noto-bengali",
  subsets: ["bengali"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
  viewportFit: "cover",  // ← নতুন: নচ সহ ফুল স্ক্রিন
  interactiveWidget: "resizes-content", // Prevent virtual keyboard from overlaying fixed elements
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },  // ← নতুন
    { media: "(prefers-color-scheme: dark)", color: "#1a1a1a" },   // ← নতুন
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoBengali.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
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
