import { NextRequest } from "next/server";

/**
 * Safely fetches the client's IP address.
 * Prioritizes X-Real-IP because it is overwritten by Caddy/proxies on the edge,
 * making it spoof-proof, whereas X-Forwarded-For can be easily manipulated by the client.
 */
export function getSecureIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => ip.trim());
    return ips[0] || "127.0.0.1";
  }

  return "127.0.0.1";
}
