// In-memory token bucket. Per-process, no Redis — good enough for a
// single-region deployment with one Vercel function instance per route.
// If/when this app fans out across regions, swap for an Upstash-backed
// limiter with the same signature.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

// Sweep expired buckets every N calls to prevent unbounded Map growth
// under high-cardinality IP traffic.
const SWEEP_EVERY = 200;
let sweepCounter = 0;

function maybeSweep(windowMs: number): void {
  if (++sweepCounter % SWEEP_EVERY !== 0) return;
  const expiresBefore = Date.now() - windowMs;
  for (const [key, bucket] of buckets) {
    if (bucket.updatedAt < expiresBefore) buckets.delete(key);
  }
}

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
  maybeSweep(windowMs);
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

/**
 * The limiter seam. Call-sites depend on this interface rather than the concrete
 * `rateLimit` function, so a multi-region deployment can drop in an Upstash
 * adapter (same shape, async) without touching any caller. `limit` is allowed to
 * return a Promise so an async backend fits — callers `await` it. (The interface
 * + a future adapter belong in a shared package once a second implementation
 * exists; until then they live with the only implementation.)
 */
export interface RateLimiter {
  limit(
    key: string,
    opts: RateLimitOptions,
  ): RateLimitResult | Promise<RateLimitResult>;
}

/** The default in-process limiter — the in-memory token bucket above. */
export const rateLimiter: RateLimiter = { limit: rateLimit };

/** Best-effort IP extraction from a Next.js request. */
export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
