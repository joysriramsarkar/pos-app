import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// C6/M1: build-time config must not carry tenant/security origins.
// ALLOWED_ORIGINS is enforced at runtime (proxy.ts + api-middleware.ts +
// env.ts fail-fast) — parsing it here was dead config, now removed.
// M2: no hardcoded developer LAN IPs in the repo. Dev origins come from
// DEV_ORIGINS env (comma-separated); default is localhost-only.
const devOrigins = (process.env.DEV_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.BUNDLE_ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // standalone output — Docker build-এর জন্য; opennextjs-cloudflare নিজে bundle করে
  output: 'standalone',
  allowedDevOrigins: devOrigins,
  // Prisma/pg Node.js resolution চাই — Cloudflare Worker-এও nodejs_compat flag দিয়ে চলে
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pg-cloudflare",
  ],
  outputFileTracingIncludes: {
    "**/*": [
      "./node_modules/.prisma/client/**",
      "./node_modules/@prisma/client/**",
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

