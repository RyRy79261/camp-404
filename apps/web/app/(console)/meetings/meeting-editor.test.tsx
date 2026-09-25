import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The editor's own behaviour: someone on the note who is no longer an
// approved member can still be unticked, and the save leaves them off; an
// action item already on the task board is shown, not editable, and is still
// sent so the note keeps it in place.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({
  createMeetingNoteAction: vi.fn(),
  editMeetingNoteAction: vi.fn(async () => ({ ok: true })),
}));

import { editMeetingNoteAction } from "./actions";
import { MeetingEditor } from "./meeting-editor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function editor() {
  render(
    <MeetingEditor
      mode={{ kind: "edit", noteId: "note-1", version: 2, team: "kitchen" }}
      initial={{
        title: "Kickoff",
        date: "2026-10-02",
        time: "18:30",
        calendarEventId: null,
        agenda: "",
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
      teamPeople={{ kitchen: ["crew"] }}
      teamLabels={{ kitchen: "Kitchen" }}
      events={[]}
      formerAttendees={[{ id: "gone", displayName: "Left Camp" }]}
    />,
  );
}

describe("MeetingEditor", () => {
  it("lets an attendee who is no longer approved be unticked", async () => {
    editor();
    const box = screen.getByRole("checkbox", { name: "Left Camp" });
    expect(box.getAttribute("data-state")).toBe("checked");
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Save meeting" }));
    await waitFor(() => expect(editMeetingNoteAction).toHaveBeenCalled());
    const sent = vi.mocked(editMeetingNoteAction).mock.calls[0]![0] as {
      attendeeIds: string[];
      actionItems: { id: string | null }[];
      version: number;
    };
    expect(sent.attendeeIds).toEqual(["crew"]);
    expect(sent.version).toBe(2);
    expect(sent.actionItems.map((i) => i.id)).toEqual(["item-1"]);
    expect(screen.getByText("On the task board")).toBeTruthy();
    expect(screen.queryByDisplayValue("Buy the gas")).toBeNull();
  });
});
