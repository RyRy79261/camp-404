import { describe, it, expect } from "vitest";
import { mcpAccessError } from "../access";

describe("mcpAccessError", () => {
  it("allows a fully-cleared member (null)", () => {
    expect(
      mcpAccessError({
        hasCampAccess: true,
        profileComplete: true,
        isApproved: true,
      }),
    ).toBeNull();
  });

  it("blocks a user with no camp access first", () => {
    const d = mcpAccessError({
      hasCampAccess: false,
      profileComplete: false,
      isApproved: false,
    });
    expect(d?.error).toBe("no_camp_access");
  });

  it("blocks an onboarding-incomplete member", () => {
    const d = mcpAccessError({
      hasCampAccess: true,
      profileComplete: false,
      isApproved: true,
    });
    expect(d?.error).toBe("onboarding_incomplete");
  });

  it("blocks a vetting-pending member even once onboarded", () => {
    const d = mcpAccessError({
      hasCampAccess: true,
      profileComplete: true,
      isApproved: false,
    });
    expect(d?.error).toBe("pending_approval");
  });
});
