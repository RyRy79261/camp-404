import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as GoogleCalendar from "@/lib/google-calendar";

// Adding a camp calendar event, through the action and the real facade
// (lib/camp-calendar.ts) with Google and the database stubbed. What matters:
//  1. It needs a team lead or better, and acts as the signed-in person.
//  2. A date before today's camp day, or a switched-off team, is refused
//     before Google is called.
//  3. If the audit row cannot be saved after Google took the event, the event
//     is deleted again and the author is told it was not added.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  activeTeams: vi.fn(() => [
    { key: "kitchen", label: "Kitchen" },
    { key: "finance", label: "Finance" },
  ]),
}));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: vi.fn(() => false) }));
vi.mock("@/lib/test-store", () => ({ testStore: {} }));
vi.mock("@camp404/db/calendar-events", () => ({
  NOT_AN_EVENT_AUTHOR: "Only captains and team leads can add calendar events.",
  addCampCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/google-calendar", async (importActual) => ({
  ...(await importActual<typeof GoogleCalendar>()),
  calendarConfig: vi.fn(() => ({
    calendarId: "camp",
    clientEmail: "x",
    privateKey: "y",
  })),
  createCalendarEvent: vi.fn(async () => "google-1"),
  deleteCalendarEvent: vi.fn(async () => true),
  forgetCalendarCache: vi.fn(),
}));

import { campDayKey } from "@camp404/core";
import { addCampCalendarEvent } from "@camp404/db/calendar-events";
import { revalidatePath } from "next/cache";
import { captainActionGate } from "@/lib/captain-gate";
import {
  calendarConfig,
  createCalendarEvent,
  deleteCalendarEvent,
  forgetCalendarCache,
} from "@/lib/google-calendar";
import { addCalendarEventAction } from "./actions";

const DAY_MS = 86_400_000;
const NEXT_WEEK = campDayKey(new Date(Date.now() + 7 * DAY_MS));
const YESTERDAY = campDayKey(new Date(Date.now() - DAY_MS));

const INPUT = {
  title: "  Kitchen briefing ",
  description: "Bring a torch",
  team: "kitchen",
  date: NEXT_WEEK,
  allDay: false,
  start: "18:00",
  end: "19:00",
};

/**
 * The database half as it really runs: the rule passed, Google, then audit,
 * and the event undone if the audit row fails.
 */
function databaseRuns(audit: () => void = () => {}) {
  vi.mocked(addCampCalendarEvent).mockImplementation(async (input) => {
    const eventId = await input.create();
    try {
      audit();
    } catch (error) {
      await input.undo(eventId);
      throw error;
    }
    return { ok: true, eventId };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "lead-1" } as never,
    rank: "team_lead",
  });
  databaseRuns();
});

describe("addCalendarEventAction", () => {
  it("asks for a team lead or better, and says who may add", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Only captains and team leads can add calendar events.",
    });
    expect(await addCalendarEventAction(INPUT)).toEqual({
      ok: false,
      error: "Only captains and team leads can add calendar events.",
    });
    expect(captainActionGate).toHaveBeenCalledWith(
      "team_lead",
      "Only captains and team leads can add calendar events.",
    );
    expect(addCampCalendarEvent).not.toHaveBeenCalled();
    expect(createCalendarEvent).not.toHaveBeenCalled();
  });

  it("adds as the signed-in person, with the team's name on the Google title", async () => {
    const result = await addCalendarEventAction({
      ...INPUT,
      actorId: "someone-else",
    });
    expect(result).toEqual({ ok: true, data: { eventId: "google-1" } });
    expect(vi.mocked(addCampCalendarEvent).mock.calls[0]![0]).toMatchObject({
      actorId: "lead-1",
      team: "kitchen",
      title: "Kitchen briefing",
      date: NEXT_WEEK,
      allDay: false,
    });
    const body = vi.mocked(createCalendarEvent).mock.calls[0]![1];
    expect(body).toMatchObject({
      summary: "[Kitchen] Kitchen briefing",
      description: "Bring a torch",
      start: { dateTime: `${NEXT_WEEK}T18:00:00+02:00` },
      extendedProperties: { private: { camp404Team: "kitchen" } },
    });
    expect(forgetCalendarCache).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("refuses a date before today's camp day, and takes today", async () => {
    expect(await addCalendarEventAction({ ...INPUT, date: YESTERDAY })).toEqual(
      { ok: false, error: "Pick today or a later date." },
    );
    expect(addCampCalendarEvent).not.toHaveBeenCalled();

    const today = campDayKey(new Date());
    expect((await addCalendarEventAction({ ...INPUT, date: today })).ok).toBe(
      true,
    );
  });

  it("refuses a switched-off team and a bad shape before anything is written", async () => {
    expect(
      await addCalendarEventAction({ ...INPUT, team: "structures" }),
    ).toEqual({
      ok: false,
      error: "That team isn't active any more. Pick another team.",
    });
    expect(await addCalendarEventAction({ ...INPUT, end: "17:00" })).toEqual({
      ok: false,
      error: "The event must end after it starts, on the same day.",
    });
    expect(addCampCalendarEvent).not.toHaveBeenCalled();
  });

  it("passes on the data layer's refusal", async () => {
    vi.mocked(addCampCalendarEvent).mockResolvedValue({
      ok: false,
      error: "You can add events only for a team you lead.",
    });
    expect(await addCalendarEventAction(INPUT)).toEqual({
      ok: false,
      error: "You can add events only for a team you lead.",
    });
    expect(forgetCalendarCache).not.toHaveBeenCalled();
  });

  it("deletes the Google event again when the audit row cannot be saved", async () => {
    databaseRuns(() => {
      throw new Error("audit insert failed");
    });
    expect(await addCalendarEventAction(INPUT)).toEqual({
      ok: false,
      error: "Couldn't record the event, so it wasn't added. Try again.",
    });
    expect(createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(deleteCalendarEvent).toHaveBeenCalledWith(
      expect.anything(),
      "google-1",
    );
    expect(forgetCalendarCache).not.toHaveBeenCalled();
  });

  it("says so when Google cannot be reached, with nothing to undo", async () => {
    vi.mocked(createCalendarEvent).mockRejectedValueOnce(
      new Error("create 500"),
    );
    expect(await addCalendarEventAction(INPUT)).toEqual({
      ok: false,
      error: "Couldn't reach the camp calendar. Try again.",
    });
    expect(deleteCalendarEvent).not.toHaveBeenCalled();
  });

  it("says so when the calendar is not connected, without touching the database", async () => {
    vi.mocked(calendarConfig).mockReturnValueOnce(null);
    expect(await addCalendarEventAction(INPUT)).toEqual({
      ok: false,
      error: "The camp calendar isn't connected yet.",
    });
    expect(addCampCalendarEvent).not.toHaveBeenCalled();
  });
});
