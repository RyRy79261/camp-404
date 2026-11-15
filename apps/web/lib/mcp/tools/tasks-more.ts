import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { campDayKey } from "@camp404/core";
import { EditTaskInput, TASK_EDITED, Team } from "@camp404/types";
import { activeTeams, getTeamsConfig } from "../../camp-config";
import { deadlineFromDay, presentTask } from "../../task-board";
import { editTask, listBoardTasks, type BoardTask } from "../../tasks";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
import { notFound, runTool, ToolError } from "../tool-utils";

// The task board's Edit over MCP, through the board's own write (lib/tasks.ts
// → @camp404/db/tasks editTask), on the board's rules.
//
//  - Any member may ask, as on the page; the write decides inside its
//    transaction whether THIS person may edit THIS task (whoever added it, a
//    lead of its team, a captain) and which team they may move it to, from
//    the actor it re-reads. Nothing here passes a rank or a team list.
//  - The edit dialog sends the whole task on the version it opened. Here only
//    what changes is given; the rest is filled from the task AT the version
//    the caller read (`expectedVersion`), and the write checks that version
//    again (a compare-and-set), so someone else's edit in between is refused
//    in the dialog's own words (TASK_EDITED).
//  - Taking a task off the board stays on the page (it holds written content).
//    No audit row: the board's writes are team planning data, and the site
//    writes none either.

const TASKS_PATH = "/tasks";

/** The board's task with this id: open, in progress, or done in the last 30 days. */
async function findTask(taskId: string, now: Date): Promise<BoardTask | null> {
  const tasks = await listBoardTasks(now);
  return tasks.find((t) => t.id === taskId) ?? null;
}

/** The task as the board's card shows it to this person. */
async function cardFor(task: BoardTask, scope: McpScope, now: Date) {
  const config = await getTeamsConfig();
  const teamLabels = Object.fromEntries(
    config.teams.map((t) => [t.key, t.label]),
  );
  return presentTask(task, {
    viewer: {
      id: scope.campUserId,
      isCaptain: scope.isCaptain,
      leadTeams: scopeActor(scope).ledTeams,
    },
    now,
    teamLabels,
  });
}

export function registerTasksMoreTools(server: McpServer): void {
  server.registerTool(
    "get_task",
    {
      title: "Read a task",
      description:
        "One task on the board in full: title, details, team, who is responsible (assigneeId), deadline (YYYY-MM-DD), column, its `version` (edit_task needs it) and whether you may edit it (`canEdit`). The board holds open and in-progress tasks and those done in the last 30 days.",
      inputSchema: z.object({ taskId: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_task",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const now = new Date();
          const task = await findTask(args.taskId, now);
          if (!task) notFound("That task isn't on the board.");
          const card = await cardFor(task, scope, now);
          return {
            id: card.id,
            title: card.title,
            description: card.description,
            status: card.status,
            team: card.team,
            teamLabel: card.teamLabel,
            assigneeId: card.assigneeId,
            assigneeName: card.assigneeName,
            addedBy: card.addedBy,
            due: card.dueDay,
            dueLabel: card.due?.label ?? null,
            version: card.version,
            canEdit: card.canEdit,
            canMove: card.canMove,
            url: siteUrl(`${TASKS_PATH}?task=${card.id}`),
          };
        },
      }),
  );

  server.registerTool(
    "edit_task",
    {
      title: "Edit a task",
      description:
        "Changes a task's title, details, team, person responsible (assigneeId) or deadline (`due`, YYYY-MM-DD), as the Tasks page's Edit does. Give `expectedVersion` from get_task and only what changes; null clears details, team, person or deadline. If someone edited it since, nothing changes: read it again. Whoever added it, a lead of its team and a captain may edit it.",
      inputSchema: z.object({
        taskId: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        title: z.string().max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        team: Team.nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        due: z.string().nullable().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "edit_task",
        extra,
        // Which fields changed, never the words.
        argsForAudit: {
          taskId: args.taskId,
          expectedVersion: args.expectedVersion,
          fields: (
            ["title", "description", "team", "assigneeId", "due"] as const
          ).filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          const now = new Date();
          const task = await findTask(args.taskId, now);
          if (!task) notFound("That task isn't on the board.");
          // The fields left out are filled from this read, so it must be the
          // version the caller read; the write checks it again.
          if (task.version !== args.expectedVersion) {
            throw new ToolError(TASK_EDITED);
          }
          const description =
            args.description !== undefined
              ? args.description
              : task.description;
          const parsed = EditTaskInput.safeParse({
            taskId: task.id,
            version: args.expectedVersion,
            title: args.title ?? task.title,
            description: description ?? undefined,
            team: args.team !== undefined ? args.team : task.team,
            assigneeId:
              args.assigneeId !== undefined ? args.assigneeId : task.assigneeId,
            due:
              args.due !== undefined
                ? args.due
                : task.dueAt
                  ? campDayKey(task.dueAt)
                  : null,
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ??
                "Check the task and try again.",
            );
          }
          const input = parsed.data;
          const result = await editTask({
            taskId: input.taskId,
            actorId: scope.campUserId,
            version: input.version,
            title: input.title,
            description: input.description,
            team: input.team,
            assigneeId: input.assigneeId,
            dueAt: input.due ? deadlineFromDay(input.due) : null,
            activeTeams: activeTeams(await getTeamsConfig())
              .map((t) => t.key)
              .filter((key): key is Team => Team.safeParse(key).success),
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: task.id,
            title: input.title,
            // The edit bumps the version by one, on the version given.
            version: input.version + 1,
            url: siteUrl(`${TASKS_PATH}?task=${task.id}`),
          };
        },
      }),
  );
}
