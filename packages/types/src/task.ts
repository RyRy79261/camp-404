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

export const MoveTaskInput = z.object({
  taskId: z.string().min(1).max(100),
  from: TaskBoardStatus,
  to: TaskBoardStatus,
});
export type MoveTaskInput = z.infer<typeof MoveTaskInput>;
