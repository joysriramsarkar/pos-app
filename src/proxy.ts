import { withAuth } from "next-auth/middleware";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// SECURITY: never sign/verify session JWTs with a hardcoded secret.
if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error(
    "NEXTAUTH_SECRET is not defined. Refusing to run middleware with an insecure default secret.",
  );
}

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
// NOTE: in-memory fallback is single-process only; production MUST configure
// Upstash (MP-35/C8). See MASTERPLAN MP-35.
const RATE_LIMIT_RULES: Record<string, { max: number; windowMs: number }> = {
  "/api/auth/callback/credentials": { max: 10, windowMs: 60_000 },
  "/api/auth/signin":               { max: 10, windowMs: 60_000 },
  "/api/auth/change-password":      { max: 5,  windowMs: 60_000 },
  "/api/auth":                      { max: 5,  windowMs: 60_000 },
  "/api/sync":                      { max: 120, windowMs: 60_000 },
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

export const proxy = withAuth(
  async function proxy(request: NextRequest) {
    try {
      const { pathname } = request.nextUrl;

      if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
        return applyCors(request, new NextResponse(null, { status: 204 }));
      }

      // MP-28: API routes must return JSON 401 — never a 307 redirect to /login.
      // withAuth would 307-redirect unauthenticated API calls to /login, whose
      // 200 text/html makes res.ok true on the client. The client then wrongly
      // marks offline sales as "saved on server" while the server got nothing.
      // NOTE: `authorized` below is forced true so this handler ALWAYS runs;
      // all auth decisions happen here (withAuth never short-circuits us).
      if (pathname.startsWith("/api/")) {
        let token: unknown = null;
        try {
          token = await getToken({
            req: request as any,
            secret: process.env.NEXTAUTH_SECRET,
          });
        } catch (e) {
          console.error("[proxy] getToken failed; treating as unauthenticated:", e);
          token = null;
        }
        if (!token) {
          return applyCors(
            request,
            NextResponse.json({ error: "Unauthorized" }, { status: 401 })
          );
        }
      } else {
        // Pages: unauthenticated users go to /login (public pages excluded).
        const isPublicPage = ["/login", "/register", "/privacy-policy", "/account-deletion", "/terms", "/contact"]
          .some((p) => pathname === p || pathname.startsWith(p + "/"));
        if (!isPublicPage) {
          let token: unknown = null;
          try {
            token = await getToken({
              req: request as any,
              secret: process.env.NEXTAUTH_SECRET,
            });
          } catch {
            token = null;
          }
          if (!token) {
            const url = request.nextUrl.clone();
            url.pathname = "/login";
            url.searchParams.set("callbackUrl", request.nextUrl.pathname);
            return applyCors(request, NextResponse.redirect(url));
          }
        }
      }

      // MP-35: trusted client IP — prefer proxy-provided headers
      // (cf-connecting-ip / x-real-ip), then the leftmost XFF entry.
      // Never blindly trust arbitrary XFF.
      const cfIp = request.headers.get("cf-connecting-ip")?.trim();
      const rawRealIp = request.headers.get("x-real-ip")?.trim();
      const rawForwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = cfIp || rawRealIp || rawForwardedFor || "unknown";

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
    } catch (e) {
      console.error("[proxy] Error:", e);
      return applyCors(request, NextResponse.next());
    }
  },
  {
    // MP-28: always run the handler — auth decisions happen inside it
    // (401 JSON for /api/*, redirect for pages). withAuth must never
    // short-circuit an API call into a 307 redirect.
    callbacks: {
      authorized: () => true,
    },
    pages: { signIn: "/login" },
    secret: process.env.NEXTAUTH_SECRET,
  }
);

export default proxy;

export const config = {
  matcher: [
    // Public: auth pages, legal/compliance pages, static assets, health check, icons, manifest
    "/((?!api/auth|api/health|login|register|privacy-policy|account-deletion|terms|contact|api/account-deletion-request|_next/static|_next/image|sw\\.js|manifest\\.json|site\\.webmanifest|favicon.*|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff2?|ttf|eot)).*)",
    "/api/auth/callback/credentials",
    "/api/auth/signin",
    "/api/auth/change-password",
  ],
};
