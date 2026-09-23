import { beforeEach, describe, expect, it, vi } from "vitest";

// The reset route must refill the rate-limit buckets as well as the data:
// every Playwright spec comes from one address, so a per-IP bucket would
// otherwise drain across the run and a later spec would meet "Too many
// attempts" at the invite gate.

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ delete: vi.fn() })),
}));
vi.mock("@camp404/db/e2e", () => ({ resetDatabaseForE2E: vi.fn() }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: vi.fn(() => true),
  usesTestStore: vi.fn(() => true),
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("@/lib/test-store", () => ({ testStore: { reset: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ resetRateLimitsForE2E: vi.fn() }));

import { POST } from "./route";
import { isE2ETestMode, usesTestStore } from "@/lib/test-mode";
import { resetRateLimitsForE2E } from "@/lib/rate-limit";
import { resetDatabaseForE2E } from "@camp404/db/e2e";

describe("POST /api/test/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isE2ETestMode).mockReturnValue(true);
    vi.mocked(usesTestStore).mockReturnValue(true);
  });

  it("refills the rate-limit buckets in the store run", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(resetRateLimitsForE2E).toHaveBeenCalledOnce();
  });

  it("refills the rate-limit buckets in the real-database run", async () => {
    vi.mocked(usesTestStore).mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(200);
    expect(resetDatabaseForE2E).toHaveBeenCalledOnce();
    expect(resetRateLimitsForE2E).toHaveBeenCalledOnce();
  });

  it("answers 404 and resets nothing outside E2E test mode", async () => {
    vi.mocked(isE2ETestMode).mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(404);
    expect(resetRateLimitsForE2E).not.toHaveBeenCalled();
  });
});
