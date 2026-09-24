import { z } from "zod";
import { Team } from "./roles";

// The shared task board (owner, 2026-09-23: "a shared task list where all tasks
// can be seen and ordered by which team and who's responsible, with deadlines
// ... something like a Kanban board"). Three columns, one per status. A removed
// task is `cancelled` in the database and appears on no column.
export const TaskBoardStatus = z.enum(["open", "in_progress", "done"]);
export type TaskBoardStatus = z.infer<typeof TaskBoardStatus>;

/** A deadline is a camp day, typed as YYYY-MM-DD. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// What a captain or team lead types to add a task. Who may pick which team is
// the server's rule, not this shape's.
export const AddTaskInput = z.object({
  title: z.string().trim().min(1, "Give the task a title.").max(120),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the details under 2000 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
  team: Team.nullable(),
  assigneeId: z.string().min(1).max(100).nullable(),
  due: z
    .string()
    .regex(DAY, "Pick a date for the deadline.")
    .refine(
      (v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)),
      "Pick a date for the deadline.",
    )
    .nullable(),
});
export type AddTaskInput = z.infer<typeof AddTaskInput>;

// An edit carries the task and the version the editor opened, so a second
// editor cannot silently overwrite the first.
export const EditTaskInput = AddTaskInput.extend({
  taskId: z.string().min(1).max(100),
  version: z.number().int().min(1),
});
export type EditTaskInput = z.infer<typeof EditTaskInput>;

/**
 * What an editor is told when someone else edited the task first. It lives
 * here, not only in @camp404/db/tasks, because the edit dialog matches it to
 * refresh the board.
 */
export const TASK_EDITED =
  "Someone else changed this task while you were editing. Close this and open it again to see their changes.";

export const MoveTaskInput = z.object({
  taskId: z.string().min(1).max(100),
  from: TaskBoardStatus,
  to: TaskBoardStatus,
});
export type MoveTaskInput = z.infer<typeof MoveTaskInput>;
