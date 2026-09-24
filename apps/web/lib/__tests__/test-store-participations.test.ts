import { beforeEach, describe, expect, it, vi } from "vitest";

// test-store.ts is server-only; neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import type { CampConfig, TeamsConfig } from "@camp404/db/camp-config";
import {
  PARTICIPATION_INTENTS,
  PARTICIPATION_STATUSES,
  type ParticipationIntent,
  type ParticipationStatus,
} from "@camp404/types";
import { testStore } from "../test-store";

// The E2E twin of @camp404/db/participations. Playwright drives the member's
// attendance form and the captain's Accept / Waiting list control through it,
// so it has to land every answer where the PGlite suite
// (packages/db/src/__tests__/participations.test.ts) says the real write does,
// and keep the same compare-and-set.

/** Tell the camp what year it is — the mirror of the PGlite suite's `foundedAt`. */
function foundedAt(year: number): void {
  const config: CampConfig = {
    ...(testStore.getTeamsConfig() as CampConfig),
    cycles: [{ year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null }],
  };
  testStore.setTeamsConfig(config satisfies TeamsConfig);
}

let serial = 0;
function makeUser(rank: "captain" | "member" = "member") {
  serial += 1;
  return testStore.createUser({
    authUserId: `auth-p-${serial}`,
    displayName: `Member ${serial}`,
    inviteCode: "seeded",
    rank,
  });
}

// The same table as the PGlite suite.
const LANDS: Record<
  ParticipationStatus,
  Record<ParticipationIntent, ParticipationStatus>
> = {
  applied: { yes: "applied", maybe: "maybe", no: "not_attending" },
  maybe: { yes: "applied", maybe: "maybe", no: "not_attending" },
  accepted: { yes: "accepted", maybe: "accepted", no: "not_attending" },
  waitlisted: { yes: "waitlisted", maybe: "waitlisted", no: "not_attending" },
  not_attending: { yes: "applied", maybe: "maybe", no: "not_attending" },
};

beforeEach(() => {
  testStore.reset();
  foundedAt(2027);
});

describe("testStore.applyParticipationIntent", () => {
  it("records a first answer as a new row", () => {
    const member = makeUser();
    expect(
      testStore.applyParticipationIntent({
        userId: member.id,
        cycle: 2027,
        intent: "maybe",
      }),
    ).toEqual({
      status: "maybe",
      changed: true,
      answerChanged: true,
      withdrew: false,
    });
    expect(testStore.getParticipation(member.id, 2027)).toMatchObject({
      status: "maybe",
      intent: "maybe",
    });
    expect(testStore.getParticipation(member.id, 2026)).toBeNull();
  });

  it("moves every status by every answer as the real write does", () => {
    for (const from of PARTICIPATION_STATUSES) {
      for (const intent of PARTICIPATION_INTENTS) {
        const member = makeUser();
        testStore.seedParticipation({ userId: member.id, status: from });
        const result = testStore.applyParticipationIntent({
          userId: member.id,
          cycle: 2027,
          intent,
        });
        const to = LANDS[from][intent];
        expect(result.status, `${from} + ${intent}`).toBe(to);
        expect(result.changed, `${from} + ${intent}`).toBe(to !== from);
        expect(result.withdrew, `${from} + ${intent}`).toBe(
          intent === "no" && (from === "accepted" || from === "waitlisted"),
        );
        expect(testStore.getParticipation(member.id, 2027)).toMatchObject({
          status: to,
          intent,
        });
      }
    }
  });

  it("keeps an accepted place on Maybe but records the Maybe, as the real write does", () => {
    const member = makeUser();
    testStore.seedParticipation({ userId: member.id, status: "accepted" });

    expect(
      testStore.applyParticipationIntent({
        userId: member.id,
        cycle: 2027,
        intent: "maybe",
      }),
    ).toEqual({
      status: "accepted",
      changed: false,
      answerChanged: true,
      withdrew: false,
    });
    // The same Maybe again is no new answer.
    expect(
      testStore.applyParticipationIntent({
        userId: member.id,
        cycle: 2027,
        intent: "maybe",
      }),
    ).toMatchObject({ changed: false, answerChanged: false });
    expect(testStore.getParticipation(member.id, 2027)).toMatchObject({
      status: "accepted",
      intent: "maybe",
    });
  });

  it("refuses a member who does not exist, as the foreign key would", () => {
    expect(() =>
      testStore.applyParticipationIntent({
        userId: "nobody",
        cycle: 2027,
        intent: "yes",
      }),
    ).toThrow(/No test user/);
  });
});

describe("testStore.decideParticipation", () => {
  it("wins once, then loses a second call made from the same status", () => {
    const captain = makeUser("captain");
    const member = makeUser();
    testStore.seedParticipation({ userId: member.id, status: "maybe" });
    const input = {
      userId: member.id,
      from: "maybe" as const,
      to: "waitlisted" as const,
      decidedByUserId: captain.id,
    };

    expect(testStore.decideParticipation(input)).toBe(true);
    expect(testStore.decideParticipation(input)).toBe(false);
    expect(testStore.getParticipation(member.id, 2027)).toMatchObject({
      status: "waitlisted",
      decidedByUserId: captain.id,
      reason: null,
    });
  });

  it("decides this year's row only", () => {
    const captain = makeUser("captain");
    const member = makeUser();
    testStore.seedParticipation({
      userId: member.id,
      status: "applied",
      cycle: 2026,
    });
    expect(
      testStore.decideParticipation({
        userId: member.id,
        from: "applied",
        to: "accepted",
        decidedByUserId: captain.id,
      }),
    ).toBe(false);
    expect(testStore.getParticipation(member.id, 2026)?.status).toBe("applied");
  });

  it("throws on a move that is not a decision", () => {
    const captain = makeUser("captain");
    const member = makeUser();
    testStore.seedParticipation({ userId: member.id, status: "not_attending" });
    expect(() =>
      testStore.decideParticipation({
        userId: member.id,
        from: "not_attending",
        to: "accepted",
        decidedByUserId: captain.id,
      }),
    ).toThrow(/not a decision/);
  });
});

describe("the store's roster carries this year's attendance", () => {
  it("shows this year's status and null for another year's", () => {
    const coming = makeUser();
    const lastYear = makeUser();
    testStore.seedParticipation({ userId: coming.id, status: "accepted" });
    testStore.seedParticipation({
      userId: lastYear.id,
      status: "waitlisted",
      cycle: 2026,
    });
    const byId = new Map(
      testStore.getCampManagementRoster().map((m) => [m.id, m.participation]),
    );
    expect(byId.get(coming.id)).toBe("accepted");
    expect(byId.get(lastYear.id)).toBeNull();
  });

  it("is emptied by reset()", () => {
    const member = makeUser();
    testStore.seedParticipation({ userId: member.id, status: "applied" });
    testStore.reset();
    expect(testStore.getParticipation(member.id, 1)).toBeNull();
    foundedAt(2027);
    expect(testStore.getParticipation(member.id, 2027)).toBeNull();
  });
});
