import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

const CORS_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization";

function applyCors(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get("origin") ?? "";
  if (allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
    response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
    response.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return response;
}

// C2 + H5: Rate limiter — Redis (Upstash) if configured, else in-memory fallback
const RATE_LIMIT_RULES: Record<string, { max: number; windowMs: number }> = {
  "/api/auth/callback/credentials": { max: 10, windowMs: 60_000 },
  "/api/auth/signin":               { max: 10, windowMs: 60_000 },
  "/api/auth/change-password":      { max: 5,  windowMs: 60_000 },
  "/api/auth":                      { max: 5,  windowMs: 60_000 },
};

// --- Redis path (Upstash) ---
let redisRateLimiters: Map<string, { limit: (id: string) => Promise<{ success: boolean }> }> | null = null;

async function getRedisLimiters() {
  if (redisRateLimiters) return redisRateLimiters;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const { Redis }     = await import("@upstash/redis");
  const { Ratelimit } = await import("@upstash/ratelimit");
  const redis = new Redis({ url, token });

  redisRateLimiters = new Map(
    Object.entries(RATE_LIMIT_RULES).map(([path, rule]) => [
      path,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(rule.max, `${rule.windowMs} ms`),
        prefix:  `rl:${path}`,
      }),
    ])
  );
  return redisRateLimiters;
}

// --- In-memory fallback ---
const memoryMap = new Map<string, { count: number; resetAt: number }>();

function memoryRateLimit(ip: string, pathname: string): boolean {
  const rule = RATE_LIMIT_RULES[pathname];
  if (!rule) return false;
  const key   = `${ip}:${pathname}`;
  const now   = Date.now();
  const entry = memoryMap.get(key);
  if (!entry || now > entry.resetAt) {
    memoryMap.set(key, { count: 1, resetAt: now + rule.windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > rule.max;
}

async function isRateLimited(ip: string, pathname: string): Promise<boolean> {
  if (!RATE_LIMIT_RULES[pathname]) return false;
  try {
    const limiters = await getRedisLimiters();
    if (limiters) {
      const limiter = limiters.get(pathname);
      if (limiter) {
        const { success } = await limiter.limit(ip);
        return !success;
      }
    }
  } catch {
    // Redis unavailable — fall through to in-memory
  }
  return memoryRateLimit(ip, pathname);
}

export default withAuth(
  async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
      return applyCors(request, new NextResponse(null, { status: 204 }));
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (await isRateLimited(ip, pathname)) {
      return applyCors(
        request,
        NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": "60" } }
        )
      );
    }

    return applyCors(request, NextResponse.next());
  },
  {
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|logo.svg|manifest.json).*)",
    "/api/auth/callback/credentials",
    "/api/auth/signin",
    "/api/auth/change-password",
  ],
};
