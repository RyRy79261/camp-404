import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CampEventsDb from "@camp404/db/camp-events";
import type { CampEventRow } from "@camp404/db/camp-events";
import type * as LogisticsDb from "@camp404/db/logistics";
import type * as DeadlinesDb from "@camp404/db/deadlines";
import type * as GoogleCalendar from "../google-calendar";

// The Calendar's own events on the camp's Google Calendar: each one put under
// the id its row claimed (the logistics phases' mirror), titled in the camp's
// convention with its times at +02:00, on production only; a Google failure
// loses nothing (the catch-up on a later page load puts it there under the
// same id); a removed event's Google copy is deleted and then its row goes.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => false }));
vi.mock("../test-mode", () => ({ usesTestStore: () => false }));
vi.mock("../camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({
    teams: [{ key: "kitchen", label: "Kitchen", archived: false, order: 0 }],
  })),
}));
vi.mock("@camp404/db/camp-events", async (importOriginal) => ({
  ...(await importOriginal<typeof CampEventsDb>()),
  createCampEvent: vi.fn(),
  editCampEvent: vi.fn(),
  removeCampEvent: vi.fn(),
  listCampEventsToSync: vi.fn(async () => []),
  getCampEventRow: vi.fn(async () => null),
  markCampEventCalendarSynced: vi.fn(async () => true),
}));
vi.mock("@camp404/db/logistics", async (importOriginal) => ({
  ...(await importOriginal<typeof LogisticsDb>()),
  listLogisticsPhases: vi.fn(async () => []),
}));
vi.mock("@camp404/db/deadlines", async (importOriginal) => ({
  ...(await importOriginal<typeof DeadlinesDb>()),
  listDeadlines: vi.fn(async () => []),
}));
vi.mock("../google-calendar", async (importOriginal) => ({
  ...(await importOriginal<typeof GoogleCalendar>()),
  putCalendarEvent: vi.fn(async () => undefined),
  deleteCalendarEvent: vi.fn(async () => true),
}));

import * as db from "@camp404/db/camp-events";
import {
  campEventBody,
  createCampEvent,
  removeCampEvent,
} from "../camp-events";
import { deleteCalendarEvent, putCalendarEvent } from "../google-calendar";
import { catchUpCampCalendar } from "../logistics";

const GOOGLE_ENV = {
  VERCEL_ENV: "production",
  GOOGLE_CALENDAR_ID: "camp@group.calendar.google.com",
  GOOGLE_CALENDAR_CLIENT_EMAIL: "calendar@camp-404.iam.gserviceaccount.com",
  GOOGLE_CALENDAR_PRIVATE_KEY:
    "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----",
};

function row(overrides: Partial<CampEventRow> = {}): CampEventRow {
  return {
    id: "6c1f0a2e-1b2c-4d3e-8f90-aabbccddeeff",
    cycle: 2027,
    kind: "meeting",
    team: "kitchen",
    title: "Planning",
    allDay: false,
    startDate: "2026-10-15",
    endDate: "2026-10-15",
    startTime: "19:00",
    endTime: "20:30",
    place: "Online",
    description: "The week's menu.",
    calendarEventId: "claimedevent0001",
    calendarSyncedVersion: null,
    version: 1,
    removedAt: null,
    createdByUserId: "user-1",
    updatedAt: new Date(),
    ...overrides,
  };
}

const NEW = {
  kind: "meeting" as const,
  title: "Planning",
  description: "The week's menu.",
  place: "Online",
  team: "kitchen" as const,
  date: "2026-10-15",
  endDate: null,
  allDay: false,
  start: "19:00",
  end: "20:30",
  agenda: "1. Menu",
};

describe("the Calendar's events on Google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [k, v] of Object.entries(GOOGLE_ENV)) vi.stubEnv(k, v);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("puts a new meeting on Google under the id its row claimed, then marks the version", async () => {
    vi.mocked(db.createCampEvent).mockResolvedValue({
      ok: true,
      row: row(),
      noteId: "note-1",
    });
    const saved = await createCampEvent("user-1", NEW);
    expect(saved).toMatchObject({ ok: true, calendar: "synced" });
    // The id is made before the write, and handed to it to claim.
    const claimed = vi.mocked(db.createCampEvent).mock.calls[0]![0].newEventId;
    expect(claimed).toMatch(/^[0-9a-v]{5,}$/);
    expect(putCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "claimedevent0001",
      expect.objectContaining({
        summary: "Kitchen Team - Planning",
        location: "Online",
        start: {
          dateTime: "2026-10-15T19:00:00+02:00",
          timeZone: "Africa/Johannesburg",
        },
        end: {
          dateTime: "2026-10-15T20:30:00+02:00",
          timeZone: "Africa/Johannesburg",
        },
        extendedProperties: {
          private: {
            camp404Team: "kitchen",
            camp404Event: row().id,
            camp404Kind: "meeting",
          },
        },
      }),
    );
    expect(db.markCampEventCalendarSynced).toHaveBeenCalledWith({
      id: row().id,
      version: 1,
      removed: false,
    });
  });

  it("writes nothing to Google off production: the event is in the app only", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.mocked(db.createCampEvent).mockResolvedValue({
      ok: true,
      row: row(),
      noteId: null,
    });
    expect(await createCampEvent("user-1", NEW)).toMatchObject({
      ok: true,
      calendar: "not_connected",
    });
    expect(putCalendarEvent).not.toHaveBeenCalled();
    expect(db.markCampEventCalendarSynced).not.toHaveBeenCalled();
  });

  it("keeps the event when Google fails, and the catch-up puts it there under the same id", async () => {
    vi.mocked(db.createCampEvent).mockResolvedValue({
      ok: true,
      row: row(),
      noteId: null,
    });
    vi.mocked(putCalendarEvent).mockRejectedValueOnce(new Error("update 503"));
    expect(await createCampEvent("user-1", NEW)).toMatchObject({
      ok: true,
      calendar: "failed",
    });
    expect(db.markCampEventCalendarSynced).not.toHaveBeenCalled();

    vi.mocked(db.listCampEventsToSync).mockResolvedValue([row()]);
    expect(await catchUpCampCalendar()).toEqual({ tried: 1, synced: 1 });
    expect(putCalendarEvent).toHaveBeenLastCalledWith(
      expect.anything(),
      "claimedevent0001",
      expect.objectContaining({ summary: "Kitchen Team - Planning" }),
    );
    expect(db.markCampEventCalendarSynced).toHaveBeenCalledWith({
      id: row().id,
      version: 1,
      removed: false,
    });
  });

  it("puts the newer save when a newer one landed and was already synced, never deleting the event", async () => {
    vi.mocked(db.createCampEvent).mockResolvedValue({
      ok: true,
      row: row(),
      noteId: null,
    });
    // Version 1's mark misses: a save made version 2, already synced.
    vi.mocked(db.markCampEventCalendarSynced)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    vi.mocked(db.getCampEventRow).mockResolvedValue(
      row({ version: 2, calendarSyncedVersion: 2, title: "Planning, moved" }),
    );
    expect(await createCampEvent("user-1", NEW)).toMatchObject({
      ok: true,
      calendar: "synced",
    });
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
    expect(putCalendarEvent).toHaveBeenLastCalledWith(
      expect.anything(),
      "claimedevent0001",
      expect.objectContaining({ summary: "Kitchen Team - Planning, moved" }),
    );
    expect(db.markCampEventCalendarSynced).toHaveBeenLastCalledWith({
      id: row().id,
      version: 2,
      removed: false,
    });
  });

  it("deletes a removed event's Google copy and lets its row go", async () => {
    vi.mocked(db.removeCampEvent).mockResolvedValue({
      ok: true,
      row: row({ version: 2, removedAt: new Date() }),
    });
    expect(
      await removeCampEvent("user-1", {
        eventId: "claimedevent0001",
        version: 1,
      }),
    ).toMatchObject({ ok: true, calendar: "synced" });
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "claimedevent0001",
    );
    expect(putCalendarEvent).not.toHaveBeenCalled();
    expect(db.markCampEventCalendarSynced).toHaveBeenCalledWith({
      id: row().id,
      version: 2,
      removed: true,
    });
  });

  it("passes a refusal on, and touches Google not at all", async () => {
    vi.mocked(db.createCampEvent).mockResolvedValue({
      ok: false,
      error: "Whole camp events are for captains. Pick a team you lead.",
    });
    expect(await createCampEvent("user-1", { ...NEW, team: null })).toEqual({
      ok: false,
      error: "Whole camp events are for captains. Pick a team you lead.",
    });
    expect(putCalendarEvent).not.toHaveBeenCalled();
  });
});

describe("campEventBody", () => {
  it("ends an all-day event the day after its last day, and keeps a whole-camp title plain", () => {
    const body = campEventBody(
      row({
        kind: "event",
        team: null,
        title: "Test build weekend",
        allDay: true,
        startDate: "2026-10-23",
        endDate: "2026-10-25",
        startTime: null,
        endTime: null,
        place: null,
        description: null,
      }),
      null,
    );
    expect(body).toMatchObject({
      summary: "Test build weekend",
      start: { date: "2026-10-23" },
      end: { date: "2026-10-26" },
    });
    expect(body.location).toBeUndefined();
    expect(body.extendedProperties?.private.camp404Team).toBeUndefined();
    expect(body.description).toContain("Made in the Camp 404 app");
  });

  it("says a meeting's agenda and minutes are in the app, never what they say", () => {
    const body = campEventBody(row(), "Kitchen");
    expect(body.description).toContain("The week's menu.");
    expect(body.description).toContain(
      "agenda and minutes are in the Camp 404 app",
    );
  });
});
