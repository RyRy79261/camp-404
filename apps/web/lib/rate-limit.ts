// In-memory token bucket. Per-process, no Redis — good enough for a
// single-region deployment with one Vercel function instance per route.
// If/when this app fans out across regions, swap for an Upstash-backed
// limiter with the same signature.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max requests per `windowMs`. */
  limit: number;
  /** Window length in ms. Defaults to 60_000 (1 minute). */
  windowMs?: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the bucket refills enough for one more request. */
  retryAfterSeconds: number;
}

/**
 * Reserve one token for `key`. Returns `{ok: true}` if the request is
 * allowed, otherwise `{ok: false, retryAfterSeconds}`.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const windowMs = opts.windowMs ?? 60_000;
  const refillPerMs = opts.limit / windowMs;
  const now = Date.now();
  const existing = buckets.get(key);
  const tokens = existing
    ? Math.min(opts.limit, existing.tokens + (now - existing.updatedAt) * refillPerMs)
    : opts.limit;

  if (tokens < 1) {
    const missing = 1 - tokens;
    return {
      ok: false,
      retryAfterSeconds: Math.ceil(missing / refillPerMs / 1000),
    };
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort IP extraction from a Next.js request. */
export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
