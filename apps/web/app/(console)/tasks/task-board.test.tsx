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
// AGENTS.md). A viewer who may not move a card gets no buttons on it.

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({
  addTaskAction: vi.fn(),
  moveTaskAction: vi.fn(),
  removeTaskAction: vi.fn(),
}));

import { toast } from "@camp404/ui/components/toast";
import type { TaskCard } from "@/lib/task-board";
import { moveTaskAction } from "./actions";
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
    canMove: true,
    canRemove: false,
    ...overrides,
  };
}

function renderBoard(cards: TaskCard[]) {
  render(
    <TaskBoard
      cards={cards}
      viewerId="me"
      members={[]}
      filterTeams={[]}
      addTeams={[]}
      canAddWithoutTeam={false}
    />,
  );
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

  it("offers no buttons on a card the viewer may not change, and no Add task", () => {
    renderBoard([card({ canMove: false, mine: false, assigneeId: "x" })]);
    const article = screen.getByRole("article", { name: "Count the float" });
    expect(within(article).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Add task" })).toBeNull();
  });
});
