import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { testStore } from "../test-store";
import { inventoryStore } from "../test-store-inventory";
import {
  SEED_PRINTS_CAPTAINS_ONLY,
  seedPrintsExample,
} from "../test-store-prints-seed";

// The prints round's example camp in the E2E store (#249): only a captain may
// seed it, and a refused seed writes nothing at all.

function snapshot() {
  return {
    users: testStore.allUsers().length,
    phases: testStore.listLogisticsPhases().length,
    items: inventoryStore.listInventoryItems().length,
    trailers: testStore.getTransportBoard().trailers.length,
  };
}

beforeEach(() => {
  testStore.reset();
});

describe("seedPrintsExample", () => {
  it.each([
    ["a member", "member" as const],
    ["someone unknown", null],
  ])("refuses %s and changes nothing", (_who, rank) => {
    const actor = rank
      ? testStore.createUser({
          authUserId: "seed-member",
          displayName: "Mem Ber",
          inviteCode: null,
          rank,
        }).id
      : "no-such-user";
    const before = snapshot();
    expect(() => seedPrintsExample(actor)).toThrow(SEED_PRINTS_CAPTAINS_ONLY);
    expect(snapshot()).toEqual(before);
    expect(testStore.findUserByAuthId("prints-seed-0")).toBeNull();
  });

  it("fills the example camp for a captain", () => {
    const captain = testStore.createUser({
      authUserId: "seed-captain",
      displayName: "Cap Tain",
      inviteCode: null,
      rank: "captain",
    });
    seedPrintsExample(captain.id);
    expect(snapshot()).toMatchObject({ phases: 6, items: 20, trailers: 3 });
    expect(testStore.findUserByAuthId("prints-seed-0")).not.toBeNull();
  });
});
