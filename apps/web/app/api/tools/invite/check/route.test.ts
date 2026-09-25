import { beforeEach, describe, expect, it, vi } from "vitest";

// The availability check. Sign-up is open, so "signed in" is not "a member":
// without the camp gates, anyone could sign up and use this to test whether a
// guessed invite code exists. These pin the gate order (no lookup before the
// gates) and the lowercase normalisation.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: vi.fn() }));
vi.mock("@/lib/users", () => ({
  ensureCampUser: vi.fn(),
  hasCampAccess: vi.fn(),
  isApproved: vi.fn(),
}));
vi.mock("@camp404/db/invite-codes", () => ({ findInviteCodeByCode: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })) },
}));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => false,
  usesTestStore: () => false,
}));
vi.mock("@/lib/test-store", () => ({ testStore: {} }));

import { GET } from "./route";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { findInviteCodeByCode } from "@camp404/db/invite-codes";

function check(code: string) {
  return GET(
    new Request(
      `https://camp.test/api/tools/invite/check?code=${encodeURIComponent(code)}`,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUser).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "u@example.com",
    displayName: "U",
  } as never);
  vi.mocked(ensureCampUser).mockResolvedValue({ id: "user-1" } as never);
  vi.mocked(hasCampAccess).mockReturnValue(true);
  vi.mocked(isApproved).mockReturnValue(true);
  vi.mocked(findInviteCodeByCode).mockResolvedValue(null);
});

describe("GET /api/tools/invite/check", () => {
  it("refuses a signed-out caller", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    expect((await check("amber-fox")).status).toBe(401);
    expect(findInviteCodeByCode).not.toHaveBeenCalled();
  });

  it("refuses a signed-in account with no invite, and looks nothing up", async () => {
    vi.mocked(hasCampAccess).mockReturnValue(false);
    expect((await check("amber-fox")).status).toBe(403);
    expect(findInviteCodeByCode).not.toHaveBeenCalled();
  });

  it("refuses a pending applicant, and looks nothing up", async () => {
    vi.mocked(isApproved).mockReturnValue(false);
    expect((await check("amber-fox")).status).toBe(403);
    expect(findInviteCodeByCode).not.toHaveBeenCalled();
  });

  it("answers an approved member, reading the code in lowercase", async () => {
    vi.mocked(findInviteCodeByCode).mockResolvedValue({
      code: "amber-fox",
    } as never);
    const res = await check("  Amber-Fox ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, reason: "taken" });
    expect(findInviteCodeByCode).toHaveBeenCalledWith("amber-fox");
  });
});
