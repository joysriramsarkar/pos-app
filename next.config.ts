import type { NextConfig } from "next";

// C6: ALLOWED_ORIGINS must be set in production at runtime (not build time)
// Check is done in src/lib/env.ts at server startup, not here.
const rawOrigins = process.env.ALLOWED_ORIGINS;

const allowedOrigins = (rawOrigins ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.11"],
  async headers() {
    return [
      {
        // M12: CORS — only allow configured origins on API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: allowedOrigins[0], // primary origin; dynamic per-request needs middleware
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
