import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  CANNOT_MOVE,
  CANNOT_REMOVE,
  NOT_A_MEMBER,
  NOT_A_TASK_AUTHOR,
  NOT_YOUR_TEAM,
  PICK_YOUR_TEAM,
  TASK_GONE,
  TASK_MOVED,
  addTask,
  listAssignableMembers,
  listBoardTasks,
  moveTask,
  removeTask,
} from "../tasks";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// The shared task board's data layer on a real Postgres (PGlite). What
// matters: who may add, move and remove; that a move is a compare-and-set; and
// what the board shows.

const NOW = new Date("2026-09-23T10:00:00Z");

function task(overrides: Partial<Parameters<typeof addTask>[0]> = {}) {
  return {
    title: "Buy gas bottles",
    description: null,
    team: "kitchen" as const,
    assigneeId: null,
    dueAt: null,
    ...overrides,
  };
}

describe("tasks", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db);
    await makeMembership(db, { userId: member.id, team: "kitchen" });
    return { captain, lead, member };
  }

  async function statusOf(id: string) {
    const [row] = await h
      .db()
      .select({ status: schema.tasks.status, done: schema.tasks.completedAt })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id));
    return row;
  }

  describe("addTask", () => {
    it("lets a captain add for any team, or none", async () => {
      const { captain } = await people();
      const a = await addTask({
        creatorId: captain.id,
        ...task({ team: "finance" }),
      });
      const b = await addTask({
        creatorId: captain.id,
        ...task({ team: null }),
      });
      expect(a.ok && b.ok).toBe(true);
    });

    it("lets a lead add only for a team they lead", async () => {
      const { lead } = await people();
      expect(
        (await addTask({ creatorId: lead.id, ...task({ team: "kitchen" }) }))
          .ok,
      ).toBe(true);
      expect(
        await addTask({ creatorId: lead.id, ...task({ team: "structures" }) }),
      ).toEqual({ ok: false, error: NOT_YOUR_TEAM });
      expect(
        await addTask({ creatorId: lead.id, ...task({ team: null }) }),
      ).toEqual({ ok: false, error: PICK_YOUR_TEAM });
    });

    it("refuses a member who leads nothing, and a lead from another year", async () => {
      const db = h.db();
      const { member } = await people();
      const lastYear = await makeUser(db);
      await makeMembership(db, {
        userId: lastYear.id,
        team: "kitchen",
        isLead: true,
        cycle: 0,
      });
      expect(await addTask({ creatorId: member.id, ...task() })).toEqual({
        ok: false,
        error: NOT_A_TASK_AUTHOR,
      });
      expect(await addTask({ creatorId: lastYear.id, ...task() })).toEqual({
        ok: false,
        error: NOT_A_TASK_AUTHOR,
      });
      expect(await h.db().select().from(schema.tasks)).toHaveLength(0);
    });

    it("gives a task only to an approved, current member", async () => {
      const db = h.db();
      const { captain, member } = await people();
      const pending = await makeUser(db, { approvalStatus: "pending" });
      const erased = await makeUser(db, { sanitised: true });

      expect(
        (
          await addTask({
            creatorId: captain.id,
            ...task({ assigneeId: member.id }),
          })
        ).ok,
      ).toBe(true);
      for (const assigneeId of [pending.id, erased.id, "not-a-uuid"]) {
        expect(
          await addTask({ creatorId: captain.id, ...task({ assigneeId }) }),
        ).toEqual({ ok: false, error: NOT_A_MEMBER });
      }
    });
  });

  describe("moveTask", () => {
    it("lets the person responsible move their task, and stamps Done", async () => {
      const { captain, member } = await people();
      const added = await addTask({
        creatorId: captain.id,
        ...task({ assigneeId: member.id }),
      });
      if (!added.ok) throw new Error(added.error);

      const moved = await moveTask({
        taskId: added.id,
        actorId: member.id,
        from: "open",
        to: "done",
      });
      expect(moved).toEqual({ ok: true });
      expect((await statusOf(added.id))!.status).toBe("done");
      expect((await statusOf(added.id))!.done).toBeInstanceOf(Date);

      await moveTask({
        taskId: added.id,
        actorId: member.id,
        from: "done",
        to: "in_progress",
      });
      expect(await statusOf(added.id)).toEqual({
        status: "in_progress",
        done: null,
      });
    });

    it("lets the team's lead move it, and nobody else on the camp", async () => {
      const db = h.db();
      const { captain, lead, member } = await people();
      const stranger = await makeUser(db);
      const otherLead = await makeUser(db);
      await makeMembership(db, {
        userId: otherLead.id,
        team: "structures",
        isLead: true,
      });
      const added = await addTask({ creatorId: captain.id, ...task() });
      if (!added.ok) throw new Error(added.error);

      for (const actor of [member, stranger, otherLead]) {
        expect(
          await moveTask({
            taskId: added.id,
            actorId: actor.id,
            from: "open",
            to: "in_progress",
          }),
        ).toEqual({ ok: false, error: CANNOT_MOVE });
      }
      expect(
        await moveTask({
          taskId: added.id,
          actorId: lead.id,
          from: "open",
          to: "in_progress",
        }),
      ).toEqual({ ok: true });
    });

    it("tells the second mover that someone got there first", async () => {
      const { captain, lead } = await people();
      const added = await addTask({ creatorId: captain.id, ...task() });
      if (!added.ok) throw new Error(added.error);

      await moveTask({
        taskId: added.id,
        actorId: lead.id,
        from: "open",
        to: "done",
      });
      const late = await moveTask({
        taskId: added.id,
        actorId: captain.id,
        from: "open",
        to: "in_progress",
      });
      expect(late).toEqual({ ok: false, error: TASK_MOVED });
      expect((await statusOf(added.id))!.status).toBe("done");
    });
  });

  describe("removeTask", () => {
    it("lets the author, the team's lead or a captain remove it, not the person responsible", async () => {
      const { captain, lead, member } = await people();
      const added = await addTask({
        creatorId: lead.id,
        ...task({ assigneeId: member.id }),
      });
      if (!added.ok) throw new Error(added.error);

      expect(
        await removeTask({ taskId: added.id, actorId: member.id }),
      ).toEqual({
        ok: false,
        error: CANNOT_REMOVE,
      });
      expect(
        await removeTask({ taskId: added.id, actorId: captain.id }),
      ).toEqual({
        ok: true,
      });
      expect((await statusOf(added.id))!.status).toBe("cancelled");
      expect(await removeTask({ taskId: added.id, actorId: lead.id })).toEqual({
        ok: false,
        error: TASK_GONE,
      });
      expect(
        await moveTask({
          taskId: added.id,
          actorId: lead.id,
          from: "open",
          to: "done",
        }),
      ).toEqual({ ok: false, error: TASK_GONE });
    });
  });

  describe("listBoardTasks", () => {
    it("shows open and doing tasks, recent Done, and no removed ones, soonest deadline first", async () => {
      const db = h.db();
      const { captain, member } = await people();
      const add = async (title: string, dueAt: Date | null) => {
        const r = await addTask({
          creatorId: captain.id,
          ...task({ title, dueAt, assigneeId: member.id }),
        });
        if (!r.ok) throw new Error(r.error);
        return r.id;
      };
      await add("No deadline", null);
      await add("Later", new Date("2026-10-10T00:00:00Z"));
      await add("Sooner", new Date("2026-10-01T00:00:00Z"));
      const oldDone = await add("Done long ago", null);
      const recentDone = await add("Done this week", null);
      const removed = await add("Removed", null);
      await db
        .update(schema.tasks)
        .set({ status: "done", completedAt: new Date("2026-08-01T00:00:00Z") })
        .where(eq(schema.tasks.id, oldDone));
      await db
        .update(schema.tasks)
        .set({ status: "done", completedAt: new Date("2026-09-20T00:00:00Z") })
        .where(eq(schema.tasks.id, recentDone));
      await removeTask({ taskId: removed, actorId: captain.id });

      const board = await listBoardTasks(NOW);
      expect(board.map((t) => t.title)).toEqual([
        "Sooner",
        "Later",
        "No deadline",
        "Done this week",
      ]);
      expect(board[0]).toMatchObject({
        assigneeName: member.displayName,
        createdByName: captain.displayName,
        team: "kitchen",
        status: "open",
      });
    });
  });

  it("offers only approved, current members as the person responsible", async () => {
    const db = h.db();
    const ok = await makeUser(db, { displayName: "Zed" });
    await makeUser(db, { displayName: "Pending", approvalStatus: "pending" });
    await makeUser(db, { displayName: "Gone", sanitised: true });
    await makeUser(db, { displayName: "System", isSystem: true });

    const members = await listAssignableMembers();
    expect(members).toEqual([{ id: ok.id, displayName: "Zed" }]);
  });
});
