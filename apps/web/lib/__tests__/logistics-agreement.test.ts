// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANNOT_SKIP_DATE,
  DATE_SET_FIRST,
  DEADLINE_CHANGED,
  NOT_AN_AFRIKABURN_DATE,
  NOT_A_DEADLINE_KEEPER,
  PICK_THE_DATE,
} from "@camp404/db/deadlines";
import {
  ATTENDANCE_CHANGED,
  ATTENDANCE_NOT_A_MEMBER,
  NOT_AN_ATTENDANCE_ASKER,
  NOT_A_LOGISTICS_EDITOR,
  PHASE_CHANGED,
  attendanceClosed,
} from "@camp404/db/logistics";
import {
  AFRIKABURN_DATE_KINDS,
  ATTENDANCE_PHASES,
  LogisticsPhase,
  PARTICIPATION_STATUSES,
  SetLogisticsPhaseInput,
  Team,
  ViewerRank,
  type AfrikaburnDateKind,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import type * as CalendarMirror from "../calendar-mirror";
import { YEAR, bothWays } from "./_agreement";

// The logistics calendar (#247), through lib/logistics.ts, on the database
// and on the E2E store: the phases' days, who can help on them, and the
// year's AfrikaBurn dates. The same people, the same writes, the same answers
// and refusal sentences. Who may write is one rule each (LOGISTICS_EDITOR,
// ATTENDANCE_ASKER, DEADLINE_KEEPER), and the attendance and AfrikaBurn date
// checks live once in @camp404/core; this holds the rest equal. A Transport
// and Logistics lead is this domain's lead; the Finance lead is a lead of
// ANOTHER team, refused. See _agreement.ts.
//
// The camp calendar mirror is out of scope here: it is stubbed to "not
// connected" on both sides, so neither writes to Google or to the store's
// calendar, and no row is marked synced on one side only.
//
// Answers close when a phase starts, by the server's clock: each case pins
// the clock (Date only) so both sides read the same camp day.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("../calendar-mirror", async (importOriginal) => ({
  ...(await importOriginal<typeof CalendarMirror>()),
  isCampCalendarWritable: () => false,
  mirror: async () => "not_connected" as const,
}));

import { testStore } from "../test-store";
import {
  addDeadline,
  askForAttendance,
  clearLogisticsPhase,
  countAcceptedMembers,
  editDeadline,
  getAttendanceView,
  isAskedForAttendance,
  listDeadlines,
  listLogisticsPhases,
  removeDeadline,
  saveLogisticsPhase,
  setAfrikaburnDate,
  setDeadlineDone,
  setMyAttendance,
} from "../logistics";

/** Well before anything: every phase takes answers. */
const BEFORE = new Date("2027-03-01T10:00:00Z");
/** Pack's second day: Pack has started, Build has not. */
const DURING_PACK = new Date("2027-04-11T10:00:00Z");
const [APPLIED, , ACCEPTED, , NOT_ATTENDING] = PARTICIPATION_STATUSES;
const [PACK, BUILD, STRIKE, UNPACK] = ATTENDANCE_PHASES;

const days = (
  phase: LogisticsPhase,
  startDate: string,
  endDate: string,
  expectedVersion = 0,
) => ({ phase, startDate, endDate, place: null, note: null, expectedVersion });

/** A kind from the code's own list, by its key. */
const kind = (key: AfrikaburnDateKind): AfrikaburnDateKind => {
  if (!AFRIKABURN_DATE_KINDS.includes(key)) throw new Error(key);
  return key;
};

const dated = (
  k: string,
  dueDate: string | null,
  expectedVersion: number | null = null,
  skipped = false,
) => ({
  kind: k as AfrikaburnDateKind,
  dueDate,
  note: null,
  skipped,
  expectedVersion,
});

describe("the logistics calendar: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BEFORE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a captain or a Transport and Logistics lead set a phase's days, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const logisticsLead = await seed.user("Lo");
      await seed.lead(logisticsLead, Team.enum.transport_and_logistics);
      const build = LogisticsPhase.enum.build;
      const set = await saveLogisticsPhase(
        p.captain,
        days(build, "2027-04-20", "2027-04-25"),
      );
      const otherLead = await saveLogisticsPhase(
        p.financeLead,
        days(build, "2027-04-21", "2027-04-25", 1),
      );
      const member = await saveLogisticsPhase(
        p.member,
        days(build, "2027-04-21", "2027-04-25", 1),
      );
      const firstAgain = await saveLogisticsPhase(
        logisticsLead,
        days(build, "2027-04-21", "2027-04-25"),
      );
      const changed = await saveLogisticsPhase(
        logisticsLead,
        days(build, "2027-04-21", "2027-04-25", 1),
      );
      const stale = await saveLogisticsPhase(
        p.captain,
        days(build, "2027-04-22", "2027-04-25", 1),
      );
      const burn = await saveLogisticsPhase(
        p.captain,
        days(LogisticsPhase.enum.burn, "2027-04-26", "2027-05-02"),
      );
      const clearStale = await clearLogisticsPhase(p.captain, {
        phase: LogisticsPhase.enum.burn,
        expectedVersion: 2,
      });
      const clearNone = await clearLogisticsPhase(p.captain, {
        phase: LogisticsPhase.enum.strike,
        expectedVersion: 1,
      });
      const clearMember = await clearLogisticsPhase(p.member, {
        phase: LogisticsPhase.enum.burn,
        expectedVersion: 1,
      });
      const cleared = await clearLogisticsPhase(logisticsLead, {
        phase: LogisticsPhase.enum.burn,
        expectedVersion: 1,
      });
      // The last day before the first is refused at the boundary, before
      // either side's writer is called.
      const backwards = SetLogisticsPhaseInput.safeParse(
        days(build, "2027-04-25", "2027-04-20", 2),
      );
      return {
        set,
        otherLead,
        member,
        firstAgain,
        changed,
        stale,
        burn,
        clearStale,
        clearNone,
        clearMember,
        cleared,
        backwards: backwards.error?.issues.map((i) => i.message),
        phases: await listLogisticsPhases(),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    const ok = { ok: true, calendar: "not_connected" };
    expect(db).toMatchObject({
      set: ok,
      otherLead: refused(NOT_A_LOGISTICS_EDITOR),
      member: refused(NOT_A_LOGISTICS_EDITOR),
      firstAgain: refused(PHASE_CHANGED),
      changed: ok,
      stale: refused(PHASE_CHANGED),
      burn: ok,
      clearStale: refused(PHASE_CHANGED),
      clearNone: refused(PHASE_CHANGED),
      clearMember: refused(NOT_A_LOGISTICS_EDITOR),
      cleared: ok,
      backwards: ["The last day can't be before the first."],
      phases: [
        {
          cycle: YEAR,
          phase: "build",
          startDate: "2027-04-21",
          endDate: "2027-04-25",
          version: 2,
          calendarSyncedVersion: null,
        },
        {
          phase: "burn",
          startDate: null,
          endDate: null,
          version: 2,
        },
      ],
    });
    expect(store).toEqual(db);
  });

  it("lets a member who is coming answer for themselves until the phase starts, and gives a plain member the counts only", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      vi.setSystemTime(BEFORE);
      const pending = await seed.user("Late", { approval: "pending" });
      await seed.participation(p.member, ACCEPTED);
      await seed.participation(p.kitchenLead, APPLIED);
      await seed.participation(p.other, NOT_ATTENDING);
      await saveLogisticsPhase(
        p.captain,
        days(LogisticsPhase.enum.pack, "2027-04-10", "2027-04-12"),
      );
      await saveLogisticsPhase(
        p.captain,
        days(LogisticsPhase.enum.build, "2027-04-20", "2027-04-25"),
      );
      const answer = (
        userId: string,
        phase: (typeof ATTENDANCE_PHASES)[number],
        a: "going" | "maybe" | "cant",
        expected: "going" | "maybe" | "cant" | null,
      ) => setMyAttendance(userId, { phase, answer: a, expected });
      const first = await answer(p.member, PACK, "going", null);
      const twiceFirst = await answer(p.member, PACK, "maybe", null);
      const changed = await answer(p.member, PACK, "maybe", "going");
      const stale = await answer(p.member, PACK, "cant", "going");
      const notApproved = await answer(pending, PACK, "going", null);
      const askLead = await askForAttendance(p.financeLead);
      const asked = await askForAttendance(p.captain);
      const askedAgain = await askForAttendance(p.captain);
      const memberAsked = await isAskedForAttendance(p.member);
      const otherAsked = await isAskedForAttendance(p.other);
      vi.setSystemTime(DURING_PACK);
      const packClosed = await answer(p.member, PACK, "cant", "maybe");
      const build = await answer(p.member, BUILD, "cant", null);
      const strike = await answer(p.member, STRIKE, "going", null);
      const unpack = await answer(p.member, UNPACK, "maybe", null);
      const memberAskedAfter = await isAskedForAttendance(p.member);
      const leadAsked = await isAskedForAttendance(p.kitchenLead);
      const view = (userId: string, rank: ViewerRank) =>
        getAttendanceView({ userId, rank, cycle: YEAR });
      return {
        first,
        twiceFirst,
        changed,
        stale,
        notApproved,
        askLead,
        asked,
        askedAgain,
        memberAsked,
        otherAsked,
        packClosed,
        build,
        strike,
        unpack,
        memberAskedAfter,
        leadAsked,
        accepted: await countAcceptedMembers(YEAR),
        memberView: await view(p.member, ViewerRank.enum.camp_member),
        captainView: await view(p.captain, ViewerRank.enum.captain),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    const board = (names: boolean) =>
      ATTENDANCE_PHASES.map((phase) => ({
        phase,
        notAnswered: names ? ["Cook"] : [],
      }));
    expect(db).toMatchObject({
      first: { ok: true, answer: "going" },
      twiceFirst: refused(ATTENDANCE_CHANGED),
      changed: { ok: true, answer: "maybe" },
      stale: refused(ATTENDANCE_CHANGED),
      notApproved: refused(ATTENDANCE_NOT_A_MEMBER),
      askLead: refused(NOT_AN_ATTENDANCE_ASKER),
      asked: { ok: true, asked: 2, notified: 2 },
      askedAgain: { ok: true, asked: 2, notified: 0 },
      memberAsked: true,
      otherAsked: false,
      packClosed: refused(attendanceClosed(PACK)),
      build: { ok: true, answer: "cant" },
      memberAskedAfter: false,
      leadAsked: true,
      accepted: 1,
      memberView: {
        phases: board(false),
        mine: {
          pack: "maybe",
          build: "cant",
          strike: "going",
          unpack: "maybe",
        },
        namesWhoHaveNotAnswered: false,
        notAnsweredCount: { pack: 1, build: 1, strike: 1, unpack: 1 },
      },
      captainView: {
        phases: board(true),
        mine: {},
        namesWhoHaveNotAnswered: true,
      },
    });
    expect(store).toEqual(db);
  });

  it("lets only a captain set AfrikaBurn's dates by kind, with 'No round this year' for the second DDT round only", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const closes = kind("registration_closes");
      const secondRound = kind("second_ddt_round");
      const member = await setAfrikaburnDate(
        p.member,
        dated(closes, "2027-02-01"),
      );
      const otherLead = await setAfrikaburnDate(
        p.financeLead,
        dated(closes, "2027-02-01"),
      );
      const set = await setAfrikaburnDate(
        p.captain,
        dated(closes, "2027-02-01"),
      );
      const setFirst = await setAfrikaburnDate(
        p.captain,
        dated(closes, "2027-02-02"),
      );
      const changed = await setAfrikaburnDate(
        p.captain,
        dated(closes, "2027-02-03", 1),
      );
      const stale = await setAfrikaburnDate(
        p.captain,
        dated(closes, "2027-02-04", 1),
      );
      const cannotSkip = await setAfrikaburnDate(
        p.captain,
        dated(closes, null, 2, true),
      );
      const skipped = await setAfrikaburnDate(
        p.captain,
        dated(secondRound, "2027-03-01", null, true),
      );
      const noDay = await setAfrikaburnDate(
        p.captain,
        dated(kind("tickets_close"), null),
      );
      const notOne = await setAfrikaburnDate(
        p.captain,
        dated("party", "2027-02-01"),
      );
      const standardId = set.ok
        ? (await listDeadlines()).find((d) => d.kind === closes)!.id
        : "";
      const done = await setDeadlineDone(p.captain, {
        id: standardId,
        done: true,
        expectedVersion: 2,
      });
      return {
        member,
        otherLead,
        set,
        setFirst,
        changed,
        stale,
        cannotSkip,
        skipped,
        noDay,
        notOne,
        done,
        editStandard: await editDeadline(p.captain, {
          id: standardId,
          title: "Mine now",
          dueDate: null,
          note: null,
          expectedVersion: 3,
        }),
        removeStandard: await removeDeadline(p.captain, {
          id: standardId,
          expectedVersion: 3,
        }),
        deadlines: await listDeadlines(),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    const ok = { ok: true, calendar: "not_connected" };
    expect(db).toMatchObject({
      member: refused(NOT_A_DEADLINE_KEEPER),
      otherLead: refused(NOT_A_DEADLINE_KEEPER),
      set: ok,
      setFirst: refused(DATE_SET_FIRST),
      changed: ok,
      stale: refused(DEADLINE_CHANGED),
      cannotSkip: refused(CANNOT_SKIP_DATE),
      skipped: ok,
      noDay: refused(PICK_THE_DATE),
      notOne: refused(NOT_AN_AFRIKABURN_DATE),
      done: ok,
      editStandard: refused(DEADLINE_CHANGED),
      removeStandard: refused(DEADLINE_CHANGED),
      deadlines: [
        {
          kind: "registration_closes",
          title: "Registration closes",
          dueDate: "2027-02-03",
          done: true,
          skipped: false,
          version: 3,
          removedAt: null,
        },
        {
          kind: "second_ddt_round",
          dueDate: null,
          skipped: true,
          calendarEventId: null,
          version: 1,
        },
      ],
    });
    expect(store).toEqual(db);
  });

  it("lets a captain add, change and remove 'Other' dates, compare-and-set on the version", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const words = (title: string, dueDate: string | null) => ({
        title,
        dueDate,
        note: null,
      });
      const member = await addDeadline(p.member, words("Gate", "2027-03-01"));
      const dated = await addDeadline(p.captain, words("Gate", "2027-03-01"));
      const undated = await addDeadline(p.captain, words("Truck", null));
      const [gate, truck] = [...(await listDeadlines())];
      const edited = await editDeadline(p.captain, {
        id: gate!.id,
        ...words("Gate passes", "2027-03-02"),
        expectedVersion: 1,
      });
      const editStale = await editDeadline(p.captain, {
        id: gate!.id,
        ...words("Gate again", "2027-03-03"),
        expectedVersion: 1,
      });
      const editMember = await editDeadline(p.member, {
        id: gate!.id,
        ...words("Mine", null),
        expectedVersion: 2,
      });
      const editGone = await editDeadline(p.captain, {
        id: randomUUID(),
        ...words("Nobody", null),
        expectedVersion: 1,
      });
      const removeStale = await removeDeadline(p.captain, {
        id: truck!.id,
        expectedVersion: 2,
      });
      const removed = await removeDeadline(p.captain, {
        id: truck!.id,
        expectedVersion: 1,
      });
      const removeDated = await removeDeadline(p.captain, {
        id: gate!.id,
        expectedVersion: 2,
      });
      const removedAgain = await removeDeadline(p.captain, {
        id: gate!.id,
        expectedVersion: 3,
      });
      return {
        member,
        dated,
        undated,
        edited,
        editStale,
        editMember,
        editGone,
        removeStale,
        removed,
        removeDated,
        removedAgain,
        deadlines: await listDeadlines(),
      };
    });
    const refused = (error: string) => ({ ok: false, error });
    const ok = { ok: true, calendar: "not_connected" };
    expect(db).toMatchObject({
      member: refused(NOT_A_DEADLINE_KEEPER),
      dated: ok,
      undated: ok,
      edited: ok,
      editStale: refused(DEADLINE_CHANGED),
      editMember: refused(NOT_A_DEADLINE_KEEPER),
      editGone: refused(DEADLINE_CHANGED),
      removeStale: refused(DEADLINE_CHANGED),
      removed: ok,
      removeDated: ok,
      removedAgain: refused(DEADLINE_CHANGED),
      deadlines: [],
    });
    expect(store).toEqual(db);
  });
});
