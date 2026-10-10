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
// action item already on the task board is shown, not editable, and is still
// sent so the note keeps it in place; the meeting's title, team and time are
// the calendar event's, never fields here; and the unsaved draft is kept and
// thrown away as the other long-text editors' are.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/app/(console)/calendar/actions", () => ({
  saveMinutesAction: vi.fn(async () => ({ ok: true, data: { version: 3 } })),
}));

import { saveMinutesAction } from "@/app/(console)/calendar/actions";
import { draftStorageKey } from "@/components/os/window-storage";
import { DRAFT_OWNER, DraftWindow } from "@/tests/draft-window";
import { MinutesEditor } from "./minutes-editor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

const RETURN = "/calendar?view=month&month=2026-10&event=evt1";

function editor(inWindow = false, version: number | null = 2) {
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
            assigneeId: null,
            due: "",
            onBoard: true,
          },
        ],
      }}
      members={[{ id: "crew", displayName: "Kitchen Crew" }]}
      teamPeople={["crew"]}
      formerAttendees={[{ id: "gone", displayName: "Left Camp" }]}
    />
  );
  render(
    inWindow ? <DraftWindow windowKey="minutes:evt1">{ui}</DraftWindow> : ui,
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
    fireEvent.click(screen.getByRole("button", { name: "Save minutes" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Save minutes" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Save minutes" }));
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
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByLabelText(/^Time/)).toBeNull();
    expect(screen.queryByText("On the calendar")).toBeNull();
  });
});
