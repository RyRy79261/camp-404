import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@camp404/db/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({ isE2ETestMode: vi.fn(() => false) }));

import { consumeRateLimit } from "@camp404/db/rate-limit";
import { isE2ETestMode } from "@/lib/test-mode";
import { rateLimit, rateLimiter } from "@/lib/rate-limit";

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

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.mocked(consumeRateLimit).mockReset();
    vi.mocked(isE2ETestMode).mockReturnValue(false);
  });

  it("returns the database's verdict, with a one-minute default window", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({
      ok: false,
      retryAfterSeconds: 12,
    });

    expect(await rateLimiter.limit("feedback:u1", { limit: 3 })).toEqual({
      ok: false,
      retryAfterSeconds: 12,
    });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: "feedback:u1",
      limit: 3,
      windowMs: 60_000,
    });
  });

  it("passes the caller's window through", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    await rateLimiter.limit("feedback-day:u1", {
      limit: 20,
      windowMs: 86_400_000,
    });
    expect(consumeRateLimit).toHaveBeenCalledWith({
      key: "feedback-day:u1",
      limit: 20,
      windowMs: 86_400_000,
    });
  });

  it("falls back to the in-memory bucket when the count cannot be stored", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue(null);
    const key = `outage-${Math.random()}`;
    expect((await rateLimiter.limit(key, { limit: 1 })).ok).toBe(true);
    expect((await rateLimiter.limit(key, { limit: 1 })).ok).toBe(false);
  });

  it("uses only the in-memory bucket in E2E test mode", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    const key = `e2e-${Math.random()}`;
    expect((await rateLimiter.limit(key, { limit: 1 })).ok).toBe(true);
    expect((await rateLimiter.limit(key, { limit: 1 })).ok).toBe(false);
    expect(consumeRateLimit).not.toHaveBeenCalled();
  });
});
