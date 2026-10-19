// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParticipationIntent, ParticipationStatus } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { YEAR, bothWays, outcome } from "./_agreement";

// Who is coming this year, through lib/participations.ts, on the database
// and on the E2E store: the same answers, the same captain decisions and the
// same compare-and-set refusals. What an answer does to a place is
// participationAfterIntent, and which moves a captain may make is
// isParticipationDecision, both in @camp404/core. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  decideParticipation,
  getMyParticipation,
  saveAttendanceAnswer,
} from "../participations";

const [YES, MAYBE, NO] = [
  "yes",
  "maybe",
  "no",
] as const satisfies readonly ParticipationIntent[];
const [APPLIED, ACCEPTED, WAITLISTED, NOT_ATTENDING] = [
  "applied",
  "accepted",
  "waitlisted",
  "not_attending",
] as const satisfies readonly ParticipationStatus[];

/** The member's own row, with the clocks taken out. */
async function mine(userId: string) {
  const row = await getMyParticipation(userId);
  return row && { cycle: row.cycle, status: row.status, intent: row.intent };
}

const edit = (userId: string) => ({
  version: "v1",
  editedByUserId: userId,
  changes: [
    { fieldId: "participation_intent", label: "Coming?", from: "", to: "yes" },
  ],
});

describe("who is coming: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("records a member's Yes, Maybe and No, keeps their answer apart from the status, and says when nothing changed", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const none = await mine(p.member);
      const yes = await saveAttendanceAnswer({
        userId: p.member,
        intent: YES,
        edit: edit(p.member),
      });
      const again = await saveAttendanceAnswer({
        userId: p.member,
        intent: YES,
        edit: null,
      });
      const maybe = await saveAttendanceAnswer({
        userId: p.member,
        intent: MAYBE,
        edit: null,
      });
      const afterMaybe = await mine(p.member);
      const no = await saveAttendanceAnswer({
        userId: p.other,
        intent: NO,
        edit: null,
      });
      const nobody = await outcome(() =>
        saveAttendanceAnswer({
          userId: "00000000-0000-4000-8000-000000000000",
          intent: YES,
          edit: null,
        }),
      );
      return {
        none,
        yes,
        again,
        maybe,
        afterMaybe,
        no,
        other: await mine(p.other),
        nobodyRefused: "threw" in nobody,
      };
    });
    expect(db).toMatchObject({
      none: null,
      yes: { status: APPLIED, changed: true, answerChanged: true },
      again: { changed: false, answerChanged: false },
      afterMaybe: { cycle: YEAR, intent: MAYBE },
      other: { status: NOT_ATTENDING, intent: NO },
      nobodyRefused: true,
    });
    expect(store).toEqual(db);
  });

  it("lets a captain accept or wait-list once, from the status they saw, and refuses a move that is no decision", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.participation(p.member, APPLIED);
      await seed.participation(p.other, APPLIED);
      const decide = (
        userId: string,
        from: ParticipationStatus,
        to: ParticipationStatus,
      ) =>
        outcome(() =>
          decideParticipation({
            userId,
            from,
            to,
            decidedByUserId: p.captain,
          }),
        );
      const accepted = await decide(p.member, APPLIED, ACCEPTED);
      const stale = await decide(p.member, APPLIED, WAITLISTED);
      const waitlisted = await decide(p.other, APPLIED, WAITLISTED);
      const unanswered = await decide(p.financeLead, APPLIED, ACCEPTED);
      const notADecision = await decide(p.member, ACCEPTED, NOT_ATTENDING);
      const theyAnswer = await saveAttendanceAnswer({
        userId: p.member,
        intent: MAYBE,
        edit: null,
      });
      return {
        accepted,
        stale,
        waitlisted,
        unanswered,
        notADecision,
        theyAnswer,
        member: await mine(p.member),
        other: await mine(p.other),
      };
    });
    expect(db).toMatchObject({
      accepted: { ok: true },
      stale: { ok: false },
      waitlisted: { ok: true },
      unanswered: { ok: false },
      notADecision: {
        threw:
          "Error: decideParticipation: accepted -> not_attending is not a decision",
      },
      member: { status: ACCEPTED, intent: MAYBE },
      other: { status: WAITLISTED },
    });
    expect(store).toEqual(db);
  });
});
