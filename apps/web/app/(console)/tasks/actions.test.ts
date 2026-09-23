import { beforeEach, describe, expect, it, vi } from "vitest";

// The task board's actions. What matters here:
//  1. Adding needs team_lead or captain; moving and removing need an approved
//     member. The rule for WHICH task or team is the data layer's (tested on
//     PGlite in packages/db); these actions must pass the signed-in actor to
//     it, never an id from the browser.
//  2. A deadline day becomes the start of that day in camp time.
//  3. A switched-off team is refused before anything is written.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/camp-config", () => ({
  getTeamsConfig: vi.fn(async () => ({})),
  activeTeams: vi.fn(() => [{ key: "kitchen" }, { key: "finance" }]),
}));
vi.mock("@/lib/tasks", () => ({
  addTask: vi.fn(async () => ({ ok: true, id: "task-1" })),
  moveTask: vi.fn(async () => ({ ok: true })),
  removeTask: vi.fn(async () => ({ ok: true })),
}));

import { campDayKey } from "@camp404/core";
import { captainActionGate } from "@/lib/captain-gate";
import { addTask, moveTask, removeTask } from "@/lib/tasks";
import { addTaskAction, moveTaskAction, removeTaskAction } from "./actions";

const INPUT = {
  title: "  Count the float  ",
  description: "",
  team: "finance",
  assigneeId: null,
  due: "2026-10-01",
};

function signedIn(id = "user-1") {
  vi.mocked(captainActionGate).mockResolvedValue({
    ok: true,
    campUser: { id } as never,
    rank: "team_lead",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn();
});

describe("addTaskAction", () => {
  it("asks for a team lead or better, and says who may add", async () => {
    vi.mocked(captainActionGate).mockResolvedValue({
      ok: false,
      error: "Only captains and team leads can add tasks.",
    });
    const result = await addTaskAction(INPUT);
    expect(captainActionGate).toHaveBeenCalledWith(
      "team_lead",
      "Only captains and team leads can add tasks.",
    );
    expect(result).toEqual({
      ok: false,
      error: "Only captains and team leads can add tasks.",
    });
    expect(addTask).not.toHaveBeenCalled();
  });

  it("adds as the signed-in person, trimmed, with the deadline in camp time", async () => {
    const result = await addTaskAction({ ...INPUT, creatorId: "someone-else" });
    expect(result).toEqual({ ok: true, data: { id: "task-1" } });
    const arg = vi.mocked(addTask).mock.calls[0]![0];
    expect(arg).toMatchObject({
      creatorId: "user-1",
      title: "Count the float",
      description: null,
      team: "finance",
      assigneeId: null,
    });
    expect(campDayKey(arg.dueAt!)).toBe("2026-10-01");
  });

  it("refuses a missing title and a team that is switched off", async () => {
    expect(await addTaskAction({ ...INPUT, title: " " })).toEqual({
      ok: false,
      error: "Give the task a title.",
    });
    expect(await addTaskAction({ ...INPUT, team: "structures" })).toEqual({
      ok: false,
      error: "That team isn't active any more. Pick another team.",
    });
    expect(addTask).not.toHaveBeenCalled();
  });

  it("passes the data layer's refusal through", async () => {
    vi.mocked(addTask).mockResolvedValue({
      ok: false,
      error: "You can add tasks only for a team you lead.",
    });
    expect(await addTaskAction(INPUT)).toEqual({
      ok: false,
      error: "You can add tasks only for a team you lead.",
    });
  });
});

describe("moveTaskAction and removeTaskAction", () => {
  it("move as the signed-in member", async () => {
    signedIn("mover");
    const result = await moveTaskAction({
      taskId: "t1",
      from: "open",
      to: "done",
      actorId: "someone-else",
    });
    expect(result).toEqual({ ok: true });
    expect(captainActionGate).toHaveBeenCalledWith("camp_member");
    expect(moveTask).toHaveBeenCalledWith({
      taskId: "t1",
      from: "open",
      to: "done",
      actorId: "mover",
    });
  });

  it("refuses a column that doesn't exist", async () => {
    const result = await moveTaskAction({
      taskId: "t1",
      from: "open",
      to: "cancelled",
    });
    expect(result.ok).toBe(false);
    expect(moveTask).not.toHaveBeenCalled();
  });

  it("remove as the signed-in member, and passes a refusal through", async () => {
    signedIn("remover");
    vi.mocked(removeTask).mockResolvedValue({ ok: false, error: "nope" });
    expect(await removeTaskAction("t1")).toEqual({ ok: false, error: "nope" });
    expect(removeTask).toHaveBeenCalledWith({
      taskId: "t1",
      actorId: "remover",
    });
  });
});
