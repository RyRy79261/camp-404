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
