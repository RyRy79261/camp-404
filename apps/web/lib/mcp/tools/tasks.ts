import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AddTaskInput, MoveTaskInput, Team } from "@camp404/types";
import { activeTeams, getTeamsConfig } from "../../camp-config";
import { deadlineFromDay, presentTask } from "../../task-board";
import { addTask, listBoardTasks, moveTask } from "../../tasks";
import { siteUrl } from "../capabilities";
import { runTool, ToolError, truncateList } from "../tool-utils";

// The shared task board over MCP, through the board's own functions
// (lib/tasks.ts → @camp404/db/tasks) and on the board's rules.
//
//  - Every approved member sees every task (the Tasks page), each card with
//    what THIS person may do to it (presentTask, the page's own).
//  - Adding is the page's Add: captains (any active team or none) and team
//    leads (a team they lead). The write reads the actor's rank and led teams
//    again inside its transaction (lockSenderReach), so nothing here passes a
//    rank or a team list.
//  - Moving is a compare-and-set on the column the person saw it in (`from`):
//    if someone moved it first, nothing changes and they are told. The write
//    decides who may move it (the assignee, whoever added it, a lead of its
//    team, a captain).
//  - Editing and removing a task stay on the page. No audit row: the board's
//    writes are team planning data, and the site writes none either.

const TASKS_PATH = "/tasks";

export function registerTaskTools(server: McpServer): void {
  server.registerTool(
    "list_tasks",
    {
      title: "List the task board",
      description:
        "Every task on the camp's board, as the Tasks page shows it: open and in-progress tasks, and those done in the last 30 days, soonest deadline first. Each has its team, who is responsible (`mine` when it is you), who added it, the deadline, its `status` column, and what you may do to it (`canMove`). Filter with `team` or `status`.",
      inputSchema: {
        team: Team.optional(),
        status: MoveTaskInput.shape.to.optional(),
        mineOnly: z.boolean().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_tasks",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const now = new Date();
          const [tasks, config] = await Promise.all([
            listBoardTasks(now),
            getTeamsConfig(),
          ]);
          const teamLabels = Object.fromEntries(
            config.teams.map((t) => [t.key, t.label]),
          );
          // The page passes lead teams only for a team lead; a captain leads
          // every team on the board.
          const viewer = {
            id: scope.campUserId,
            isCaptain: scope.isCaptain,
            leadTeams: scope.viewerRank === "team_lead" ? scope.leadTeams : [],
          };
          const cards = tasks
            .map((task) => presentTask(task, { viewer, now, teamLabels }))
            .filter(
              (c) =>
                (!args.team || c.team === args.team) &&
                (!args.status || c.status === args.status) &&
                (!args.mineOnly || c.mine),
            )
            .map((c) => ({
              id: c.id,
              title: c.title,
              description: c.description,
              status: c.status,
              team: c.team,
              teamLabel: c.teamLabel,
              assigneeId: c.assigneeId,
              assigneeName: c.assigneeName,
              mine: c.mine,
              addedBy: c.addedBy,
              due: c.dueDay,
              dueLabel: c.due?.label ?? null,
              canMove: c.canMove,
            }));
          return { ...truncateList(cards), url: siteUrl(TASKS_PATH) };
        },
      }),
  );

  server.registerTool(
    "add_task",
    {
      title: "Add a task",
      description:
        "Adds a task to the board, as the Tasks page's Add does. A team lead adds tasks only for a team they lead (give `team`); a captain for any active team, or none. `assigneeId` is the approved member responsible (or null), `due` a day as YYYY-MM-DD (or null). Returns the new task's id.",
      inputSchema: {
        title: z.string().max(120),
        description: z.string().max(2000).optional(),
        team: Team.nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        due: z.string().nullable().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "add_task",
        extra,
        argsForAudit: {
          team: args.team ?? null,
          assigneeId: args.assigneeId ?? null,
          due: args.due ?? null,
        },
        handler: async ({ scope }) => {
          const parsed = AddTaskInput.safeParse({
            title: args.title,
            description: args.description,
            team: args.team ?? null,
            assigneeId: args.assigneeId ?? null,
            due: args.due ?? null,
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ??
                "Check the task and try again.",
            );
          }
          const { title, description, team, assigneeId, due } = parsed.data;
          if (team) {
            const active = activeTeams(await getTeamsConfig()).map(
              (t) => t.key,
            );
            if (!active.includes(team)) {
              throw new ToolError(
                "That team isn't active any more. Pick another team.",
              );
            }
          }
          const result = await addTask({
            creatorId: scope.campUserId,
            title,
            description,
            team,
            assigneeId,
            dueAt: due ? deadlineFromDay(due) : null,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            url: siteUrl(`${TASKS_PATH}?task=${result.id}`),
          };
        },
      }),
  );

  server.registerTool(
    "move_task",
    {
      title: "Move a task",
      description:
        "Moves a task to another column (open, in_progress, done), as dragging its card does. Give `from`, the column you read it in from list_tasks: if someone moved it since, nothing changes and you are told to read the board again. The person responsible, whoever added it, a lead of its team and a captain may move it.",
      inputSchema: {
        taskId: z.string().uuid(),
        from: MoveTaskInput.shape.from,
        to: MoveTaskInput.shape.to,
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "move_task",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await moveTask({
            taskId: args.taskId,
            from: args.from,
            to: args.to,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { id: args.taskId, status: args.to };
        },
      }),
  );
}
