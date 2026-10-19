// The shared task board's rules (owner, 2026-09-23). Pure: no DB, no session,
// no next/*. The write (@camp404/db/tasks) reads the actor's reach and the
// task inside its own transaction, locked, and asks here; the E2E store asks
// the same functions, so both refuse alike.
//
// `reach` is what the write read: undefined for a captain (every team), else
// the teams the actor leads this year (none for a member).
//
// Who may do what:
//  - Add: a captain, for any team or none; a team lead, only for a team they
//    lead this year. Nobody else.
//  - Move between columns: the person responsible, whoever added it, a lead of
//    its team, or a captain.
//  - Remove and edit: whoever added it, a lead of its team, or a captain. Only
//    a lead or a captain may move it to another team (a lead only to one they
//    lead, a captain to any or none), and nobody onto a team switched off.

export type TaskReach = readonly string[] | undefined;

/** A column on the board. */
export type TaskColumn = "open" | "in_progress" | "done";

/** The task as the write found it. */
export interface TaskHeld {
  status: string;
  team: string | null;
  assigneeId: string | null;
  createdById: string | null;
}

export const NOT_A_TASK_AUTHOR = "Only captains and team leads can add tasks.";
export const TASK_PICK_YOUR_TEAM = "Pick a team you lead.";
export const NOT_YOUR_TASK_TEAM = "You can add tasks only for a team you lead.";
export const TASK_MOVED =
  "Someone else moved this task. The board now shows where it is.";
export const CANNOT_MOVE_TASK =
  "Only the person responsible, whoever added it, its team's lead or a captain can move this task.";
export const CANNOT_REMOVE_TASK =
  "Only whoever added this task, its team's lead or a captain can remove it.";
export const CANNOT_EDIT_TASK =
  "Only whoever added this task, its team's lead or a captain can edit it.";
export const NOT_YOUR_TEAM_TO_MOVE_TASK =
  "You can move a task only to a team you lead.";
export const TASK_TEAM_NOT_ACTIVE =
  "That team isn't active any more. Pick another team.";

/** Whether the actor leads the task's team (a captain's reach is everything). */
export function leadsTaskTeam(reach: TaskReach, team: string | null): boolean {
  return reach === undefined || (team !== null && reach.includes(team));
}

/** Why the actor may not add a task for `team` (null: no team), or null. */
export function taskAddProblem(
  reach: TaskReach,
  team: string | null,
): string | null {
  if (reach === undefined) return null;
  if (reach.length === 0) return NOT_A_TASK_AUTHOR;
  if (!team) return TASK_PICK_YOUR_TEAM;
  if (!reach.includes(team)) return NOT_YOUR_TASK_TEAM;
  return null;
}

/**
 * Why the actor may not move the task from the column they saw (`from`), or
 * null. The column they saw must still be the task's, even for a move to the
 * same column: otherwise a stale read would be told it succeeded.
 */
export function taskMoveProblem(input: {
  reach: TaskReach;
  actorId: string;
  task: TaskHeld;
  from: TaskColumn;
}): string | null {
  const { task } = input;
  const allowed =
    leadsTaskTeam(input.reach, task.team) ||
    task.assigneeId === input.actorId ||
    task.createdById === input.actorId;
  if (!allowed) return CANNOT_MOVE_TASK;
  if (task.status !== input.from) return TASK_MOVED;
  return null;
}

/** Why the actor may not remove the task, or null. */
export function taskRemoveProblem(input: {
  reach: TaskReach;
  actorId: string;
  task: TaskHeld;
}): string | null {
  const allowed =
    leadsTaskTeam(input.reach, input.task.team) ||
    input.task.createdById === input.actorId;
  return allowed ? null : CANNOT_REMOVE_TASK;
}

/**
 * Why the actor may not edit the task into team `team`, or null. A task may
 * keep a team that has since been switched off (`activeTeams` are the ones
 * on), but nobody may move one onto it. The person responsible and the
 * version are the write's to check.
 */
export function taskEditProblem(input: {
  reach: TaskReach;
  actorId: string;
  task: TaskHeld;
  team: string | null;
  activeTeams: readonly string[];
}): string | null {
  const { reach, task, team } = input;
  const allowed =
    leadsTaskTeam(reach, task.team) || task.createdById === input.actorId;
  if (!allowed) return CANNOT_EDIT_TASK;
  if (team === task.team) return null;
  if (reach !== undefined) {
    if (!team) return TASK_PICK_YOUR_TEAM;
    if (!reach.includes(team)) return NOT_YOUR_TEAM_TO_MOVE_TASK;
  }
  if (team && !input.activeTeams.includes(team)) return TASK_TEAM_NOT_ACTIVE;
  return null;
}
