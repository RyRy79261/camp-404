import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

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
