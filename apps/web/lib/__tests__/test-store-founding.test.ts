import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { logisticsTestStore } from "../test-store-logistics";
import { testStore } from "../test-store";

// The E2E twin of setFoundingYear (@camp404/db/cycle-rollover). Before it, the
// camp's year page had no twin for naming the year, so pressing it under E2E
// crashed the window and the founded state could not be shot or covered. It
// names the year once, and adopts the store's own rows written before the camp
// had a year, the way the PGlite suite says production does: a row left on the
// sentinel would vanish from every read of the year.

let serial = 0;
function makeUser() {
  serial += 1;
  return testStore.createUser({
    authUserId: `auth-f-${serial}`,
    displayName: `Member ${serial}`,
    inviteCode: "seeded",
    rank: "member",
  });
}

beforeEach(() => {
  testStore.reset();
});

describe("testStore.setFoundingYear", () => {
  it("names the year, and the store's year follows", () => {
    expect(testStore.currentCycleNumber()).toBe(UNSET_CYCLE);
    const result = testStore.setFoundingYear({ year: 2026, actorUserId: null });
    expect(result.ok).toBe(true);
    expect(testStore.currentCycleNumber()).toBe(2026);
    expect(testStore.planRollover().from?.year).toBe(2026);
  });

  it("refuses a second founding and a year that is not one", () => {
    expect(
      testStore.setFoundingYear({ year: 1899, actorUserId: null }),
    ).toEqual({ ok: false, reason: "invalid-year" });
    testStore.setFoundingYear({ year: 2026, actorUserId: null });
    expect(
      testStore.setFoundingYear({ year: 2027, actorUserId: null }),
    ).toEqual({ ok: false, reason: "already-founded" });
    expect(testStore.currentCycleNumber()).toBe(2026);
  });

  it("adopts the rows written before the camp had a year, and counts them", () => {
    const member = makeUser();
    testStore.assignTeam({ userId: member.id, team: "kitchen" });
    testStore.seedParticipation({ userId: member.id, status: "accepted" });
    const deadline = logisticsTestStore.addDeadline({
      actorId: makeCaptain(),
      title: "WAP applications close",
      dueDate: null,
      note: null,
      newEventId: "event0001",
    });
    expect(deadline.ok).toBe(true);

    const result = testStore.setFoundingYear({ year: 2026, actorUserId: null });
    if (!result.ok) throw new Error(result.reason);
    expect(result.report.teamMembershipsStamped).toBe(1);
    expect(result.report.participationsStamped).toBe(1);

    // Read in the founding year: nothing went quiet.
    expect(testStore.getTeamMemberships(member.id)).toEqual([
      { team: "kitchen", isLead: false, cycle: 2026 },
    ]);
    expect(testStore.getParticipation(member.id, 2026)?.status).toBe(
      "accepted",
    );
    expect(testStore.getParticipation(member.id, UNSET_CYCLE)).toBeNull();
    expect(logisticsTestStore.listDeadlines().map((d) => d.title)).toEqual([
      "WAP applications close",
    ]);
  });
});

function makeCaptain(): string {
  serial += 1;
  return testStore.createUser({
    authUserId: `auth-fc-${serial}`,
    displayName: `Captain ${serial}`,
    inviteCode: "seeded",
    rank: "captain",
  }).id;
}
