import { describe, expect, it } from "vitest";
import {
  PARTICIPATION_INTENTS,
  PARTICIPATION_STATUSES,
  type ParticipationIntent,
  type ParticipationStatus,
} from "@camp404/types";
import {
  isParticipationDecision,
  NOT_ANSWERED_LABEL,
  PARTICIPATION_LABEL,
  participationAfterIntent,
  type ParticipationChange,
} from "../participation";

// Every (where the member stands) x (what they answered) cell, written out so
// a changed rule shows up as one named cell rather than a changed formula.
const EXPECTED: Record<
  ParticipationStatus | "none",
  Record<ParticipationIntent, ParticipationChange | null>
> = {
  none: {
    yes: { next: "applied", withdrew: false },
    maybe: { next: "maybe", withdrew: false },
    no: { next: "not_attending", withdrew: false },
  },
  applied: {
    yes: null,
    maybe: { next: "maybe", withdrew: false },
    no: { next: "not_attending", withdrew: false },
  },
  maybe: {
    yes: { next: "applied", withdrew: false },
    maybe: null,
    no: { next: "not_attending", withdrew: false },
  },
  // Yes and Maybe never lower a place a captain gave; No always wins, and
  // says it took the member off.
  accepted: {
    yes: null,
    maybe: null,
    no: { next: "not_attending", withdrew: true },
  },
  waitlisted: {
    yes: null,
    maybe: null,
    no: { next: "not_attending", withdrew: true },
  },
  not_attending: {
    yes: { next: "applied", withdrew: false },
    maybe: { next: "maybe", withdrew: false },
    no: null,
  },
};

describe("participationAfterIntent", () => {
  it("covers every status and every answer", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(
      ["none", ...PARTICIPATION_STATUSES].sort(),
    );
  });

  for (const current of ["none", ...PARTICIPATION_STATUSES] as const) {
    for (const intent of PARTICIPATION_INTENTS) {
      const expected = EXPECTED[current][intent];
      it(`${current} + ${intent} -> ${expected ? expected.next : "no change"}`, () => {
        expect(
          participationAfterIntent(current === "none" ? null : current, intent),
        ).toEqual(expected);
      });
    }
  }
});

describe("isParticipationDecision", () => {
  const ALLOWED: ReadonlyArray<[ParticipationStatus, ParticipationStatus]> = [
    ["applied", "accepted"],
    ["maybe", "accepted"],
    ["waitlisted", "accepted"],
    ["applied", "waitlisted"],
    ["maybe", "waitlisted"],
    ["accepted", "waitlisted"],
  ];

  it("allows Accept and Waiting list from Coming, Maybe or the other place", () => {
    for (const [from, to] of ALLOWED) {
      expect(isParticipationDecision(from, to), `${from} -> ${to}`).toBe(true);
    }
  });

  it("refuses every other pair", () => {
    const allowed = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`));
    const refused: string[] = [];
    for (const from of PARTICIPATION_STATUSES) {
      for (const to of PARTICIPATION_STATUSES) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(isParticipationDecision(from, to), `${from} -> ${to}`).toBe(
          false,
        );
        refused.push(`${from}>${to}`);
      }
    }
    // A member who said No has to answer again before a captain can decide;
    // and a captain never sets the member's own answers.
    expect(refused).toContain("not_attending>accepted");
    expect(refused).toContain("not_attending>waitlisted");
    expect(refused).toContain("accepted>applied");
    expect(refused).toContain("accepted>accepted");
    expect(refused).toHaveLength(25 - ALLOWED.length);
  });
});

describe("participation labels", () => {
  it("names every status in the captain's words", () => {
    expect(PARTICIPATION_LABEL).toEqual({
      applied: "Coming",
      maybe: "Maybe",
      accepted: "Accepted",
      waitlisted: "Waiting list",
      not_attending: "Not coming",
    });
    expect(NOT_ANSWERED_LABEL).toBe("Not answered");
  });
});
