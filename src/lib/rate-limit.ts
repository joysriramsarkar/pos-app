import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

// Multi-replica safety: the in-memory fallback only protects ONE process. With
// several app replicas (or serverless), each replica keeps its own counters and
// the effective login limit is multiplied by the replica count.
//   RATE_LIMIT_REQUIRE_SHARED=1 → refuse to start without Upstash (strict).
//   otherwise → warn loudly once; keep the local fallback so single-replica
//   deployments (self-hosted Docker) still work.
const requireSharedLimiter = process.env.RATE_LIMIT_REQUIRE_SHARED === "1";
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (!redis && process.env.NODE_ENV === "production" && !isBuildPhase) {
  if (requireSharedLimiter) {
    throw new Error(
      "RATE_LIMIT_REQUIRE_SHARED=1 but UPSTASH_REDIS_REST_URL/TOKEN are not configured. " +
        "Login and sale rate limits would be per-process only. Configure Upstash or unset RATE_LIMIT_REQUIRE_SHARED.",
    );
  }
  console.warn(
    "[rate-limit] Upstash is not configured — falling back to a per-process memory limiter. " +
      "Run a single replica, or set UPSTASH_REDIS_REST_URL/TOKEN (and RATE_LIMIT_REQUIRE_SHARED=1) for multi-replica deployments.",
  );
}

// Brute-force rate limiters for login
// 1. IP-based limit: 10 attempts per minute
export const ipLoginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "ratelimit:login:ip",
    })
  : null;

// 2. Username-based limit: 5 attempts per minute
export const usernameLoginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      prefix: "ratelimit:login:username",
    })
  : null;

// Sales create: 60 requests / minute per user or IP (abuse / runaway offline sync)
export const salesCreateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      prefix: "ratelimit:sales:create",
    })
  : null;

// Local in-memory fallback store
const localMemoryMap = new Map<string, { count: number; resetAt: number }>();

export async function checkLocalRateLimit(key: string, limit: number, windowMs: number): Promise<{ success: boolean }> {
  const now = Date.now();

  // Lazy cleanup of expired entries (avoid top-level setInterval in Cloudflare Workers)
  if (localMemoryMap.size > 100) {
    for (const [k, val] of localMemoryMap) {
      if (now > val.resetAt) localMemoryMap.delete(k);
    }
  }

  const cached = localMemoryMap.get(key);
  
  if (!cached || now > cached.resetAt) {
    localMemoryMap.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }
  
  if (cached.count >= limit) {
    return { success: false };
  }
  
  cached.count += 1;
  return { success: true };
}

/** Prefer Upstash when configured; otherwise in-memory sliding window. */
export async function enforceRateLimit(
  key: string,
  options: {
    limit: number;
    windowMs: number;
    redisLimiter?: { limit: (id: string) => Promise<{ success: boolean }> } | null;
  }
): Promise<{ success: boolean }> {
  const { limit, windowMs, redisLimiter } = options;
  if (redisLimiter) {
    try {
      return await redisLimiter.limit(key);
    } catch {
      // fall through to memory
    }
  }
  return checkLocalRateLimit(key, limit, windowMs);
}
