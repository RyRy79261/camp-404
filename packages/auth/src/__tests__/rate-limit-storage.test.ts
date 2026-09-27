import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { buildAuthOptions } from "../config";
import { authMayServe, resolveRateLimitStorage, type AuthEnv } from "../env";

// The default e2e run has no database (the in-memory test store). Served as a
// production build, Better Auth's limiter is on, and with its counters in the
// database it logged "Failed query ... rate_limit" on every auth request. So
// that run, and only it, keeps the counters in memory. Everywhere else they
// stay in the database, shared by every serverless instance; the e2e run
// against a real database keeps them there too, as production does.

const E2E: AuthEnv = { E2E_TEST_MODE: "1" };

describe("resolveRateLimitStorage", () => {
  it("keeps the counters in the database outside the e2e harness", () => {
    expect(resolveRateLimitStorage({})).toBe("database");
    expect(resolveRateLimitStorage({ NODE_ENV: "production" })).toBe(
      "database",
    );
    // Only the exact switch counts.
    expect(resolveRateLimitStorage({ E2E_TEST_MODE: "true" })).toBe("database");
    expect(resolveRateLimitStorage({ E2E_TEST_MODE: "0" })).toBe("database");
  });

  it("keeps them in memory in the e2e run with no database, never on Vercel", () => {
    expect(resolveRateLimitStorage(E2E)).toBe("memory");
    expect(resolveRateLimitStorage({ ...E2E, E2E_DATABASE: "real" })).toBe(
      "database",
    );
    for (const VERCEL_ENV of ["production", "preview", "development"]) {
      expect([
        VERCEL_ENV,
        resolveRateLimitStorage({ ...E2E, VERCEL_ENV }),
      ]).toEqual([VERCEL_ENV, "database"]);
    }
  });

  it("changes nothing about whether auth may serve", () => {
    // The e2e switch is not a way round the fail-closed deployment rule.
    expect(authMayServe({ ...E2E, VERCEL_ENV: "production" })).toBe(false);
    expect(authMayServe({ VERCEL_ENV: "production" })).toBe(false);
    expect(authMayServe(E2E)).toBe(authMayServe({}));
  });

  it("is what the auth options use", () => {
    expect(buildAuthOptions({}).rateLimit.storage).toBe("database");
    expect(buildAuthOptions(E2E).rateLimit.storage).toBe("memory");
    expect(
      buildAuthOptions({ ...E2E, VERCEL_ENV: "preview" }).rateLimit.storage,
    ).toBe("database");
  });
});

describe("the limiter under the e2e harness", () => {
  /**
   * A Better Auth instance from our options, over an in-memory adapter whose
   * `rateLimit` table shows whether the limiter wrote to the database. The
   * limiter is switched on as a production build switches it on.
   */
  function instance(env: AuthEnv) {
    const tables: Record<string, Record<string, unknown>[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
      twoFactor: [],
      passkey: [],
    };
    const options = buildAuthOptions(env);
    const auth = betterAuth({
      ...options,
      baseURL: "http://localhost:3000",
      database: memoryAdapter(tables),
      rateLimit: { ...options.rateLimit, enabled: true, window: 60, max: 2 },
      advanced: {
        ...options.advanced,
        ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
      },
    });
    const hit = () =>
      auth.handler(
        new Request("http://localhost:3000/api/auth/ok", {
          headers: { "x-forwarded-for": "203.0.113.7" },
        }),
      );
    return { hit, tables };
  }

  it("still limits, with no database write", async () => {
    const { hit, tables } = instance(E2E);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await hit()).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect(tables.rateLimit).toEqual([]);
  });

  it("writes its counters to the database everywhere else", async () => {
    // The same instance without the switch: the control that shows the
    // assertion above can fail.
    const { hit, tables } = instance({});
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await hit()).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect(tables.rateLimit?.length ?? 0).toBeGreaterThan(0);
  });
});
