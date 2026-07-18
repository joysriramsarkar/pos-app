import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

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
