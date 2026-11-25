import { NextRequest } from "next/server";

type HeaderSource =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

function readHeader(headers: HeaderSource, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get(name: string): string | null }).get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  }
  const raw = (headers as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Resolve the client IP from proxy headers.
 *
 * Order matters:
 * 1. `x-real-ip` — the header our reverse proxy (Caddy/nginx) overwrites on the
 *    edge, so a client cannot forge it. It holds ONE address; never split it.
 * 2. `x-forwarded-for` — first entry is the original client as appended by the
 *    proxy. Only trustworthy when a proxy appends to it.
 *
 * Used for login rate limiting: on a multi-replica deployment the IP is the
 * bucket key, so it must not be attacker-controlled.
 */
export function resolveClientIp(headers: HeaderSource): string {
  const realIp = readHeader(headers, "x-real-ip");
  if (realIp) return realIp.split(",")[0].trim();

  const forwardedFor = readHeader(headers, "x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  return "127.0.0.1";
}

/**
 * Safely fetches the client's IP address.
 * Prioritizes X-Real-IP because it is overwritten by Caddy/proxies on the edge,
 * making it spoof-proof, whereas X-Forwarded-For can be easily manipulated by the client.
 */
export function getSecureIp(req: NextRequest): string {
  return resolveClientIp(req.headers);
}
