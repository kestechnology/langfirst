import { NextRequest } from 'next/server';

// Optional Upstash Redis rate limiter
let upstashRatelimit: any = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const { Ratelimit } = require('@upstash/ratelimit');
    const { Redis } = require('@upstash/redis');

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });

    upstashRatelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 s'),
      analytics: true,
    });
  } catch (err) {
    console.warn('[RateLimit] Failed to initialize Upstash Redis, using in-memory limiter:', err);
  }
}

// In-memory sliding window fallback
const inMemoryStore = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(
  req: NextRequest
): Promise<{ success: boolean; limit: number; remaining: number }> {
  // Extract client IP address from Vercel / proxy headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1';

  if (upstashRatelimit) {
    try {
      const result = await upstashRatelimit.limit(`ratelimit_${ip}`);
      return {
        success: result.success,
        limit: result.limit,
        remaining: result.remaining,
      };
    } catch (e) {
      console.warn('[RateLimit] Upstash call error, falling back to in-memory:', e);
    }
  }

  // In-memory token sliding window: 30 requests per minute
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;

  const clientRecord = inMemoryStore.get(ip);

  if (!clientRecord || now > clientRecord.resetTime) {
    inMemoryStore.set(ip, { count: 1, resetTime: now + windowMs });
    return { success: true, limit: maxRequests, remaining: maxRequests - 1 };
  }

  if (clientRecord.count >= maxRequests) {
    return { success: false, limit: maxRequests, remaining: 0 };
  }

  clientRecord.count += 1;
  return {
    success: true,
    limit: maxRequests,
    remaining: maxRequests - clientRecord.count,
  };
}

