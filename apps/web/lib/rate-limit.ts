import { consumeRateLimit } from "@camp404/db/rate-limit";
import { isE2ETestMode } from "./test-mode";

// Rate limits. `rateLimiter` counts in Postgres (@camp404/db/rate-limit), so
// every server instance shares one count and a cold start does not reset it.
// The in-memory token bucket below counts per process. It is the fallback when
// the database cannot store the count, and the limiter in E2E test mode, which
// has no database.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

const DEFAULT_WINDOW_MS = 60_000;

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
  /** Seconds until one more request is allowed. 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * Reserve one token for `key`. Returns `{ok: true}` if the request is
 * allowed, otherwise `{ok: false, retryAfterSeconds}`.
 */
export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  maybeSweep(windowMs);
  const refillPerMs = opts.limit / windowMs;
  const now = Date.now();
  const existing = buckets.get(key);
  const tokens = existing
    ? Math.min(
        opts.limit,
        existing.tokens + (now - existing.updatedAt) * refillPerMs,
      )
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
 * The limiter seam. Call sites depend on this interface, not on a concrete
 * limiter, and always `await` it.
 */
export interface RateLimiter {
  limit(
    key: string,
    opts: RateLimitOptions,
  ): RateLimitResult | Promise<RateLimitResult>;
}

/**
 * The shared limiter: a fixed window counted in Postgres. When the count
 * cannot be stored, the in-memory bucket decides, so a database outage still
 * limits each instance rather than letting everything through.
 */
export const rateLimiter: RateLimiter = {
  async limit(key, opts) {
    if (isE2ETestMode()) return rateLimit(key, opts);
    const verdict = await consumeRateLimit({
      key,
      limit: opts.limit,
      windowMs: opts.windowMs ?? DEFAULT_WINDOW_MS,
    });
    return verdict ?? rateLimit(key, opts);
  },
};

/**
 * Best-effort IP extraction from a Next.js request. Takes anything with
 * `get`, so a server action can pass `await headers()` (a read-only bag).
 */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
