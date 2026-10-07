import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logistics facade (#247): a phase saved, then the camp's Google Calendar
// made to match it, with one event per phase for life.
//
//  - With the database: Google is written under the id the phase claimed;
//    re-saving writes the same id again; a clear deletes it; a Google failure
//    keeps the save and says "failed"; no Google settings says
//    "not_connected" and calls nobody.
//  - Under E2E (the test store): the same steps against the store's event
//    list, so the Calendar page shows the phase exactly once however often it
//    is saved; a lead of another team and a member are refused.

import type * as LogisticsDb from "@camp404/db/logistics";
import type * as GoogleCalendar from "../google-calendar";

vi.mock("server-only", () => ({}));
const mode = vi.hoisted(() => ({ store: false }));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => mode.store }));
vi.mock("../test-mode", () => ({ usesTestStore: () => mode.store }));
vi.mock("../camp-config", async () => {
  const { testStore } = await import("../test-store");
  return { getTeamsConfig: async () => testStore.getTeamsConfig() };
});
vi.mock("@camp404/db/logistics", async (importOriginal) => ({
  ...(await importOriginal<typeof LogisticsDb>()),
  setLogisticsPhase: vi.fn(),
  clearLogisticsPhase: vi.fn(),
  listLogisticsPhases: vi.fn(async () => []),
  markLogisticsCalendarSynced: vi.fn(async () => true),
}));
vi.mock("../google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleCalendar>()),
  putCalendarEvent: vi.fn(async () => undefined),
  deleteCalendarEvent: vi.fn(async () => true),
}));

import { LOGISTICS_TEAM } from "@camp404/core";
import * as db from "@camp404/db/logistics";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import type { CampConfig } from "@camp404/db/camp-config";
import type { SetLogisticsPhaseInput, Team } from "@camp404/types";
import { deleteCalendarEvent, putCalendarEvent } from "../google-calendar";
import {
  clearLogisticsPhase,
  isLogisticsCalendarConnected,
  logisticsEventBody,
  saveLogisticsPhase,
} from "../logistics";
import { testStore } from "../test-store";

const GOOGLE_ENV = {
  // Calendar writes happen on production only (mayContactMembers).
  VERCEL_ENV: "production",
  GOOGLE_CALENDAR_ID: "camp@group.calendar.google.com",
  GOOGLE_CALENDAR_CLIENT_EMAIL: "calendar@camp-404.iam.gserviceaccount.com",
  GOOGLE_CALENDAR_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----",
};

const BUILD: SetLogisticsPhaseInput = {
  phase: "build",
  startDate: "2027-04-24",
  endDate: "2027-04-26",
  place: "On site",
  note: null,
  expectedVersion: 0,
};

function row(overrides: Partial<LogisticsPhaseRow> = {}): LogisticsPhaseRow {
  return {
    cycle: 2027,
    phase: "build",
    startDate: "2027-04-24",
    endDate: "2027-04-26",
    place: "On site",
    note: null,
    calendarEventId: "claimed0001",
    calendarSyncedVersion: null,
    version: 1,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("logisticsEventBody", () => {
  it("is an all-day whole-camp event with a plain title and no team", () => {
    const body = logisticsEventBody({
      ...row(),
      startDate: "2027-04-24",
      endDate: "2027-04-26",
      note: "Bring gloves.",
    });
    expect(body).toMatchObject({
      summary: "Build",
      location: "On site",
      start: { date: "2027-04-24" },
      // Google's end date is the day after the last.
      end: { date: "2027-04-27" },
    });
    // No team property: the app reads the event as the camp's.
    expect(body.extendedProperties).toEqual({
      private: { camp404Logistics: "build" },
    });
    expect(body.description).toContain("Bring gloves.");
  });
});

describe("with the database", () => {
  beforeEach(() => {
    mode.store = false;
    vi.clearAllMocks();
    testStore.reset();
    for (const [k, v] of Object.entries(GOOGLE_ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts the phase on Google under the id it claimed, and marks that version", async () => {
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "synced",
    });
    const claim = vi.mocked(db.setLogisticsPhase).mock.calls[0]![0];
    expect(claim).toMatchObject({ actorId: "user-1", phase: "build" });
    expect(claim.newEventId).toMatch(/^[0-9a-v]{5,}$/);
    expect(putCalendarEvent).toHaveBeenCalledWith(
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
  });

  it("writes the same event id again on a re-save", async () => {
    vi.mocked(db.setLogisticsPhase)
      .mockResolvedValueOnce({ ok: true, row: row() })
      .mockResolvedValueOnce({
        ok: true,
        row: row({ version: 2, endDate: "2027-04-27" }),
      });
    await saveLogisticsPhase("user-1", BUILD);
    await saveLogisticsPhase("user-1", { ...BUILD, expectedVersion: 1 });
    const ids = vi.mocked(putCalendarEvent).mock.calls.map((c) => c[1]);
    expect(ids).toEqual(["claimed0001", "claimed0001"]);
  });

  it("follows a newer save that landed while it was at Google", async () => {
    // This step put version 1; by the time it marks, version 2 is saved, so
    // Google may now show the older days. It makes Google match version 2.
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    vi.mocked(db.markLogisticsCalendarSynced)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.mocked(db.listLogisticsPhases).mockResolvedValueOnce([
      row({ version: 2, startDate: "2027-04-20" }),
    ]);
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "synced",
    });
    expect(db.listLogisticsPhases).toHaveBeenCalledWith(2027);
    const puts = vi.mocked(putCalendarEvent).mock.calls;
    expect(puts.map((c) => [c[1], c[2].start])).toEqual([
      ["claimed0001", { date: "2027-04-24" }],
      ["claimed0001", { date: "2027-04-20" }],
    ]);
    expect(db.markLogisticsCalendarSynced).toHaveBeenLastCalledWith({
      cycle: 2027,
      phase: "build",
      version: 2,
      removed: false,
    });
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("takes back an event it put after the days were cleared", async () => {
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    vi.mocked(db.markLogisticsCalendarSynced).mockResolvedValueOnce(false);
    vi.mocked(db.listLogisticsPhases).mockResolvedValueOnce([
      row({
        version: 3,
        startDate: null,
        endDate: null,
        calendarEventId: null,
        calendarSyncedVersion: 3,
      }),
    ]);
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "synced",
    });
    expect(deleteCalendarEvent).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      "claimed0001",
    );
    expect(putCalendarEvent).toHaveBeenCalledOnce();
  });

  it("gives up and says failed if newer saves keep landing", async () => {
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    for (const version of [2, 3, 4]) {
      vi.mocked(db.markLogisticsCalendarSynced).mockResolvedValueOnce(false);
      vi.mocked(db.listLogisticsPhases).mockResolvedValueOnce([
        row({ version }),
      ]);
    }
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "failed",
    });
    expect(putCalendarEvent).toHaveBeenCalledTimes(3);
  });

  it("keeps the save and says so when Google fails", async () => {
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    vi.mocked(putCalendarEvent).mockRejectedValueOnce(new Error("update 500"));
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "failed",
    });
    expect(db.markLogisticsCalendarSynced).not.toHaveBeenCalled();
  });

  it("deletes the event when the days are cleared, and lets go of the id", async () => {
    vi.mocked(db.clearLogisticsPhase).mockResolvedValue({
      ok: true,
      row: row({ startDate: null, endDate: null, place: null, version: 2 }),
    });
    expect(
      await clearLogisticsPhase("user-1", {
        phase: "build",
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "claimed0001",
    );
    expect(putCalendarEvent).not.toHaveBeenCalled();
    expect(db.markLogisticsCalendarSynced).toHaveBeenCalledWith({
      cycle: 2027,
      phase: "build",
      version: 2,
      removed: true,
    });
  });

  it("keeps the id when Google would not delete", async () => {
    vi.mocked(db.clearLogisticsPhase).mockResolvedValue({
      ok: true,
      row: row({ startDate: null, endDate: null, version: 2 }),
    });
    vi.mocked(deleteCalendarEvent).mockResolvedValueOnce(false);
    expect(
      await clearLogisticsPhase("user-1", {
        phase: "build",
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, calendar: "failed" });
    expect(db.markLogisticsCalendarSynced).not.toHaveBeenCalled();
  });

  it("saves in the app alone, calling nobody, when the calendar is not connected", async () => {
    vi.unstubAllEnvs();
    for (const k of Object.keys(GOOGLE_ENV)) vi.stubEnv(k, "");
    expect(isLogisticsCalendarConnected()).toBe(false);
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({ ok: true, row: row() });
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: true,
      calendar: "not_connected",
    });
    expect(putCalendarEvent).not.toHaveBeenCalled();
    expect(db.markLogisticsCalendarSynced).not.toHaveBeenCalled();
  });

  it("passes a refusal through without touching the calendar", async () => {
    vi.mocked(db.setLogisticsPhase).mockResolvedValue({
      ok: false,
      error: db.NOT_A_LOGISTICS_EDITOR,
    });
    expect(await saveLogisticsPhase("user-1", BUILD)).toEqual({
      ok: false,
      error: db.NOT_A_LOGISTICS_EDITOR,
    });
    expect(putCalendarEvent).not.toHaveBeenCalled();
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
  function lead(name: string, team: Team) {
    const user = makeUser(name);
    testStore.assignTeam({ userId: user.id, team });
    testStore.setLead({ userId: user.id, team, isLead: true });
    return user;
  }
  const soon = new Date("2027-04-01T08:00:00Z");
  const events = () =>
    testStore
      .listCalendarEvents(soon, { days: 365, max: 250 })
      .events.filter((e) => e.title === "Build");

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

  it("puts one event on the store's calendar, however often it is saved", async () => {
    const captain = makeUser("Cap", "captain");
    expect(await saveLogisticsPhase(captain.id, BUILD)).toEqual({
      ok: true,
      calendar: "synced",
    });
    expect(
      await saveLogisticsPhase(captain.id, {
        ...BUILD,
        startDate: "2027-04-23",
        expectedVersion: 1,
      }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(events()).toEqual([
      expect.objectContaining({
        title: "Build",
        start: "2027-04-23",
        location: "On site",
        // A whole-camp event: no team.
        teamTag: null,
      }),
    ]);
    const [stored] = testStore.listLogisticsPhases();
    expect(stored).toMatchObject({ version: 2, calendarSyncedVersion: 2 });
    expect(putCalendarEvent).not.toHaveBeenCalled();
  });

  it("takes the event off when the days are cleared", async () => {
    const tl = lead("Truck", LOGISTICS_TEAM as Team);
    await saveLogisticsPhase(tl.id, BUILD);
    expect(events()).toHaveLength(1);
    expect(
      await clearLogisticsPhase(tl.id, { phase: "build", expectedVersion: 1 }),
    ).toEqual({ ok: true, calendar: "synced" });
    expect(events()).toHaveLength(0);
    expect(testStore.listLogisticsPhases()[0]).toMatchObject({
      startDate: null,
      calendarEventId: null,
    });
  });

  it("refuses a lead of another team and a member, and puts nothing on the calendar", async () => {
    const kitchen = lead("Chef", "kitchen");
    const member = makeUser("Mo");
    for (const actor of [kitchen, member]) {
      expect(await saveLogisticsPhase(actor.id, BUILD)).toEqual({
        ok: false,
        error: db.NOT_A_LOGISTICS_EDITOR,
      });
    }
    expect(events()).toHaveLength(0);
    expect(testStore.listLogisticsPhases()).toEqual([]);
  });

  it("says so when someone saved first", async () => {
    const captain = makeUser("Cap", "captain");
    await saveLogisticsPhase(captain.id, BUILD);
    expect(await saveLogisticsPhase(captain.id, BUILD)).toEqual({
      ok: false,
      error: db.PHASE_CHANGED,
    });
    expect(
      await clearLogisticsPhase(captain.id, {
        phase: "build",
        expectedVersion: 7,
      }),
    ).toEqual({ ok: false, error: db.PHASE_CHANGED });
  });
});
