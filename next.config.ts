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
