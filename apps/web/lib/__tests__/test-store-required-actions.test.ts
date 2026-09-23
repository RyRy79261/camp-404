import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { testStore } from "../test-store";

// The member ladder reads required actions, and the home page no longer has a
// "finished profile" fallback. So the E2E store must gate onboarding the way
// production does: a row when the member is created, done when the profile is.

const GATE = {
  actionKey: "burner_profile",
  title: "Complete your burner profile",
  version: "10",
};

describe("testStore required actions — the gate spine, mirrored", () => {
  beforeEach(() => testStore.reset());

  it("adds a pending blocking gate once, however often it is seeded", () => {
    testStore.ensureRequiredAction({ userId: "u1", ...GATE });
    testStore.ensureRequiredAction({ userId: "u1", ...GATE });

    expect(testStore.getPendingRequiredActions("u1")).toMatchObject([
      { actionKey: "burner_profile", blocking: true, status: "pending" },
    ]);
    expect(testStore.getPendingRequiredActions("u2")).toEqual([]);
  });

  it("clears the gate when it is satisfied, and only once", () => {
    testStore.ensureRequiredAction({ userId: "u1", ...GATE });

    expect(testStore.satisfyRequiredAction("u1", "burner_profile")).toBe(true);
    expect(testStore.satisfyRequiredAction("u1", "burner_profile")).toBe(false);
    expect(testStore.getPendingRequiredActions("u1")).toEqual([]);
  });

  it("forgets every gate on reset", () => {
    testStore.ensureRequiredAction({ userId: "u1", ...GATE });
    testStore.reset();
    expect(testStore.getPendingRequiredActions("u1")).toEqual([]);
  });
});

describe("testStore roster — what a member still owes", () => {
  beforeEach(() => testStore.reset());

  it("counts and names the pending gate, and drops it once satisfied", () => {
    const member = testStore.createUser({
      authUserId: "auth-owes",
      displayName: "Owes",
      inviteCode: "seeded",
      rank: "member",
    });
    testStore.ensureRequiredAction({ userId: member.id, ...GATE });

    const owing = testStore
      .getCampManagementRoster()
      .find((m) => m.id === member.id)!;
    expect(owing.pendingRequiredActions).toBe(1);
    expect(owing.pendingRequiredActionItems).toEqual([
      { key: "burner_profile", title: "Complete your burner profile" },
    ]);

    testStore.satisfyRequiredAction(member.id, "burner_profile");
    const clear = testStore
      .getCampManagementRoster()
      .find((m) => m.id === member.id)!;
    expect(clear.pendingRequiredActions).toBe(0);
    expect(clear.pendingRequiredActionItems).toEqual([]);
  });
  it("answers the member panel's detail and gate reads", () => {
    const member = testStore.createUser({
      authUserId: "auth-panel",
      displayName: "Panel",
      inviteCode: "seeded",
      rank: "member",
    });
    testStore.ensureRequiredAction({ userId: member.id, ...GATE });

    const detail = testStore.getCampMemberDetail(member.id, {
      includeEmail: true,
      includeArrival: true,
    });
    expect(detail).toMatchObject({
      id: member.id,
      displayName: "Panel",
      onboardingComplete: false,
      email: null,
      arrivalAt: null,
    });
    // Asked-for columns only, as the real read does.
    expect(Object.keys(detail!)).not.toContain("passportEncrypted");
    expect(testStore.getCampMemberDetail("nobody")).toBeNull();

    expect(testStore.listMemberQuestionnaireGates(member.id)).toMatchObject([
      { actionKey: "burner_profile", status: "pending", blocking: true },
    ]);
  });
});
