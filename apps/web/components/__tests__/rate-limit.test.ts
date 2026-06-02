import { describe, expect, it } from "vitest";
import { rateLimit, rateLimiter, type RateLimiter } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to N requests within the window", () => {
    const key = `t1-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, { limit: 5 }).ok).toBe(true);
    }
    expect(rateLimit(key, { limit: 5 }).ok).toBe(false);
  });

  it("returns retryAfterSeconds when over the limit", () => {
    const key = `t2-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(key, { limit: 3 });
    const denied = rateLimit(key, { limit: 3 });
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates keys", () => {
    const a = `t3a-${Math.random()}`;
    const b = `t3b-${Math.random()}`;
    rateLimit(a, { limit: 1 });
    expect(rateLimit(a, { limit: 1 }).ok).toBe(false);
    expect(rateLimit(b, { limit: 1 }).ok).toBe(true);
  });
});

describe("rateLimiter (default adapter)", () => {
  it("is awaitable and returns the RateLimitResult shape", async () => {
    const key = `rl1-${Math.random()}`;
    // The default adapter is synchronous, but callers await it (so an async
    // Upstash adapter is a drop-in) — awaiting a sync value resolves fine.
    expect(await rateLimiter.limit(key, { limit: 1 })).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });
  });

  it("delegates to the same in-memory bucket as rateLimit", async () => {
    const key = `rl2-${Math.random()}`;
    expect(rateLimit(key, { limit: 1 }).ok).toBe(true);
    // The interface reads the same bucket — already exhausted by rateLimit.
    expect((await rateLimiter.limit(key, { limit: 1 })).ok).toBe(false);
  });

  it("accepts a drop-in async adapter conforming to RateLimiter (Upstash path)", async () => {
    // A different impl (e.g. Upstash) satisfies the same seam — async + shape.
    const custom: RateLimiter = {
      limit: async () => ({ ok: true, retryAfterSeconds: 0 }),
    };
    const result = await custom.limit("k", { limit: 1 });
    expect(result).toEqual({ ok: true, retryAfterSeconds: 0 });
  });
});
