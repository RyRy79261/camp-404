import { beforeEach, describe, expect, it, vi } from "vitest";

// Meeting notes' actions (#268). What matters here:
//  1. Any approved member may ask; the rule for WHICH team they may write
//     (and who may put an action item on the board) is the data layer's,
//     tested on PGlite in packages/db. These actions must pass the signed-in
//     actor to it, never an id from the browser.
//  2. The date and time become one instant in camp time.
//  3. A calendar event is named by what the calendar says, never by the
//     browser; one the calendar no longer lists goes down with no title.
//  4. A switched-off team is refused before anything is written.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({
    teams: [{ key: "kitchen", label: "Kitchen" }],
  })),
  activeTeams: vi.fn(() => [{ key: "kitchen" }, { key: "finance" }]),
}));
vi.mock("@/lib/camp-calendar", () => ({ getUpcomingEvents: vi.fn() }));
vi.mock("@/lib/meeting-notes", () => ({
  createMeetingNote: vi.fn(async () => ({ ok: true, id: "note-1" })),
  editMeetingNote: vi.fn(async () => ({ ok: true })),
  turnActionItemIntoTask: vi.fn(async () => ({
    ok: true,
    taskId: "task-1",
    noteId: "note-1",
  })),
}));

import { getUpcomingEvents } from "@/lib/camp-calendar";
import { captainActionGate } from "@/lib/captain-gate";
import {
  createMeetingNote,
  editMeetingNote,
  turnActionItemIntoTask,
} from "@/lib/meeting-notes";
import {
  actionItemToTaskAction,
  createMeetingNoteAction,
  editMeetingNoteAction,
} from "./actions";

const INPUT = {
  team: "kitchen",
  title: "  Kitchen kickoff ",
  date: "2026-10-02",
  time: "18:30",
  calendarEventId: null,
  agenda: "- Menu",
  notes: "",
  attendeeIds: ["a", "a", "b"],
  decisions: ["Dinner at 19:00"],
  actionItems: [
    { id: null, text: "Buy the gas", assigneeId: "b", due: "2026-10-09" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id: "user-1" } as never,
    rank: "camp_member",
  });
  vi.mocked(getUpcomingEvents).mockResolvedValue({
    status: "ok",
    events: [
      {
        id: "evt-1",
        title: "Kitchen Team - Kickoff",
        start: "2026-10-02T16:30:00Z",
        allDay: false,
        location: null,
        teamTag: "kitchen",
      },
    ],
  });
});

describe("createMeetingNoteAction", () => {
  it("writes as the signed-in member, at the camp-time instant", async () => {
    const result = await createMeetingNoteAction({
      ...INPUT,
      actorId: "someone-else",
    });
    expect(result).toEqual({ ok: true, data: { id: "note-1" } });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
    expect(createMeetingNote).toHaveBeenCalledWith({
      actorId: "user-1",
      team: "kitchen",
      title: "Kitchen kickoff",
      heldAt: new Date("2026-10-02T16:30:00Z"),
      calendarEvent: null,
      agenda: "- Menu",
      notes: "",
      attendeeIds: ["a", "b"],
      decisions: ["Dinner at 19:00"],
      actionItems: [
        { id: null, text: "Buy the gas", assigneeId: "b", dueOn: "2026-10-09" },
      ],
    });
  });

  it("names a linked event by the calendar's title, without the team's prefix", async () => {
    await createMeetingNoteAction({ ...INPUT, calendarEventId: "evt-1" });
    expect(
      vi.mocked(createMeetingNote).mock.calls[0]![0].calendarEvent,
    ).toEqual({ id: "evt-1", title: "Kickoff" });
    await createMeetingNoteAction({ ...INPUT, calendarEventId: "evt-gone" });
    expect(
      vi.mocked(createMeetingNote).mock.calls[1]![0].calendarEvent,
    ).toEqual({ id: "evt-gone", title: null });
  });

  it("refuses a switched-off team, and a bad time, before writing", async () => {
    expect(
      await createMeetingNoteAction({ ...INPUT, team: "structures" }),
    ).toEqual({
      ok: false,
      error: "That team isn't active any more. Pick another team.",
    });
    expect(await createMeetingNoteAction({ ...INPUT, time: "25:00" })).toEqual({
      ok: false,
      error: "Use a time like 18:30.",
    });
    expect(createMeetingNote).not.toHaveBeenCalled();
  });

  it("passes the data layer's refusal on", async () => {
    vi.mocked(createMeetingNote).mockResolvedValueOnce({
      ok: false,
      error:
        "Only this team's members and captains can write its meeting notes.",
    });
    expect(await createMeetingNoteAction(INPUT)).toEqual({
      ok: false,
      error:
        "Only this team's members and captains can write its meeting notes.",
    });
  });

  it("refuses someone who is not signed in and approved", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Not signed in.",
    });
    expect(await createMeetingNoteAction(INPUT)).toEqual({
      ok: false,
      error: "Not signed in.",
    });
    expect(createMeetingNote).not.toHaveBeenCalled();
  });
});

describe("editMeetingNoteAction", () => {
  it("passes the note, the version it opened and the item ids", async () => {
    const { team: _team, ...rest } = INPUT;
    void _team;
    const result = await editMeetingNoteAction({
      ...rest,
      noteId: "note-1",
      version: 3,
      actionItems: [
        { id: "item-1", text: "Buy the gas", assigneeId: null, due: null },
      ],
    });
    expect(result).toEqual({ ok: true });
    expect(editMeetingNote).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "user-1",
        noteId: "note-1",
        version: 3,
        actionItems: [
          { id: "item-1", text: "Buy the gas", assigneeId: null, dueOn: null },
        ],
      }),
    );
  });
});

describe("actionItemToTaskAction", () => {
  it("acts as the signed-in member, with the camp's active teams", async () => {
    expect(await actionItemToTaskAction({ itemId: "item-1" })).toEqual({
      ok: true,
      data: { taskId: "task-1" },
    });
    expect(turnActionItemIntoTask).toHaveBeenCalledWith({
      actorId: "user-1",
      itemId: "item-1",
      activeTeams: ["kitchen", "finance"],
    });
  });
});
