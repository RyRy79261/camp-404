import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Env invite codes never run out and sign-up is open, so a short one lands its
// redeemer as pending; a long one keeps letting members straight in.

vi.mock("@camp404/db/invite-codes", () => ({ consumeInviteCode: vi.fn() }));
vi.mock("../test-mode", () => ({
  isE2ETestMode: vi.fn(() => false),
  usesTestStore: vi.fn(() => false),
}));
vi.mock("../test-store", () => ({ testStore: {} }));

import { consumeInviteCode } from "@camp404/db/invite-codes";
import {
  MIN_PREAPPROVED_ENV_CODE_LENGTH,
  claimInviteCode,
} from "../access-control";

const LONG = "k7q2-mzp8-wd3x-vb9n-r4tc";

describe("claimInviteCode with INVITE_CODES", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.INVITE_CODES = `camp404, ${LONG}`;
  });
  afterEach(() => {
    delete process.env.INVITE_CODES;
    vi.restoreAllMocks();
  });

  it("lets a long env code in without approval, in any case", async () => {
    expect(LONG.length).toBeGreaterThanOrEqual(MIN_PREAPPROVED_ENV_CODE_LENGTH);
    expect(await claimInviteCode(LONG.toUpperCase())).toEqual({
      code: LONG,
      assignedRank: null,
      requiresApproval: false,
    });
    expect(consumeInviteCode).not.toHaveBeenCalled();
  });

  it("lands a short env code as pending, and warns without printing it", async () => {
    expect(await claimInviteCode("CAMP404")).toEqual({
      code: "camp404",
      assignedRank: null,
      requiresApproval: true,
    });
    const warning = vi.mocked(console.warn).mock.calls[0]?.[0] as string;
    expect(warning).toContain("approval");
    expect(warning).not.toContain("camp404");
  });

  it("falls through to the database for any other code", async () => {
    vi.mocked(consumeInviteCode).mockResolvedValue(null as never);
    expect(await claimInviteCode("someone-elses-code")).toBeNull();
    expect(consumeInviteCode).toHaveBeenCalledWith("someone-elses-code");
  });
});
