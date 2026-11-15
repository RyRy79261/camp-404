import { campDayKey } from "@camp404/core";
import { scopeActor } from "../mcp/scope";
import { TASK_COLUMN_LABEL, presentTask } from "../task-board";
import { listBoardTasks } from "../tasks";
import { readTeamLabels } from "./reads";
import {
  blocked,
  dayLabel,
  personName,
  quote,
  shown,
  str,
  type PreviewFn,
} from "./preview-kit";

// Voice's row for edit_task: the task as it stands, read on the server, what
// the edit leaves in each field it changes, and the version it was read at.

export const TASKS_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async edit_task(args, ctx) {
    const [tasks, labels] = await Promise.all([
      listBoardTasks(ctx.now),
      readTeamLabels(),
    ]);
    const task = tasks.find((t) => t.id === str(args.taskId));
    if (!task) {
      return blocked(
        "Edit a task",
        "That task isn't on the board.",
        args,
        "/tasks",
      );
    }
    const card = presentTask(task, {
      viewer: {
        id: ctx.scope.campUserId,
        isCaptain: ctx.scope.isCaptain,
        leadTeams: scopeActor(ctx.scope).ledTeams,
      },
      now: ctx.now,
      teamLabels: labels,
    });
    const change: string[] = [];
    if (args.title !== undefined) change.push(`Title: ${shown(args.title)}`);
    if (args.description !== undefined) {
      change.push(`Details: ${shown(args.description)}`);
    }
    if (args.team !== undefined) {
      const team = str(args.team);
      change.push(`Team: ${team ? (labels[team] ?? team) : "No team"}`);
    }
    if (args.assigneeId !== undefined) {
      change.push(
        `Responsible: ${args.assigneeId ? await personName(args.assigneeId) : "nobody"}`,
      );
    }
    if (args.due !== undefined) {
      change.push(
        `Deadline: ${args.due ? dayLabel(str(args.due)) : "no deadline"}`,
      );
    }
    const due = task.dueAt ? dayLabel(campDayKey(task.dueAt)) : "no deadline";
    const preview = {
      sentence: `Edit the task ${quote(task.title)}`,
      facts: `Tasks · ${card.teamLabel ?? "No team"} · ${TASK_COLUMN_LABEL[task.status]} · ${card.assigneeName ?? "nobody responsible"} · ${due}`,
      change,
      path: `/tasks?task=${task.id}`,
      args: { ...args, taskId: task.id, expectedVersion: task.version },
      keys: [`task:${task.id}`],
    };
    if (!card.canEdit) {
      return {
        ...preview,
        blocked:
          "Only whoever added it, a lead of its team or a captain can edit it.",
      };
    }
    if (change.length === 0) {
      return { ...preview, blocked: "Nothing to change was given." };
    }
    return preview;
  },
};
