// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../tasks", () => ({ listBoardTasks: vi.fn() }));
vi.mock("../reads", () => ({
  readNames: vi.fn(async () => new Map([["u-cook", "Cee Cook"]])),
  readTeamLabels: vi.fn(async () => ({ kitchen: "Kitchen" })),
}));

import { listBoardTasks } from "../../tasks";
import type { McpScope } from "../../mcp/scope";
import { TASKS_MORE_PREVIEWS } from "../previews-tasks-more";

const ME = "11111111-1111-4111-8111-111111111111";
const scope = (over: Partial<McpScope> = {}): McpScope => ({
  campUserId: ME,
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
  ...over,
});
const now = new Date("2026-10-06T10:00:00Z");
const TASK = {
  id: "t1",
  title: "Buy gas",
  description: null,
  team: "kitchen",
  status: "open",
  assigneeId: null,
  assigneeName: null,
  createdById: null,
  createdByName: null,
  dueAt: null,
  createdAt: now,
  completedAt: null,
  version: 4,
};

describe("edit_task preview", () => {
  it("names the task from the board, lists each change and fills in the version read", async () => {
    vi.mocked(listBoardTasks).mockResolvedValue([TASK] as never);
    const p = await TASKS_MORE_PREVIEWS.edit_task!(
      {
        taskId: "t1",
        expectedVersion: 1,
        title: "Buy gas and matches",
        assigneeId: "u-cook",
        due: "2026-10-20",
      },
      { scope: scope(), now },
    );
    expect(p.sentence).toBe("Edit the task “Buy gas”");
    expect(p.change).toEqual([
      "Title: “Buy gas and matches”",
      "Responsible: Cee Cook",
      "Deadline: Tue 20 Oct",
    ]);
    expect(p.args).toMatchObject({ taskId: "t1", expectedVersion: 4 });
    expect(p.keys).toEqual(["task:t1"]);
    expect(p.blocked).toBeUndefined();
  });

  it("blocks someone who may not edit it, and a task not on the board", async () => {
    vi.mocked(listBoardTasks).mockResolvedValue([TASK] as never);
    const member = scope({ viewerRank: "camp_member", leadTeams: [] });
    expect(
      (
        await TASKS_MORE_PREVIEWS.edit_task!(
          { taskId: "t1", title: "x" },
          { scope: member, now },
        )
      ).blocked,
    ).toBe(
      "Only whoever added it, a lead of its team or a captain can edit it.",
    );
    expect(
      (
        await TASKS_MORE_PREVIEWS.edit_task!(
          { taskId: "nope", title: "x" },
          { scope: scope(), now },
        )
      ).blocked,
    ).toBe("That task isn't on the board.");
  });
});
