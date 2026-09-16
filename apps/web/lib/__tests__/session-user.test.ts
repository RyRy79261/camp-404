import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toAuthenticatedUser } from "../session-user";
import { hasCampAccess, isApproved } from "../users";

// GOD_EMAILS bypasses the invite and approval gates. Neon Auth sign-up is open,
// so an address in that list must only count once it is verified: otherwise
// anyone could sign up with the owner's address and walk in.

const GOD = "owner@example.com";
const previous = process.env.GOD_EMAILS;

beforeEach(() => {
  process.env.GOD_EMAILS = GOD;
});
afterEach(() => {
  if (previous === undefined) delete process.env.GOD_EMAILS;
  else process.env.GOD_EMAILS = previous;
});

const noInvite = { inviteCode: null, approvalStatus: "pending" as const };

describe("toAuthenticatedUser", () => {
  it("keeps a verified god address, which passes the gates", () => {
    const user = toAuthenticatedUser({
      id: "a1",
      email: "Owner@Example.com",
      name: "Owner",
      emailVerified: true,
    });
    expect(user?.primaryEmail).toBe("Owner@Example.com");
    expect(hasCampAccess(noInvite, user!.primaryEmail)).toBe(true);
    expect(isApproved(noInvite, user!.primaryEmail)).toBe(true);
  });

  it("drops an unverified god address, so the gates hold", () => {
    for (const emailVerified of [false, null, undefined]) {
      const user = toAuthenticatedUser({
        id: "a2",
        email: GOD,
        name: "Mallory",
        emailVerified,
      });
      expect(user).toEqual({
        id: "a2",
        primaryEmail: null,
        displayName: "Mallory",
      });
      expect(hasCampAccess(noInvite, user!.primaryEmail)).toBe(false);
      expect(isApproved(noInvite, user!.primaryEmail)).toBe(false);
    }
  });

  it("passes any other address through, verified or not", () => {
    const user = toAuthenticatedUser({
      id: "a3",
      email: "ada@example.com",
      emailVerified: false,
    });
    expect(user?.primaryEmail).toBe("ada@example.com");
  });

  it("returns null without a user id", () => {
    expect(toAuthenticatedUser(null)).toBeNull();
    expect(toAuthenticatedUser({ id: "" })).toBeNull();
  });
});
