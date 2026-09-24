import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  campDayKey,
  campDayStart,
  nextCampDay,
  taskDeadlineNotification,
} from "@camp404/core";
import { TASK_EDITED } from "@camp404/types";
import type { DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// The shared task board (owner, 2026-09-23): every approved member sees every
// task, in three columns — To do, Doing, Done — with its team, the person
// responsible and the deadline.
//
// Who may do what:
//  - Add: a captain, for any team or none; a team lead, only for a team they
//    lead this year. Nobody else.
//  - Move between columns: the person responsible, whoever added it, a lead of
//    its team, or a captain.
//  - Remove: whoever added it, a lead of its team, or a captain.
//  - Edit: the same people as remove. Only a lead or a captain may move it to
//    another team (a lead only to one they lead, a captain to any or none),
//    and nobody onto a team that has been switched off.
//
// Every write re-reads the actor's reach inside its own transaction and locks
// it (`lockSenderReach`, the announcements' rule), so a lead removed a moment
// ago cannot still add or move. Moves and removals are compare-and-set: the
// WHERE names the column the actor saw, and a lost race returns a sentence.
// An edit is compare-and-set on `version`, which only an edit bumps.

type Team = (typeof schema.teamEnum.enumValues)[number];
export type TaskBoardStatus = "open" | "in_progress" | "done";

/** Done tasks stay on the board this long after they are finished. */
export const DONE_VISIBLE_DAYS = 30;

const DAY_MS = 86_400_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  team: Team | null;
  status: TaskBoardStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdById: string | null;
  createdByName: string | null;
  dueAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  /** Bumped by every edit; an edit names the version it opened. */
  version: number;
}

/**
 * Every task on the board: all open and in-progress tasks, and those finished
 * in the last DONE_VISIBLE_DAYS. Soonest deadline first; no deadline last.
 */
export async function listBoardTasks(now: Date): Promise<BoardTask[]> {
  const db = createHttpDb();
  const assignee = alias(schema.users, "assignee");
  const creator = alias(schema.users, "creator");
  const doneSince = new Date(now.getTime() - DONE_VISIBLE_DAYS * DAY_MS);
  const rows = await db
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      description: schema.tasks.description,
      team: schema.tasks.team,
      status: schema.tasks.status,
      assigneeId: schema.tasks.assigneeId,
      assigneeName: assignee.displayName,
      createdById: schema.tasks.createdByUserId,
      createdByName: creator.displayName,
      dueAt: schema.tasks.dueAt,
      createdAt: schema.tasks.createdAt,
      completedAt: schema.tasks.completedAt,
      version: schema.tasks.version,
    })
    .from(schema.tasks)
    .leftJoin(assignee, eq(assignee.id, schema.tasks.assigneeId))
    .leftJoin(creator, eq(creator.id, schema.tasks.createdByUserId))
    .where(
      or(
        inArray(schema.tasks.status, ["open", "in_progress"]),
        and(
          eq(schema.tasks.status, "done"),
          gte(schema.tasks.completedAt, doneSince),
        ),
      ),
    )
    .orderBy(
      sql`${schema.tasks.dueAt} ASC NULLS LAST`,
      asc(schema.tasks.createdAt),
    );
  return rows.map((row) => ({
    ...row,
    status: row.status as TaskBoardStatus,
  }));
}

/** One of a member's own unfinished tasks, for their Home. */
export interface MyOpenTask {
  id: string;
  title: string;
  status: "open" | "in_progress";
  team: Team | null;
  dueAt: Date | null;
}

/**
 * The tasks this person is responsible for and has not finished (To do or
 * Doing), soonest deadline first and no deadline last, at most `limit` of
 * them; `total` counts them all, so Home can say how many more there are.
 */
export async function listMyOpenTasks(
  userId: string,
  limit = 5,
): Promise<{ items: MyOpenTask[]; total: number }> {
  if (!UUID.test(userId)) return { items: [], total: 0 };
  const db = createHttpDb();
  const mine = and(
    eq(schema.tasks.assigneeId, userId),
    inArray(schema.tasks.status, ["open", "in_progress"]),
  );
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        status: schema.tasks.status,
        team: schema.tasks.team,
        dueAt: schema.tasks.dueAt,
      })
      .from(schema.tasks)
      .where(mine)
      .orderBy(
        sql`${schema.tasks.dueAt} ASC NULLS LAST`,
        asc(schema.tasks.createdAt),
      )
      .limit(limit),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.tasks)
      .where(mine),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      status: row.status as MyOpenTask["status"],
    })),
    total: counted?.total ?? 0,
  };
}

export interface AssignableMember {
  id: string;
  displayName: string;
}

/** The people a task can be given to: approved members, by name. */
export async function listAssignableMembers(): Promise<AssignableMember[]> {
  const db = createHttpDb();
  const rows = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    )
    .orderBy(asc(schema.users.displayName));
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName ?? "Unnamed member",
  }));
}

export type TaskWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_TASK_AUTHOR = "Only captains and team leads can add tasks.";
export const PICK_YOUR_TEAM = "Pick a team you lead.";
export const NOT_YOUR_TEAM = "You can add tasks only for a team you lead.";
export const NOT_A_MEMBER = "That person isn't an approved camp member.";
export const TASK_GONE = "That task was removed.";
export const TASK_MOVED =
  "Someone else moved this task. The board now shows where it is.";
export const CANNOT_MOVE =
  "Only the person responsible, whoever added it, its team's lead or a captain can move this task.";
export const CANNOT_REMOVE =
  "Only whoever added this task, its team's lead or a captain can remove it.";
export const CANNOT_EDIT =
  "Only whoever added this task, its team's lead or a captain can edit it.";
export const NOT_YOUR_TEAM_TO_MOVE =
  "You can move a task only to a team you lead.";
export const TEAM_NOT_ACTIVE =
  "That team isn't active any more. Pick another team.";
export { TASK_EDITED };

/**
 * Refuses a person responsible who is not an approved, current member. Null
 * (nobody yet) is always fine.
 */
async function assertAssignable(
  tx: DbOrTx,
  assigneeId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!assigneeId) return { ok: true };
  const [member] = UUID.test(assigneeId)
    ? await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.id, assigneeId),
            eq(schema.users.isSystem, false),
            eq(schema.users.sanitised, false),
            eq(schema.users.approvalStatus, "approved"),
          ),
        )
    : [];
  return member ? { ok: true } : { ok: false, error: NOT_A_MEMBER };
}

/** Add a task, as a captain or a lead of its team. */
export async function addTask(input: {
  creatorId: string;
  title: string;
  description: string | null;
  team: Team | null;
  assigneeId: string | null;
  dueAt: Date | null;
}): Promise<TaskWriteResult<{ id: string }>> {
  return await withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.creatorId);
    if (reach !== undefined) {
      if (reach.length === 0) return { ok: false, error: NOT_A_TASK_AUTHOR };
      if (!input.team) return { ok: false, error: PICK_YOUR_TEAM };
      if (!reach.includes(input.team)) {
        return { ok: false, error: NOT_YOUR_TEAM };
      }
    }
    const assignable = await assertAssignable(tx, input.assigneeId);
    if (!assignable.ok) return assignable;
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        title: input.title,
        description: input.description,
        team: input.team,
        assigneeId: input.assigneeId,
        createdByUserId: input.creatorId,
        dueAt: input.dueAt,
      })
      .returning({ id: schema.tasks.id });
    return { ok: true, id: row!.id };
  });
}

/** The task row an actor wants to change, locked, or null when it is gone. */
async function lockTask(tx: DbOrTx, taskId: string) {
  if (!UUID.test(taskId)) return null;
  const [task] = await tx
    .select({
      status: schema.tasks.status,
      team: schema.tasks.team,
      assigneeId: schema.tasks.assigneeId,
      createdById: schema.tasks.createdByUserId,
      version: schema.tasks.version,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .for("update");
  return task && task.status !== "cancelled" ? task : null;
}

/** Whether the actor leads the task's team (a captain's reach is everything). */
function leadsTaskTeam(
  reach: readonly Team[] | undefined,
  team: Team | null,
): boolean {
  return reach === undefined || (team !== null && reach.includes(team));
}

/**
 * Move a task to another column. `from` is the column the actor saw it in; if
 * someone moved it first, nothing changes and the actor is told.
 */
export async function moveTask(input: {
  taskId: string;
  actorId: string;
  from: TaskBoardStatus;
  to: TaskBoardStatus;
}): Promise<TaskWriteResult> {
  return await withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.actorId);
    const task = await lockTask(tx, input.taskId);
    if (!task) return { ok: false, error: TASK_GONE };
    const allowed =
      leadsTaskTeam(reach, task.team) ||
      task.assigneeId === input.actorId ||
      task.createdById === input.actorId;
    if (!allowed) return { ok: false, error: CANNOT_MOVE };
    if (input.from === input.to) return { ok: true };

    const moved = await tx
      .update(schema.tasks)
      .set({
        status: input.to,
        completedAt: input.to === "done" ? new Date() : null,
      })
      .where(
        and(
          eq(schema.tasks.id, input.taskId),
          eq(schema.tasks.status, input.from),
        ),
      )
      .returning({ id: schema.tasks.id });
    return moved.length > 0 ? { ok: true } : { ok: false, error: TASK_MOVED };
  });
}

/** Take a task off the board. It stays in the table as `cancelled`. */
export async function removeTask(input: {
  taskId: string;
  actorId: string;
}): Promise<TaskWriteResult> {
  return await withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.actorId);
    const task = await lockTask(tx, input.taskId);
    if (!task) return { ok: false, error: TASK_GONE };
    const allowed =
      leadsTaskTeam(reach, task.team) || task.createdById === input.actorId;
    if (!allowed) return { ok: false, error: CANNOT_REMOVE };

    const removed = await tx
      .update(schema.tasks)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(schema.tasks.id, input.taskId),
          ne(schema.tasks.status, "cancelled"),
        ),
      )
      .returning({ id: schema.tasks.id });
    return removed.length > 0 ? { ok: true } : { ok: false, error: TASK_GONE };
  });
}

/**
 * Change a task's title, details, team, person responsible and deadline.
 *
 * `version` is the version the editor opened. If someone else edited the task
 * since, nothing changes and the editor is told. A move does not bump the
 * version, so a card moved while the dialog was open still saves.
 * `activeTeams` are the teams switched on in the camp's config: a task may keep
 * a team that has since been switched off, but nobody may move one onto it.
 */
export async function editTask(input: {
  taskId: string;
  actorId: string;
  version: number;
  title: string;
  description: string | null;
  team: Team | null;
  assigneeId: string | null;
  dueAt: Date | null;
  activeTeams: readonly Team[];
}): Promise<TaskWriteResult> {
  return await withTransaction(async (tx) => {
    const reach = await lockSenderReach(tx, input.actorId);
    const task = await lockTask(tx, input.taskId);
    if (!task) return { ok: false, error: TASK_GONE };
    const allowed =
      leadsTaskTeam(reach, task.team) || task.createdById === input.actorId;
    if (!allowed) return { ok: false, error: CANNOT_EDIT };

    if (input.team !== task.team) {
      if (reach !== undefined) {
        if (!input.team) return { ok: false, error: PICK_YOUR_TEAM };
        if (!reach.includes(input.team)) {
          return { ok: false, error: NOT_YOUR_TEAM_TO_MOVE };
        }
      }
      if (input.team && !input.activeTeams.includes(input.team)) {
        return { ok: false, error: TEAM_NOT_ACTIVE };
      }
    }
    // Like the team, the person responsible is checked only when it changes:
    // a task may keep someone who has since left the approved list (erased,
    // or sent back to pending), so a title fix still saves.
    if (input.assigneeId !== task.assigneeId) {
      const assignable = await assertAssignable(tx, input.assigneeId);
      if (!assignable.ok) return assignable;
    }

    const edited = await tx
      .update(schema.tasks)
      .set({
        title: input.title,
        description: input.description,
        team: input.team,
        assigneeId: input.assigneeId,
        dueAt: input.dueAt,
        version: sql`${schema.tasks.version} + 1`,
      })
      .where(
        and(
          eq(schema.tasks.id, input.taskId),
          eq(schema.tasks.version, input.version),
          ne(schema.tasks.status, "cancelled"),
        ),
      )
      .returning({ id: schema.tasks.id });
    return edited.length > 0 ? { ok: true } : { ok: false, error: TASK_EDITED };
  });
}

/**
 * The task deadline nudge, run on a page load (apps/web/lib/background-work.ts,
 * camp daytime only, at most every five minutes). The person
 * responsible for an open or in-progress task hears about it twice: the camp
 * day before it is due, and on the day. Each reminder is recorded in
 * `task_deadline_reminders` first, and the delivery is written only when that
 * record is new, so a re-run never sends twice. The record's key includes the
 * due day and the person, so moving the deadline or handing the task to
 * someone else sends a fresh reminder.
 *
 * Days are camp days (UTC+2). A task added and due the same day is reminded on
 * the next page load, once. An
 * overdue task gets no further reminders, and a task nobody is responsible for
 * reminds nobody. Push and email go out through their own drains (email
 * follows the delivery's emailStatus).
 */
export async function remindTaskDeadlines(
  input: { now?: Date } = {},
): Promise<{ tasks: number; reminded: number }> {
  const now = input.now ?? new Date();
  const today = campDayKey(now);
  const tomorrow = nextCampDay(today);
  const start = campDayStart(today);
  const end = campDayStart(nextCampDay(tomorrow));

  // One transaction, one connection: every query goes through `tx`.
  return await withTransaction(async (tx) => {
    const due = await tx
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        dueAt: schema.tasks.dueAt,
        assigneeId: schema.tasks.assigneeId,
      })
      .from(schema.tasks)
      .innerJoin(schema.users, eq(schema.users.id, schema.tasks.assigneeId))
      .where(
        and(
          inArray(schema.tasks.status, ["open", "in_progress"]),
          isNotNull(schema.tasks.assigneeId),
          gte(schema.tasks.dueAt, start),
          lt(schema.tasks.dueAt, end),
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
          eq(schema.users.approvalStatus, "approved"),
        ),
      );

    let reminded = 0;
    for (const task of due) {
      // The select filters both out; the guard only narrows the types.
      if (!task.dueAt || !task.assigneeId) continue;
      const dueDay = campDayKey(task.dueAt);
      const stage = dueDay === today ? "due_day" : "day_before";
      const recorded = await tx
        .insert(schema.taskDeadlineReminders)
        .values({ taskId: task.id, userId: task.assigneeId, dueDay, stage })
        .onConflictDoNothing()
        .returning({ taskId: schema.taskDeadlineReminders.taskId });
      if (recorded.length === 0) continue;
      await tx.insert(schema.notificationDeliveries).values(
        deliveryValues(
          taskDeadlineNotification({
            taskId: task.id,
            title: task.title,
            stage,
          }),
          {
            userId: task.assigneeId,
            broadcastId: null,
            channel: "both",
            presentation: "feed",
          },
        ),
      );
      reminded += 1;
    }
    return { tasks: due.length, reminded };
  });
}
