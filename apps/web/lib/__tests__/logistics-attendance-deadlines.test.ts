import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Logistics attendance and the AfrikaBurn deadlines (#247 follow-up), through
// the facade.
//
//  - With the database: a dated deadline is put on Google under the id it
//    claimed, plainly titled; removing it deletes that event; the catch-up
//    rewrites a phase or deadline Google does not match yet under the SAME id
//    (the old team-titled phases, after migration 0080), and leaves matching
//    rows alone.
//  - Under E2E (the test store): a member answers for themselves, a lost race
//    and a started phase are refused; "Ask everyone" is a captain's, reaches
//    only who is coming and has not answered, and never sends a second
//    notice while the first is unread; answering everything closes it. A
//    plain member sees how many have not answered, never who; a lead sees
//    who. Only a captain keeps the deadlines.

import type * as DeadlinesDb from "@camp404/db/deadlines";
import type * as LogisticsDb from "@camp404/db/logistics";
import type * as GoogleCalendar from "../google-calendar";

vi.mock("server-only", () => ({}));
const mode = vi.hoisted(() => ({ store: false }));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => mode.store }));
vi.mock("../test-mode", () => ({ usesTestStore: () => mode.store }));
vi.mock("@camp404/db/logistics", async (importOriginal) => ({
  ...(await importOriginal<typeof LogisticsDb>()),
  listLogisticsPhases: vi.fn(async () => []),
  markLogisticsCalendarSynced: vi.fn(async () => true),
}));
vi.mock("@camp404/db/deadlines", async (importOriginal) => ({
  ...(await importOriginal<typeof DeadlinesDb>()),
  addDeadline: vi.fn(),
  removeDeadline: vi.fn(),
  listDeadlines: vi.fn(async () => []),
  markDeadlineCalendarSynced: vi.fn(async () => true),
}));
vi.mock("../google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleCalendar>()),
  putCalendarEvent: vi.fn(async () => undefined),
  deleteCalendarEvent: vi.fn(async () => true),
}));

import { ATTENDANCE_ACTION_KEY, ATTENDANCE_REF_TYPE } from "@camp404/core";
import * as deadlinesDb from "@camp404/db/deadlines";
import type { DeadlineRow } from "@camp404/db/deadlines";
import * as db from "@camp404/db/logistics";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import type { CampConfig } from "@camp404/db/camp-config";
import type { ParticipationStatus, Team } from "@camp404/types";
import { deleteCalendarEvent, putCalendarEvent } from "../google-calendar";
import {
  addDeadline,
  askForAttendance,
  catchUpCampCalendar,
  deadlineEventBody,
  editDeadline,
  getAttendanceView,
  listDeadlines,
  removeDeadline,
  saveLogisticsPhase,
  setAfrikaburnDate,
  setDeadlineDone,
  setMyAttendance,
} from "../logistics";
import { testStore } from "../test-store";
import { logisticsTestStore } from "../test-store-logistics";

const GOOGLE_ENV = {
  // Calendar writes happen on production only (mayContactMembers).
  VERCEL_ENV: "production",
  GOOGLE_CALENDAR_ID: "camp@group.calendar.google.com",
  GOOGLE_CALENDAR_CLIENT_EMAIL: "calendar@camp-404.iam.gserviceaccount.com",
  GOOGLE_CALENDAR_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----",
};

function deadline(overrides: Partial<DeadlineRow> = {}): DeadlineRow {
  return {
    id: "3f9c2a1e-8b7d-4c6e-9f10-112233445566",
    cycle: 2027,
    kind: null,
    title: "Theme camp registration closes",
    dueDate: "2027-01-15",
    note: null,
    done: false,
    skipped: false,
    calendarEventId: "deadline0001",
    calendarSyncedVersion: null,
    version: 1,
    removedAt: null,
    ...overrides,
  };
}

function phase(overrides: Partial<LogisticsPhaseRow> = {}): LogisticsPhaseRow {
  return {
    cycle: 2027,
    phase: "build",
    startDate: "2027-04-24",
    endDate: "2027-04-26",
    place: null,
    note: null,
    calendarEventId: "claimed0001",
    calendarSyncedVersion: 1,
    version: 1,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("with the database", () => {
  beforeEach(() => {
    mode.store = false;
    vi.clearAllMocks();
    for (const [k, v] of Object.entries(GOOGLE_ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts a dated deadline on Google under its claimed id, with a plain title", async () => {
    vi.mocked(deadlinesDb.addDeadline).mockResolvedValue({
      ok: true,
      row: deadline(),
    });
    expect(
      await addDeadline("user-1", {
        title: "Theme camp registration closes",
        dueDate: "2027-01-15",
        note: null,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(putCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "deadline0001",
      expect.objectContaining({
        summary: "AfrikaBurn: Theme camp registration closes",
        start: { date: "2027-01-15" },
        end: { date: "2027-01-16" },
      }),
    );
    expect(deadlinesDb.markDeadlineCalendarSynced).toHaveBeenCalledWith({
      id: deadline().id,
      version: 1,
      removed: false,
    });
  });

  it("puts nothing on Google for a deadline with no date yet", async () => {
    vi.mocked(deadlinesDb.addDeadline).mockResolvedValue({
      ok: true,
      row: deadline({ dueDate: null, calendarEventId: null }),
    });
    expect(
      await addDeadline("user-1", {
        title: "DDT sale",
        dueDate: null,
        note: null,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(putCalendarEvent).not.toHaveBeenCalled();
  });

  it("deletes the event of a removed deadline", async () => {
    vi.mocked(deadlinesDb.removeDeadline).mockResolvedValue({
      ok: true,
      row: deadline({ version: 2, removedAt: new Date() }),
    });
    expect(
      await removeDeadline("user-1", {
        id: deadline().id,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "deadline0001",
    );
    expect(putCalendarEvent).not.toHaveBeenCalled();
    expect(deadlinesDb.markDeadlineCalendarSynced).toHaveBeenCalledWith({
      id: deadline().id,
      version: 2,
      removed: true,
    });
  });

  it("the catch-up rewrites an old team-titled phase in place, under its own id", async () => {
    // Migration 0080 cleared calendar_synced_version on phases already on
    // the calendar; the catch-up puts each again with the plain title.
    vi.mocked(db.listLogisticsPhases).mockResolvedValue([
      phase({ calendarSyncedVersion: null }),
      // Already matching: left alone.
      phase({ phase: "pack", calendarEventId: "claimed0002" }),
    ]);
    vi.mocked(deadlinesDb.listDeadlines).mockResolvedValue([
      deadline({ calendarSyncedVersion: 1 }),
    ]);
    expect(await catchUpCampCalendar()).toEqual({ tried: 1, synced: 1 });
    expect(putCalendarEvent).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "claimed0001",
      expect.objectContaining({ summary: "Build" }),
    );
    expect(db.markLogisticsCalendarSynced).toHaveBeenCalledWith({
      cycle: 2027,
      phase: "build",
      version: 1,
      removed: false,
    });
    expect(deadlinesDb.listDeadlines).toHaveBeenCalledWith(undefined, {
      withRemoved: true,
    });
  });

  it("the catch-up takes off a removed deadline's event that Google kept", async () => {
    vi.mocked(db.listLogisticsPhases).mockResolvedValue([]);
    vi.mocked(deadlinesDb.listDeadlines).mockResolvedValue([
      deadline({ version: 2, removedAt: new Date(), calendarSyncedVersion: 1 }),
    ]);
    expect(await catchUpCampCalendar()).toEqual({ tried: 1, synced: 1 });
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "deadline0001",
    );
  });

  it("the catch-up calls nobody when the calendar is not connected", async () => {
    vi.unstubAllEnvs();
    for (const k of Object.keys(GOOGLE_ENV)) vi.stubEnv(k, "");
    expect(await catchUpCampCalendar()).toEqual({ tried: 0, synced: 0 });
    expect(db.listLogisticsPhases).not.toHaveBeenCalled();
    expect(putCalendarEvent).not.toHaveBeenCalled();
  });

  it("a deadline's event names no team", () => {
    const body = deadlineEventBody({ ...deadline(), dueDate: "2027-01-15" });
    expect(body.extendedProperties?.private).not.toHaveProperty("camp404Team");
  });

  it("a standard date's event is AfrikaBurn: <name>, and says what it is", () => {
    const body = deadlineEventBody({
      ...deadline({ kind: "form_2", title: "Form 2 registration" }),
      dueDate: "2027-01-15",
    });
    expect(body.summary).toBe("AfrikaBurn: Form 2 registration");
    expect(body.description).toContain(
      "Size, placement, sound, layout; art projects register here too.",
    );
  });
});

describe("under E2E (the test store)", () => {
  function makeUser(name: string, rank: "captain" | "member" = "member") {
    return testStore.createUser({
      authUserId: `auth-${name}`,
      displayName: name,
      inviteCode: "seeded",
      rank,
    });
  }
  function member(name: string, status: ParticipationStatus | null) {
    const user = makeUser(name);
    if (status) testStore.seedParticipation({ userId: user.id, status });
    return user;
  }
  function lead(name: string, team: Team) {
    const user = member(name, null);
    testStore.assignTeam({ userId: user.id, team });
    testStore.setLead({ userId: user.id, team, isLead: true });
    return user;
  }

  beforeEach(() => {
    mode.store = true;
    vi.clearAllMocks();
    testStore.reset();
    testStore.setTeamsConfig({
      ...(testStore.getTeamsConfig() as CampConfig),
      cycles: [
        { year: 2027, startedAt: "2027-01-01T00:00:00.000Z", endedAt: null },
      ],
    } as CampConfig);
  });

  const BEFORE_PACK = new Date("2027-04-01T08:00:00Z");

  it("a member answers for themselves, and a second tab's stale answer is refused", async () => {
    const dee = member("Dee", "applied");
    expect(
      logisticsTestStore.setMyAttendance({
        userId: dee.id,
        phase: "pack",
        answer: "maybe",
        expected: null,
        now: BEFORE_PACK,
      }),
    ).toEqual({ ok: true, answer: "maybe" });
    // A tab that still thinks she has not answered.
    expect(
      logisticsTestStore.setMyAttendance({
        userId: dee.id,
        phase: "pack",
        answer: "going",
        expected: null,
        now: BEFORE_PACK,
      }),
    ).toEqual({ ok: false, error: db.ATTENDANCE_CHANGED });
    expect(
      await setMyAttendance(dee.id, {
        phase: "pack",
        answer: "going",
        expected: "maybe",
      }),
    ).toEqual({ ok: true, answer: "going" });
  });

  it("refuses an answer once the phase has started", async () => {
    const captain = makeUser("Cap", "captain");
    const dee = member("Dee", "applied");
    await saveLogisticsPhase(captain.id, {
      phase: "build",
      startDate: "2027-04-24",
      endDate: "2027-04-26",
      place: null,
      note: null,
      expectedVersion: 0,
    });
    const onTheDay = new Date("2027-04-24T08:00:00Z");
    expect(
      logisticsTestStore.setMyAttendance({
        userId: dee.id,
        phase: "build",
        answer: "going",
        expected: null,
        now: onTheDay,
      }),
    ).toEqual({ ok: false, error: db.attendanceClosed("build") });
    // The day before is still open.
    expect(
      logisticsTestStore.setMyAttendance({
        userId: dee.id,
        phase: "build",
        answer: "going",
        expected: null,
        now: new Date("2027-04-23T08:00:00Z"),
      }).ok,
    ).toBe(true);
  });

  it("asks only who is coming and has not answered, with no second notice", async () => {
    const captain = makeUser("Cap", "captain");
    const yes = member("Yes", "applied");
    const accepted = member("Acc", "accepted");
    const maybe = member("Maybe", "maybe");
    const done = member("Done", "accepted");
    for (const p of ["pack", "build", "strike", "unpack"] as const) {
      logisticsTestStore.setMyAttendance({
        userId: done.id,
        phase: p,
        answer: "cant",
        expected: null,
      });
    }
    expect(await askForAttendance(captain.id)).toEqual({
      ok: true,
      asked: 2,
      notified: 2,
    });
    for (const u of [yes, accepted]) {
      expect(testStore.hasOpenNudge(u.id, ATTENDANCE_ACTION_KEY)).toBe(true);
      expect(testStore.hasUnreadNotice(u.id, ATTENDANCE_REF_TYPE)).toBe(true);
    }
    for (const u of [maybe, done]) {
      expect(testStore.hasOpenNudge(u.id, ATTENDANCE_ACTION_KEY)).toBe(false);
    }
    // Pressed again: the same two, and no second notice.
    expect(await askForAttendance(captain.id)).toEqual({
      ok: true,
      asked: 2,
      notified: 0,
    });
    // Yes answers every phase: the nudge closes and the notice is read.
    for (const p of ["pack", "build", "strike", "unpack"] as const) {
      await setMyAttendance(yes.id, {
        phase: p,
        answer: "going",
        expected: null,
      });
    }
    expect(testStore.hasOpenNudge(yes.id, ATTENDANCE_ACTION_KEY)).toBe(false);
    expect(testStore.hasUnreadNotice(yes.id, ATTENDANCE_REF_TYPE)).toBe(false);
    expect(await askForAttendance(captain.id)).toMatchObject({ asked: 1 });
  });

  it("refuses the ask from a Transport and Logistics lead and a member", async () => {
    const tl = lead("Truck", "transport_and_logistics");
    const mo = member("Mo", "applied");
    for (const actor of [tl, mo]) {
      expect(await askForAttendance(actor.id)).toEqual({
        ok: false,
        error: db.NOT_AN_ATTENDANCE_ASKER,
      });
    }
    expect(testStore.hasOpenNudge(mo.id, ATTENDANCE_ACTION_KEY)).toBe(false);
  });

  it("shows a plain member counts and answers, but not who has not answered; a lead sees who", async () => {
    const dee = member("Dee", "applied");
    member("Quiet", "accepted");
    const kit = lead("Kit", "kitchen");
    await setMyAttendance(dee.id, {
      phase: "pack",
      answer: "going",
      expected: null,
    });
    const asMember = await getAttendanceView({
      userId: dee.id,
      rank: "camp_member",
      cycle: 2027,
    });
    const pack = asMember.phases.find((p) => p.phase === "pack")!;
    expect(pack.names.going).toEqual(["Dee"]);
    expect(pack.notAnswered).toEqual([]);
    expect(asMember.notAnsweredCount.pack).toBe(1);
    expect(asMember.namesWhoHaveNotAnswered).toBe(false);
    expect(asMember.mine).toEqual({ pack: "going" });

    const asLead = await getAttendanceView({
      userId: kit.id,
      rank: "team_lead",
      cycle: 2027,
    });
    expect(asLead.phases.find((p) => p.phase === "pack")!.notAnswered).toEqual([
      "Quiet",
    ]);
    expect(asLead.namesWhoHaveNotAnswered).toBe(true);
  });

  it("only a captain keeps the deadlines; each dated one is one event, gone when removed", async () => {
    const captain = makeUser("Cap", "captain");
    const tl = lead("Truck", "transport_and_logistics");
    const mo = member("Mo", "applied");
    const input = {
      title: "Theme camp registration closes",
      dueDate: "2027-04-10",
      note: null,
    };
    for (const actor of [tl, mo]) {
      expect(await addDeadline(actor.id, input)).toEqual({
        ok: false,
        error: deadlinesDb.NOT_A_DEADLINE_KEEPER,
      });
    }
    expect(await addDeadline(captain.id, input)).toEqual({
      ok: true,
      calendar: "synced",
    });
    const [row] = await listDeadlines();
    expect(row).toMatchObject({ version: 1, calendarSyncedVersion: 1 });
    const onCalendar = () =>
      testStore
        .listCalendarEvents(BEFORE_PACK, { days: 365, max: 250 })
        .events.filter((e) => e.id === row!.calendarEventId);
    expect(onCalendar()).toEqual([
      expect.objectContaining({
        title: "AfrikaBurn: Theme camp registration closes",
        teamTag: null,
      }),
    ]);

    // A new date moves the same event; a tick keeps it.
    await editDeadline(captain.id, {
      ...input,
      dueDate: "2027-04-12",
      id: row!.id,
      expectedVersion: 1,
    });
    await setDeadlineDone(captain.id, {
      id: row!.id,
      done: true,
      expectedVersion: 2,
    });
    expect(onCalendar()).toEqual([
      expect.objectContaining({ start: "2027-04-12" }),
    ]);
    // A stale version is refused.
    expect(
      await removeDeadline(captain.id, { id: row!.id, expectedVersion: 1 }),
    ).toEqual({ ok: false, error: deadlinesDb.DEADLINE_CHANGED });
    expect(
      await removeDeadline(captain.id, { id: row!.id, expectedVersion: 3 }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(onCalendar()).toEqual([]);
    expect(await listDeadlines()).toEqual([]);
    expect(
      logisticsTestStore.listDeadlines(undefined, { withRemoved: true }),
    ).toEqual([]);
  });
  it("keeps AfrikaBurn's standard dates: a captain sets one, one per year, and no round takes it off", async () => {
    const captain = makeUser("Cap", "captain");
    const tl = lead("Truck", "transport_and_logistics");
    const closes = {
      kind: "registration_closes" as const,
      dueDate: "2027-04-10",
      note: null,
      skipped: false,
      expectedVersion: null,
    };
    expect(await setAfrikaburnDate(tl.id, closes)).toEqual({
      ok: false,
      error: deadlinesDb.NOT_A_DEADLINE_KEEPER,
    });
    expect(await setAfrikaburnDate(captain.id, closes)).toEqual({
      ok: true,
      calendar: "synced",
    });
    expect(await setAfrikaburnDate(captain.id, closes)).toEqual({
      ok: false,
      error: deadlinesDb.DATE_SET_FIRST,
    });
    const events = () =>
      testStore
        .listCalendarEvents(BEFORE_PACK, { days: 365, max: 250 })
        .events.map((e) => e.title);
    expect(events()).toEqual(["AfrikaBurn: Registration closes"]);
    const [row] = await listDeadlines();
    expect(
      await removeDeadline(captain.id, { id: row!.id, expectedVersion: 1 }),
    ).toEqual({ ok: false, error: deadlinesDb.DEADLINE_CHANGED });

    const second = {
      ...closes,
      kind: "second_ddt_round" as const,
      dueDate: "2027-04-20",
    };
    await setAfrikaburnDate(captain.id, second);
    expect(events()).toContain("AfrikaBurn: Second DDT round");
    expect(
      await setAfrikaburnDate(captain.id, {
        ...second,
        dueDate: null,
        skipped: true,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(events()).toEqual(["AfrikaBurn: Registration closes"]);
    expect(
      await setAfrikaburnDate(captain.id, {
        ...closes,
        dueDate: null,
        skipped: true,
        expectedVersion: 1,
      }),
    ).toEqual({ ok: false, error: deadlinesDb.CANNOT_SKIP_DATE });
  });
});
