import { describe, expect, it } from "vitest";
import {
  CANNOT_EDIT_TASK,
  CANNOT_MOVE_TASK,
  CANNOT_REMOVE_TASK,
  leadsTaskTeam,
  NOT_A_TASK_AUTHOR,
  NOT_YOUR_TASK_TEAM,
  NOT_YOUR_TEAM_TO_MOVE_TASK,
  TASK_MOVED,
  TASK_PICK_YOUR_TEAM,
  TASK_TEAM_NOT_ACTIVE,
  taskAddProblem,
  taskEditProblem,
  taskMoveProblem,
  taskRemoveProblem,
  type TaskHeld,
} from "../tasks";

const task = (overrides: Partial<TaskHeld> = {}): TaskHeld => ({
  status: "open",
  team: "kitchen",
  assigneeId: "assignee",
  createdById: "creator",
  ...overrides,
});

describe("leadsTaskTeam", () => {
  it("is a captain for any team, and a lead for a team they lead", () => {
    expect(leadsTaskTeam(undefined, null)).toBe(true);
    expect(leadsTaskTeam(["kitchen"], "kitchen")).toBe(true);
    expect(leadsTaskTeam(["kitchen"], "finance")).toBe(false);
    expect(leadsTaskTeam(["kitchen"], null)).toBe(false);
    expect(leadsTaskTeam([], "kitchen")).toBe(false);
  });
});

describe("taskAddProblem", () => {
  it("lets a captain add for any team or none", () => {
    expect(taskAddProblem(undefined, null)).toBeNull();
    expect(taskAddProblem(undefined, "finance")).toBeNull();
  });

  it("lets a lead add only for a team they lead, and refuses a member", () => {
    expect(taskAddProblem(["kitchen"], "kitchen")).toBeNull();
    expect(taskAddProblem(["kitchen"], null)).toBe(TASK_PICK_YOUR_TEAM);
    expect(taskAddProblem(["kitchen"], "finance")).toBe(NOT_YOUR_TASK_TEAM);
    expect(taskAddProblem([], "kitchen")).toBe(NOT_A_TASK_AUTHOR);
    expect(taskAddProblem([], null)).toBe(NOT_A_TASK_AUTHOR);
  });
});

describe("taskMoveProblem", () => {
  const move = (actorId: string, reach: readonly string[] | undefined) =>
    taskMoveProblem({ reach, actorId, task: task(), from: "open" });

  it("lets the person responsible, whoever added it, its lead and a captain move it", () => {
    expect(move("assignee", [])).toBeNull();
    expect(move("creator", [])).toBeNull();
    expect(move("lead", ["kitchen"])).toBeNull();
    expect(move("captain", undefined)).toBeNull();
  });

  it("refuses anyone else, before it looks at the column", () => {
    expect(move("someone", [])).toBe(CANNOT_MOVE_TASK);
    expect(move("lead", ["finance"])).toBe(CANNOT_MOVE_TASK);
    expect(
      taskMoveProblem({
        reach: [],
        actorId: "someone",
        task: task({ status: "done" }),
        from: "open",
      }),
    ).toBe(CANNOT_MOVE_TASK);
  });

  it("refuses a move from a column the task has left, even to the same one", () => {
    expect(
      taskMoveProblem({
        reach: undefined,
        actorId: "captain",
        task: task({ status: "in_progress" }),
        from: "open",
      }),
    ).toBe(TASK_MOVED);
  });
});

describe("taskRemoveProblem", () => {
  it("lets whoever added it, its lead and a captain remove it, not the person responsible", () => {
    const remove = (actorId: string, reach: readonly string[] | undefined) =>
      taskRemoveProblem({ reach, actorId, task: task() });
    expect(remove("creator", [])).toBeNull();
    expect(remove("lead", ["kitchen"])).toBeNull();
    expect(remove("captain", undefined)).toBeNull();
    expect(remove("assignee", [])).toBe(CANNOT_REMOVE_TASK);
    expect(remove("lead", ["finance"])).toBe(CANNOT_REMOVE_TASK);
  });
});

describe("taskEditProblem", () => {
  const edit = (
    actorId: string,
    reach: readonly string[] | undefined,
    team: string | null,
    activeTeams: readonly string[] = ["kitchen", "finance"],
    held: TaskHeld = task(),
  ) => taskEditProblem({ reach, actorId, task: held, team, activeTeams });

  it("lets whoever added it, its lead and a captain edit it, not the person responsible", () => {
    expect(edit("creator", [], "kitchen")).toBeNull();
    expect(edit("lead", ["kitchen"], "kitchen")).toBeNull();
    expect(edit("captain", undefined, "kitchen")).toBeNull();
    expect(edit("assignee", [], "kitchen")).toBe(CANNOT_EDIT_TASK);
  });

  it("moves a task to another team only for a lead of that team or a captain", () => {
    expect(edit("lead", ["kitchen", "finance"], "finance")).toBeNull();
    expect(edit("lead", ["kitchen"], "finance")).toBe(
      NOT_YOUR_TEAM_TO_MOVE_TASK,
    );
    expect(edit("lead", ["kitchen"], null)).toBe(TASK_PICK_YOUR_TEAM);
    expect(edit("creator", [], "finance")).toBe(NOT_YOUR_TEAM_TO_MOVE_TASK);
    expect(edit("captain", undefined, null)).toBeNull();
  });

  it("keeps a team switched off, but moves nothing onto one", () => {
    expect(edit("creator", [], "kitchen", ["finance"])).toBeNull();
    expect(edit("captain", undefined, "kitchen", ["kitchen"])).toBeNull();
    expect(
      edit(
        "captain",
        undefined,
        "kitchen",
        ["finance"],
        task({ team: "finance" }),
      ),
    ).toBe(TASK_TEAM_NOT_ACTIVE);
    expect(
      edit("captain", undefined, "finance", ["kitchen"], task({ team: null })),
    ).toBe(TASK_TEAM_NOT_ACTIVE);
  });
});
