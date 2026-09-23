"use server";

import { revalidatePath } from "next/cache";
import { AddTaskInput, MoveTaskInput } from "@camp404/types";
import { activeTeams, getTeamsConfig } from "@/lib/camp-config";
import { captainActionGate } from "@/lib/captain-gate";
import { runAction, type ActionResult } from "@/lib/action-result";
import { deadlineFromDay } from "@/lib/task-board";
import { addTask, moveTask, removeTask } from "@/lib/tasks";

// The shared task board's writes. The gate here answers the screen; the rule
// itself (who may add for which team, who may move or remove which task) is
// checked again inside each write's transaction, in @camp404/db/tasks.

const ADD_REFUSAL = "Only captains and team leads can add tasks.";

/** Add a task. A captain may pick any active team or none; a lead a team they lead. */
export async function addTaskAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return runAction("addTaskAction", async () => {
    const gate = await captainActionGate("team_lead", ADD_REFUSAL);
    if (!gate.ok) return gate;

    const parsed = AddTaskInput.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error:
          parsed.error.issues[0]?.message ?? "Check the task and try again.",
      };
    }
    const { title, description, team, assigneeId, due } = parsed.data;
    if (team) {
      const active = activeTeams(await getTeamsConfig()).map((t) => t.key);
      if (!active.includes(team)) {
        return {
          ok: false,
          error: "That team isn't active any more. Pick another team.",
        };
      }
    }

    const result = await addTask({
      creatorId: gate.campUser.id,
      title,
      description,
      team,
      assigneeId,
      dueAt: due ? deadlineFromDay(due) : null,
    });
    if (!result.ok) return result;
    revalidatePath("/tasks");
    return { ok: true, data: { id: result.id } };
  });
}

/** Move a task to another column. */
export async function moveTaskAction(input: unknown): Promise<ActionResult> {
  return runAction("moveTaskAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;

    const parsed = MoveTaskInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "That move didn't work." };

    const result = await moveTask({
      ...parsed.data,
      actorId: gate.campUser.id,
    });
    if (!result.ok) return result;
    revalidatePath("/tasks");
    return { ok: true };
  });
}

/** Take a task off the board. */
export async function removeTaskAction(taskId: unknown): Promise<ActionResult> {
  return runAction("removeTaskAction", async () => {
    const gate = await captainActionGate("camp_member");
    if (!gate.ok) return gate;
    if (typeof taskId !== "string" || taskId.length === 0) {
      return { ok: false, error: "That task was removed." };
    }

    const result = await removeTask({ taskId, actorId: gate.campUser.id });
    if (!result.ok) return result;
    revalidatePath("/tasks");
    return { ok: true };
  });
}
