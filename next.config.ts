import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// C6: ALLOWED_ORIGINS must be set in production at runtime (not build time)
// Check is done in src/lib/env.ts at server startup, not here.
const rawOrigins = process.env.ALLOWED_ORIGINS;

const allowedOrigins = (rawOrigins ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.BUNDLE_ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone output — Docker build-এর জন্য; opennextjs-cloudflare নিজে bundle করে
  output: 'standalone',
  allowedDevOrigins: ["192.168.1.11"],
  // Prisma/pg Node.js resolution চাই — Cloudflare Worker-এও nodejs_compat flag দিয়ে চলে
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/pg-cloudflare/dist/**",
      "./node_modules/pg-cloudflare/esm/**",
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "date-fns",
      "date-fns-tz",
    ],
    // inlineCss disabled — oklch() / Tailwind v4 modern CSS-এর সাথে conflict করে
    inlineCss: false,
  },
  transpilePackages: [],
};

export default withBundleAnalyzer(nextConfig);

