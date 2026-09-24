import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

// The board's own behaviour: a moved card goes to its new column at once, and
// goes back, with a toast, if the server refuses (the one-tap-row rule in
// AGENTS.md). A viewer who may not move a card gets no buttons on it. Edit
// opens the task's own values, sends the version it opened, and shows a
// refusal inline, beside the form.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({
  addTaskAction: vi.fn(),
  editTaskAction: vi.fn(),
  moveTaskAction: vi.fn(),
  removeTaskAction: vi.fn(),
}));

import { toast } from "@camp404/ui/components/toast";
import type { TaskCard } from "@/lib/task-board";
import { TASK_EDITED } from "@camp404/types";
import { editTaskAction, moveTaskAction } from "./actions";
import { TaskBoard } from "./task-board";

function card(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: "t1",
    title: "Count the float",
    description: null,
    status: "open",
    team: "finance",
    teamLabel: "Finance",
    assigneeId: "me",
    assigneeName: "Me",
    mine: true,
    addedBy: "Cap",
    due: null,
    dueDay: null,
    version: 1,
    canMove: true,
    canRemove: false,
    canEdit: false,
    ...overrides,
  };
}

function renderBoard(
  cards: TaskCard[],
  members: { id: string; displayName: string }[] = [],
) {
  render(
    <TaskBoard
      cards={cards}
      viewerId="me"
      members={members}
      filterTeams={[]}
      addTeams={[]}
      canAddWithoutTeam={false}
    />,
  );
}

/** A task this viewer added and may edit, due on 1 October, on version 4. */
const editable = () =>
  card({
    canEdit: true,
    canRemove: true,
    description: "Before the gate opens.",
    assigneeId: "crew",
    assigneeName: "Crew Member",
    mine: false,
    dueDay: "2026-10-01",
    version: 4,
  });

const CREW = [{ id: "crew", displayName: "Crew Member" }];

function openEdit() {
  fireEvent.click(
    screen.getByRole("button", { name: "Edit “Count the float”" }),
  );
  return screen.getByRole("dialog");
}

const column = (name: string) => screen.getByRole("region", { name });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TaskBoard", () => {
  it("moves a card and asks the server with the column it was in", async () => {
    vi.mocked(moveTaskAction).mockResolvedValue({ ok: true });
    renderBoard([card()]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move “Count the float” to Doing" }),
    );

    expect(
      within(column("Doing")).getByRole("article", { name: "Count the float" }),
    ).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(moveTaskAction).toHaveBeenCalledWith({
      taskId: "t1",
      from: "open",
      to: "in_progress",
    });
  });

  it("puts the card back and says why when the server refuses", async () => {
    vi.mocked(moveTaskAction).mockResolvedValue({
      ok: false,
      error: "Someone else moved this task. The board now shows where it is.",
    });
    renderBoard([card()]);

    fireEvent.click(
      screen.getByRole("button", { name: "Move “Count the float” to Done" }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Someone else moved this task. The board now shows where it is.",
      ),
    );
    expect(
      within(column("To do")).getByRole("article", { name: "Count the float" }),
    ).toBeTruthy();
  });

  it("opens Edit with every field of the task filled in", () => {
    renderBoard([editable()], CREW);
    const dialog = openEdit();

    expect(
      within(dialog).getByRole("heading", { name: "Edit task" }),
    ).toBeTruthy();
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Title",
        }) as HTMLInputElement
      ).value,
    ).toBe("Count the float");
    expect(
      (within(dialog).getByLabelText("Details") as HTMLTextAreaElement).value,
    ).toBe("Before the gate opens.");
    expect(
      (within(dialog).getByLabelText("Deadline") as HTMLInputElement).value,
    ).toBe("2026-10-01");
    // The task's own team stays pickable though this viewer leads no team.
    expect(
      within(dialog).getByRole("combobox", { name: "Team" }).textContent,
    ).toBe("Finance");
    expect(
      within(dialog).getByRole("combobox", { name: "Person responsible" })
        .textContent,
    ).toBe("Crew Member");
    expect(
      within(dialog).getByRole("button", { name: "Save changes" }),
    ).toBeTruthy();
  });

  it("saves the changes with the version it opened", async () => {
    vi.mocked(editTaskAction).mockResolvedValue({ ok: true });
    renderBoard([editable()], CREW);
    const dialog = openEdit();

    fireEvent.change(within(dialog).getByRole("textbox", { name: "Title" }), {
      target: { value: "Count the float twice" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Task updated"),
    );
    expect(editTaskAction).toHaveBeenCalledWith({
      taskId: "t1",
      version: 4,
      title: "Count the float twice",
      description: "Before the gate opens.",
      team: "finance",
      assigneeId: "crew",
      due: "2026-10-01",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a lost edit race in the dialog and refreshes the board", async () => {
    vi.mocked(editTaskAction).mockResolvedValue({
      ok: false,
      error: TASK_EDITED,
    });
    renderBoard([editable()], CREW);
    const dialog = openEdit();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe(TASK_EDITED),
    );
    expect(refresh).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("offers no buttons on a card the viewer may not change, and no Add task", () => {
    renderBoard([card({ canMove: false, mine: false, assigneeId: "x" })]);
    const article = screen.getByRole("article", { name: "Count the float" });
    expect(within(article).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  });
});
