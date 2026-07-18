import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// C6: ALLOWED_ORIGINS must be set in production at runtime (not build time)
// Check is done in src/lib/env.ts at server startup, not here.
const rawOrigins = process.env.ALLOWED_ORIGINS;

const allowedOrigins = (rawOrigins ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  allowedDevOrigins: ["192.168.1.11"],
  // Prisma/pg must use Node resolution — Turbopack breaks `.prisma/client/default` otherwise,
  // which 500s /api/auth/* as HTML and surfaces next-auth CLIENT_FETCH_ERROR.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
    ],
    // inlineCss is disabled because it can break modern CSS parsing for color functions
    // such as oklch() used by Tailwind / modern UI libs.
    inlineCss: false,
  },
  transpilePackages: [],
};

export default withBundleAnalyzer(nextConfig);
