import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ addMemberNoteAction: vi.fn() }));

import { addMemberNoteAction } from "./actions";
import { MemberNotes } from "./member-notes";

// The notes section in the captain's member panel: the list, who wrote each
// note and when, and adding one.

afterEach(() => {
  cleanup();
  vi.mocked(addMemberNoteAction).mockReset();
});

const NOTE = {
  id: "n1",
  body: "Brings a generator.",
  createdAt: new Date("2026-09-01T10:00:00Z"),
  authorId: "cap-1",
  authorName: "Jo",
};

describe("MemberNotes", () => {
  it("says who wrote each note, and names a gone author plainly", () => {
    render(
      <MemberNotes
        userId="m1"
        notes={[NOTE, { ...NOTE, id: "n2", body: "Old one", authorName: null }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Brings a generator.")).toBeTruthy();
    expect(screen.getByText(/^Jo · /)).toBeTruthy();
    expect(screen.getByText(/^A former captain · /)).toBeTruthy();
    expect(
      screen.getByText("Only captains see these. The member never does."),
    ).toBeTruthy();
  });

  it("adds a note, hands back the list and clears the field", async () => {
    const onChange = vi.fn();
    vi.mocked(addMemberNoteAction).mockResolvedValue({
      ok: true,
      notes: [NOTE],
    });
    render(<MemberNotes userId="m1" notes={[]} onChange={onChange} />);

    const field = screen.getByLabelText("Add a note") as HTMLTextAreaElement;
    const add = screen.getByRole("button", {
      name: "Add note",
    }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "Brings a generator." } });
    fireEvent.click(add);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith([NOTE]));
    expect(addMemberNoteAction).toHaveBeenCalledWith(
      "m1",
      "Brings a generator.",
    );
    expect(field.value).toBe("");
  });

  it("keeps the draft and shows the refusal when the add fails", async () => {
    vi.mocked(addMemberNoteAction).mockResolvedValue({
      ok: false,
      error: "Captain access only.",
    });
    render(<MemberNotes userId="m1" notes={[]} onChange={() => {}} />);
    const field = screen.getByLabelText("Add a note") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Captain access only.",
    );
    expect(field.value).toBe("Hi");
  });
});
