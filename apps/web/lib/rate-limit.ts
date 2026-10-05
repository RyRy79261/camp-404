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

// On globalThis, not a module binding: Next.js gives route handlers and server
// actions separate module graphs in one process, so a plain module-level Map
// is duplicated, and `/api/test/reset` would clear a copy the invite action
// never reads (the same trick as lib/test-store.ts). One process still has one
// set of buckets, as before.
const BUCKETS_KEY = "__camp404RateLimitBuckets__";
const buckets: Map<string, Bucket> = ((globalThis as Record<string, unknown>)[
  BUCKETS_KEY
] ??= new Map<string, Bucket>()) as Map<string, Bucket>;

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
 * Empties every in-memory bucket, so each Playwright spec starts with a full
 * budget. The whole run comes from one address, so an IP bucket otherwise
 * drains across specs and a later spec meets "Too many attempts". Called by
 * `/api/test/reset`; does nothing outside E2E test mode, so no deployment can
 * reset its own limits.
 */
export function resetRateLimitsForE2E(): void {
  if (!isE2ETestMode()) return;
  buckets.clear();
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
 * The address a per-address limit counts against. One IPv6 user holds a whole
 * /64 (often more), so counting single IPv6 addresses would give one person a
 * fresh bucket on each of them: IPv6 counts by its first four groups. An
 * IPv4-mapped IPv6 address counts as its IPv4 address; IPv4 counts as given.
 * The other side: people behind one carrier NAT, or one IPv6 /64, share a
 * bucket. Self-contained on purpose (no imports), so other limiters can share it.
 */
export function clientAddressKey(ip: string): string {
  const address = ip.trim().toLowerCase().split("%")[0]!; // drop a zone id
  if (!address.includes(":")) return address;
  // Expand to eight groups. A dotted IPv4 tail (::ffff:192.0.2.1) is two.
  const parts = address.split(":");
  const tail = parts.at(-1)!;
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number);
    parts.splice(
      -1,
      1,
      ((octets[0]! << 8) | octets[1]!).toString(16),
      ((octets[2]! << 8) | octets[3]!).toString(16),
    );
  }
  const joined = parts.join(":");
  const [head = "", rest] = joined.split("::");
  const front = head ? head.split(":") : [];
  const back = rest ? rest.split(":") : [];
  const groups = (
    rest === undefined
      ? front
      : [...front, ...Array(8 - front.length - back.length).fill("0"), ...back]
  ).map((g) => Number.parseInt(g || "0", 16) || 0);
  // IPv4-mapped (::ffff:a.b.c.d, in any spelling): the IPv4 address.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [hi = 0, lo = 0] = groups.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}

/**
 * Best-effort IP extraction from a Next.js request. Takes anything with
 * `get`, so a server action can pass `await headers()` (a read-only bag).
 */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
