import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The minutes editor's own behaviour: someone on the note who is no longer an
// approved member can still be unticked, and the save leaves them off; an
// action item already on the task board is shown with how it stands, not
// editable, and is still sent so the note keeps it in place; a new one has a
// person, a team (the meeting's by default) and a deadline; Claude's
// suggestions are kept or dropped and nothing of them is sent until kept; the
// meeting's title, team and time are the calendar event's, never fields here;
// and the unsaved draft is kept and thrown away as the other long-text
// editors' are.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/(console)/calendar/actions", () => ({
  saveMinutesAction: vi.fn(async () => ({ ok: true, data: { version: 3 } })),
  suggestMeetingItemsAction: vi.fn(),
}));

import {
  saveMinutesAction,
  suggestMeetingItemsAction,
} from "@/app/(console)/calendar/actions";
import { draftStorageKey } from "@/components/os/window-storage";
import { DRAFT_OWNER, DraftWindow } from "@/tests/draft-window";
import type * as React from "react";
import { useLeaveGuard } from "@camp404/os";
import { MinutesEditor } from "./minutes-editor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const RETURN = "/calendar?view=month&month=2026-10&event=evt1";

function editor(
  inWindow = false,
  version: number | null = 2,
  around: {
    beside?: React.ReactNode;
    confirm?: (message: string) => boolean;
  } = {},
) {
  const ui = (
    <MinutesEditor
      target={{
        eventId: "evt1",
        version,
        team: "kitchen",
        teamLabel: "Kitchen",
        returnHref: RETURN,
      }}
      initial={{
        agenda: "1. Menu",
        notes: "",
        attendeeIds: ["crew", "gone"],
        decisions: [],
        actionItems: [
          {
            id: "item-1",
            text: "Buy the gas",
            assigneeId: "crew",
            team: "kitchen",
            due: "2026-10-16",
            onBoard: true,
            status: "in_progress",
          },
        ],
      }}
      members={[
        { id: "crew", displayName: "Kitchen Crew" },
        { id: "ryan", displayName: "Ryan James Noble" },
      ]}
      teamPeople={["crew"]}
      formerAttendees={[{ id: "gone", displayName: "Left Camp" }]}
      teams={[
        { value: "kitchen", label: "Kitchen" },
        { value: "finance", label: "Finance" },
      ]}
      teamLabels={{ kitchen: "Kitchen", finance: "Finance" }}
    />
  );
  render(
    inWindow ? (
      <DraftWindow windowKey="minutes:evt1" confirm={around.confirm}>
        {ui}
        {around.beside}
      </DraftWindow>
    ) : (
      ui
    ),
  );
}

describe("MinutesEditor's unsaved draft", () => {
  const KEY = draftStorageKey(DRAFT_OWNER, "minutes:evt1", "meeting");

  it("keeps it for this tab when the window goes, and restores it with Discard", () => {
    editor(true);
    fireEvent.click(screen.getByRole("button", { name: "Add decision" }));
    fireEvent.change(screen.getByLabelText("Decision 1"), {
      target: { value: "Dinner at 19:00" },
    });
    cleanup();
    expect(JSON.parse(window.sessionStorage.getItem(KEY)!)).toMatchObject({
      eventId: "evt1",
      version: 2,
      decisions: ["Dinner at 19:00"],
    });

    editor(true);
    expect(
      (screen.getByLabelText("Decision 1") as HTMLInputElement).value,
    ).toBe("Dinner at 19:00");
    expect(screen.getByText("Unsaved changes restored.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByLabelText("Decision 1")).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("throws away a draft typed over an older version of the note", () => {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        eventId: "evt1",
        version: 1,
        agenda: "Stale",
        notes: "",
        attendeeIds: [],
        decisions: ["Stale decision"],
        actionItems: [],
      }),
    );
    editor(true);
    expect(screen.queryByLabelText("Decision 1")).toBeNull();
    expect(screen.queryByText("Unsaved changes restored.")).toBeNull();
  });

  it("forgets it once the minutes are saved, and goes back to the meeting", async () => {
    editor(true);
    fireEvent.click(screen.getByRole("button", { name: "Add decision" }));
    fireEvent.change(screen.getByLabelText("Decision 1"), {
      target: { value: "Saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(RETURN));
    cleanup();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });
});

describe("MinutesEditor", () => {
  it("lets an attendee who is no longer approved be unticked, and sends the meeting and its version", async () => {
    editor();
    const box = screen.getByRole("checkbox", { name: "Left Camp" });
    expect(box.getAttribute("data-state")).toBe("checked");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(saveMinutesAction).toHaveBeenCalled());
    const sent = vi.mocked(saveMinutesAction).mock.calls[0]![0] as {
      eventId: string;
      attendeeIds: string[];
      actionItems: { id: string | null }[];
      version: number | null;
    };
    expect(sent.eventId).toBe("evt1");
    expect(sent.attendeeIds).toEqual(["crew"]);
    expect(sent.version).toBe(2);
    expect(sent.actionItems.map((i) => i.id)).toEqual(["item-1"]);
    expect(
      screen.getByText("On the task board: change it there."),
    ).toBeTruthy();
    expect(screen.queryByDisplayValue("Buy the gas")).toBeNull();
  });

  it("sends no version for a meeting's first minutes", async () => {
    editor(false, null);
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(saveMinutesAction).toHaveBeenCalled());
    expect(
      (vi.mocked(saveMinutesAction).mock.calls[0]![0] as { version: unknown })
        .version,
    ).toBeNull();
  });

  it("numbers every action item, the one already on the board too", () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    expect(screen.getByText("Action item 1")).toBeTruthy();
    expect(screen.getByLabelText("Action item 2")).toBeTruthy();
  });

  it("writes the agenda and notes in the WYSIWYG editor, never a raw textarea", () => {
    editor();
    expect(document.querySelector("textarea")).toBeNull();
    expect(
      screen.getAllByText("Preview: as members read it").length,
    ).toBeGreaterThan(0);
  });

  it("has no title, team, date or time fields: those are the event's", () => {
    editor();
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    // The only Team field is an action item's (where its task is filed).
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByLabelText(/^Time/)).toBeNull();
    expect(screen.queryByText("On the calendar")).toBeNull();
  });

  it("shows an item on the board with its person, team, deadline and column", () => {
    editor();
    expect(screen.getByText("On the board: Doing")).toBeTruthy();
    expect(screen.getByText(/Kitchen Crew · Kitchen · Due/)).toBeTruthy();
  });

  it("files a new action item under the meeting's team, and sends its team", async () => {
    editor();
    fireEvent.click(screen.getByRole("button", { name: "Add action item" }));
    fireEvent.change(screen.getByLabelText("Action item 2"), {
      target: { value: "Book the truck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(saveMinutesAction).toHaveBeenCalled());
    const sent = vi.mocked(saveMinutesAction).mock.calls[0]![0] as {
      actionItems: { id: string | null; text: string; team: string | null }[];
    };
    expect(sent.actionItems).toEqual([
      expect.objectContaining({ id: "item-1", team: "kitchen" }),
      expect.objectContaining({
        id: null,
        text: "Book the truck",
        team: "kitchen",
      }),
    ]);
  });
});

describe("MinutesEditor's Find decisions and action items", () => {
  function answer() {
    vi.mocked(suggestMeetingItemsAction).mockResolvedValue({
      ok: true,
      data: {
        decisions: [
          { text: "Camp targets 35 people" },
          { text: "No cold recruiting" },
        ],
        actionItems: [
          {
            text: "Start collecting camp fees",
            assigneeId: "ryan",
            unmatchedName: null,
            team: "finance",
            due: "2026-10-16",
            dueSaid: "next week",
          },
          {
            text: "Take on the logistics lead role",
            assigneeId: null,
            unmatchedName: "Speaker 3",
            team: null,
            due: null,
            dueSaid: null,
          },
        ],
        alreadyThere: { decisions: 0, actionItems: 1 },
      },
    });
  }

  it("asks with what the editor holds, and shows the proposals as suggestions only", async () => {
    answer();
    editor();
    fireEvent.click(
      screen.getByRole("button", { name: "Find decisions and action items" }),
    );
    await screen.findByText("Claude suggests 2 decisions and 2 action items.");
    expect(
      screen.getByText(
        "1 action item was already there. Keep what is right, below.",
      ),
    ).toBeTruthy();
    expect(vi.mocked(suggestMeetingItemsAction).mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        eventId: "evt1",
        agenda: "1. Menu",
        actionItems: ["Buy the gas"],
      }),
    );
    expect(document.querySelectorAll("[data-suggested]")).toHaveLength(4);
    // An unmatched name is a question, never a guess.
    expect(screen.getByText("The notes say “Speaker 3”")).toBeTruthy();
    expect(screen.getByText("Who is this? Pick")).toBeTruthy();

    // Nothing suggested is sent until it is kept.
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(saveMinutesAction).toHaveBeenCalled());
    const sent = vi.mocked(saveMinutesAction).mock.calls[0]![0] as {
      decisions: string[];
      actionItems: unknown[];
    };
    expect(sent.decisions).toEqual([]);
    expect(sent.actionItems).toHaveLength(1);
  });

  it("keeps one, drops one, keeps all, and sends the kept rows with their person and team", async () => {
    answer();
    editor();
    fireEvent.click(
      screen.getByRole("button", { name: "Find decisions and action items" }),
    );
    await screen.findByText("Claude suggests 2 decisions and 2 action items.");
    fireEvent.click(
      screen.getByRole("button", { name: "Keep “Camp targets 35 people”" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Drop “No cold recruiting”" }),
    );
    expect(
      (screen.getByLabelText("Decision 1") as HTMLInputElement).value,
    ).toBe("Camp targets 35 people");
    fireEvent.click(screen.getByRole("button", { name: "Keep all 2" }));
    expect(document.querySelectorAll("[data-suggested]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(saveMinutesAction).toHaveBeenCalled());
    const sent = vi.mocked(saveMinutesAction).mock.calls[0]![0] as {
      decisions: string[];
      actionItems: {
        text: string;
        assigneeId: string | null;
        team: string | null;
        due: string | null;
      }[];
    };
    expect(sent.decisions).toEqual(["Camp targets 35 people"]);
    expect(sent.actionItems.slice(1)).toEqual([
      expect.objectContaining({
        text: "Start collecting camp fees",
        assigneeId: "ryan",
        team: "finance",
        due: "2026-10-16",
      }),
      expect.objectContaining({
        text: "Take on the logistics lead role",
        assigneeId: null,
        team: null,
      }),
    ]);
  });

  it("shows the notes' words a suggested date came from", async () => {
    answer();
    editor();
    fireEvent.click(
      screen.getByRole("button", { name: "Find decisions and action items" }),
    );
    await screen.findByText("Claude suggests 2 decisions and 2 action items.");
    expect(screen.getByText("From “next week”")).toBeTruthy();
  });

  it("asks before the window goes while suggestions are on screen, and not once they are kept", async () => {
    answer();
    const guard: { leave: () => boolean } = { leave: () => true };
    function Probe() {
      const leave = useLeaveGuard();
      guard.leave = () => leave("minutes:evt1");
      return null;
    }
    const asked: string[] = [];
    editor(true, 2, {
      beside: <Probe />,
      confirm: (message) => {
        asked.push(message);
        return false;
      },
    });
    expect(guard.leave()).toBe(true);
    expect(asked).toEqual([]);

    fireEvent.click(
      screen.getByRole("button", { name: "Find decisions and action items" }),
    );
    await screen.findByText("Claude suggests 2 decisions and 2 action items.");
    expect(guard.leave()).toBe(false);
    expect(asked).toEqual([
      "Claude's suggestions are not kept yet. Leave without keeping them? They will be lost.",
    ]);

    // Dropped, they are gone on purpose: nothing left to ask about.
    for (const text of [
      "Camp targets 35 people",
      "No cold recruiting",
      "Start collecting camp fees",
      "Take on the logistics lead role",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: `Drop “${text}”` }));
    }
    expect(guard.leave()).toBe(true);
  });

  it("says Claude could not read the notes, and keeps everything typed", async () => {
    vi.mocked(suggestMeetingItemsAction).mockResolvedValue({
      ok: false,
      error: "Claude could not read the notes. Your notes are safe. Try again.",
    });
    editor();
    fireEvent.click(screen.getByRole("button", { name: "Add decision" }));
    fireEvent.change(screen.getByLabelText("Decision 1"), {
      target: { value: "Mine" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Find decisions and action items" }),
    );
    await screen.findByText(
      "Claude could not read the notes. Your notes are safe. Try again.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(
      (screen.getByLabelText("Decision 1") as HTMLInputElement).value,
    ).toBe("Mine");
  });
});
