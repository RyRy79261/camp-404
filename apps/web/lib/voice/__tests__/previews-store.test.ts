// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLAIM_ACCOUNT_TYPES, Team } from "@camp404/types";

// Under E2E (#356: Playwright drives voice) the previews read the test store
// through the same facades as the pages (twin()), so a claim, a chapter and
// an invite code the store holds are found, and their refusals say so.

const mode = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { submitClaim } from "../../claims";
import type { McpScope } from "../../mcp/scope";
import { testStore } from "../../test-store";
import { PREVIEWS } from "../previews";
import { readNames, readRoster } from "../reads";

function scopeOf(id: string): McpScope {
  return {
    campUserId: id,
    rank: "captain",
    viewerRank: "captain",
    leadTeams: [],
    memberTeams: [],
    isDriver: false,
    isCaptain: true,
  };
}

function person(name: string, rank: "captain" | "member" = "member") {
  return testStore.createUser({
    authUserId: `auth-${name}`,
    displayName: name,
    inviteCode: "seed",
    rank,
    approvalStatus: "approved",
  }).id;
}

describe("voice previews on the test store", () => {
  beforeEach(() => {
    mode.on = true;
    testStore.reset();
  });

  it("finds a claim the store holds, and says who made it", async () => {
    const captain = person("Cap", "captain");
    const member = person("Nova");
    const made = await submitClaim({
      submitterId: member,
      cycle: 2027,
      team: Team.enum.kitchen,
      description: "Gas bottles",
      amountCents: 45_000,
      spentOn: "2027-02-10",
      accountType: CLAIM_ACCOUNT_TYPES[0],
      accountDetails: "FNB 123 456",
      files: [
        { pathname: "claim-receipts/m/1.pdf", contentType: "application/pdf" },
      ],
    });
    if (!made.ok) throw new Error(made.error);
    const ctx = { scope: scopeOf(captain), now: new Date() };

    const p = await PREVIEWS.approve_reimbursement!({ id: made.id }, ctx);
    expect(p.blocked).toBeUndefined();
    expect(p.sentence).toContain("Nova's claim");
    expect(p.sentence).toContain("Gas bottles");
    expect(p.facts).toContain("1 receipt on the page");

    const own = await PREVIEWS.reject_reimbursement!(
      { id: made.id },
      { ...ctx, scope: scopeOf(member) },
    );
    expect(own.blocked).toBe("Nobody decides their own claim.");

    const gone = await PREVIEWS.approve_reimbursement!(
      { id: "claim-404" },
      ctx,
    );
    expect(gone.blocked).toBe("That claim isn't one you can see.");
  });

  it("refuses a chapter the store does not hold, and a code already revoked", async () => {
    const captain = person("Cap", "captain");
    const ctx = { scope: scopeOf(captain), now: new Date() };

    const doc = await PREVIEWS.publish_document!(
      { slug: "no-such-chapter", published: true },
      ctx,
    );
    expect(doc.blocked).toBe("No chapter with that slug.");

    const code = testStore.seedInviteCode({ code: "spent-code" });
    code.revokedAt = new Date();
    const revoke = await PREVIEWS.revoke_invite_code!(
      { code: "SPENT-CODE" },
      ctx,
    );
    expect(revoke.blocked).toBe("That code is already revoked.");
  });

  it("reads the names voice matches from the store", async () => {
    const nova = person("Nova");
    expect((await readRoster()).map((r) => r.name)).toEqual(["Nova"]);
    expect(await readNames([nova])).toEqual(new Map([[nova, "Nova"]]));
  });
});
