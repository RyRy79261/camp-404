import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { testStore } from "../test-store";

// The E2E backend routes decideUserApproval to this store, so Playwright only
// exercises production's compare-and-set if the mirror has one too. Without it
// the suite would keep passing while the real captain queue silently let the
// second decision overwrite the first — the defect the db fix closes.

describe("testStore.setUserApproval — the db's compare-and-set, mirrored", () => {
  beforeEach(() => testStore.reset());

  function seed() {
    const captainA = testStore.createUser({
      authUserId: "auth-cap-a",
      displayName: "Captain A",
      inviteCode: null,
      rank: "captain",
    });
    const captainB = testStore.createUser({
      authUserId: "auth-cap-b",
      displayName: "Captain B",
      inviteCode: null,
      rank: "captain",
    });
    const applicant = testStore.createUser({
      authUserId: "auth-applicant",
      displayName: "Applicant",
      inviteCode: "vetted",
      approvalStatus: "pending",
    });
    return { captainA, captainB, applicant };
  }

  it("flips a pending member and stamps the deciding captain", () => {
    const { captainA, applicant } = seed();

    expect(
      testStore.setUserApproval({
        userId: applicant.id,
        status: "approved",
        decidedByUserId: captainA.id,
      }),
    ).toBe(true);

    const row = testStore.findUserByAuthId("auth-applicant")!;
    expect(row.approvalStatus).toBe("approved");
    expect(row.approvalDecidedByUserId).toBe(captainA.id);
    expect(row.approvalDecidedAt).not.toBeNull();
  });

  it("refuses a second decision and leaves the first captain's stamp intact", () => {
    // THE REFUSED CASE, mirroring packages/db's burner-profile test: captain B
    // acting on a stale roster must change nothing and be told so.
    const { captainA, captainB, applicant } = seed();
    testStore.setUserApproval({
      userId: applicant.id,
      status: "approved",
      decidedByUserId: captainA.id,
    });
    const afterA = { ...testStore.findUserByAuthId("auth-applicant")! };

    const second = testStore.setUserApproval({
      userId: applicant.id,
      status: "rejected",
      decidedByUserId: captainB.id,
    });

    expect(second).toBe(false);
    const afterB = testStore.findUserByAuthId("auth-applicant")!;
    expect(afterB.approvalStatus).toBe("approved");
    expect(afterB.approvalDecidedByUserId).toBe(captainA.id);
    expect(afterB.approvalDecidedAt).toEqual(afterA.approvalDecidedAt);
    expect(afterB.updatedAt).toEqual(afterA.updatedAt);
  });

  it("refuses to re-decide a rejected member", () => {
    const { captainA, applicant } = seed();
    testStore.setUserApproval({
      userId: applicant.id,
      status: "rejected",
      decidedByUserId: captainA.id,
    });

    expect(
      testStore.setUserApproval({
        userId: applicant.id,
        status: "approved",
        decidedByUserId: captainA.id,
      }),
    ).toBe(false);
    expect(testStore.findUserByAuthId("auth-applicant")!.approvalStatus).toBe(
      "rejected",
    );
  });

  it("returns false for an unknown user id, changing nothing", () => {
    const { captainA, applicant } = seed();

    expect(
      testStore.setUserApproval({
        userId: "test-user-does-not-exist",
        status: "approved",
        decidedByUserId: captainA.id,
      }),
    ).toBe(false);
    expect(testStore.findUserByAuthId("auth-applicant")!.approvalStatus).toBe(
      "pending",
    );
    expect(applicant.approvalDecidedByUserId).toBeNull();
  });
});
