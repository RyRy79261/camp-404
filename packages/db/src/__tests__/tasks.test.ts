import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  CANNOT_EDIT,
  CANNOT_MOVE,
  CANNOT_REMOVE,
  NOT_A_MEMBER,
  NOT_A_TASK_AUTHOR,
  NOT_YOUR_TEAM,
  NOT_YOUR_TEAM_TO_MOVE,
  PICK_YOUR_TEAM,
  TASK_EDITED,
  TASK_GONE,
  TASK_MOVED,
  TEAM_NOT_ACTIVE,
  addTask,
  editTask,
  listAssignableMembers,
  listBoardTasks,
  listMyOpenTasks,
  moveTask,
  removeTask,
  type BoardTask,
} from "../tasks";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser } from "./_factories";

// The shared task board's data layer on a real Postgres (PGlite). What
// matters: who may add, move, edit and remove; that a move and an edit are
// compare-and-set, and a move does not spoil an open edit; and
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

  describe("editTask", () => {
    const ALL_ACTIVE = ["kitchen", "structures", "finance"] as NonNullable<
      BoardTask["team"]
    >[];

    async function stored(id: string) {
      const [row] = await h
        .db()
        .select()
        .from(schema.tasks)
        .where(eq(schema.tasks.id, id));
      return row!;
    }

    async function added(creatorId: string, overrides = {}) {
      const r = await addTask({ creatorId, ...task(overrides) });
      if (!r.ok) throw new Error(r.error);
      return r.id;
    }

    function edit(
      taskId: string,
      actorId: string,
      overrides: Partial<Parameters<typeof editTask>[0]> = {},
    ) {
      return editTask({
        taskId,
        actorId,
        version: 1,
        title: "Buy more gas bottles",
        description: "Three, not two.",
        team: "kitchen",
        assigneeId: null,
        dueAt: new Date("2026-10-01T22:00:00Z"),
        activeTeams: ALL_ACTIVE,
        ...overrides,
      });
    }

    it("lets a captain edit any task, clear its team, and bumps the version", async () => {
      const { captain, lead, member } = await people();
      const id = await added(lead.id);

      expect(
        await edit(id, captain.id, { team: null, assigneeId: member.id }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toMatchObject({
        title: "Buy more gas bottles",
        description: "Three, not two.",
        team: null,
        assigneeId: member.id,
        dueAt: new Date("2026-10-01T22:00:00Z"),
        version: 2,
        status: "open",
      });
      expect((await listBoardTasks(NOW))[0]!.version).toBe(2);
    });

    it("lets a lead edit their team's task, and not another team's", async () => {
      const db = h.db();
      const { captain, lead } = await people();
      const kitchen = await added(captain.id);
      const finance = await added(captain.id, { team: "finance" });

      expect(await edit(kitchen, lead.id)).toEqual({ ok: true });
      expect(await edit(finance, lead.id, { team: "finance" })).toEqual({
        ok: false,
        error: CANNOT_EDIT,
      });
      expect((await stored(finance)).title).toBe("Buy gas bottles");

      // A lead of several teams edits across all of them.
      await makeMembership(db, {
        userId: lead.id,
        team: "finance",
        isLead: true,
      });
      expect(await edit(finance, lead.id, { team: "finance" })).toEqual({
        ok: true,
      });
    });

    it("lets a lead move a task only to a team they lead", async () => {
      const db = h.db();
      const { lead } = await people();
      const id = await added(lead.id);

      expect(await edit(id, lead.id, { team: "structures" })).toEqual({
        ok: false,
        error: NOT_YOUR_TEAM_TO_MOVE,
      });
      expect(await edit(id, lead.id, { team: null })).toEqual({
        ok: false,
        error: PICK_YOUR_TEAM,
      });
      expect((await stored(id)).team).toBe("kitchen");

      await makeMembership(db, {
        userId: lead.id,
        team: "structures",
        isLead: true,
      });
      expect(await edit(id, lead.id, { team: "structures" })).toEqual({
        ok: true,
      });
      expect((await stored(id)).team).toBe("structures");
    });

    it("lets the author, no longer a lead, edit the task but not change its team", async () => {
      const db = h.db();
      const { lead } = await people();
      const id = await added(lead.id);
      await db
        .update(schema.teamMemberships)
        .set({ isLead: false })
        .where(eq(schema.teamMemberships.userId, lead.id));

      expect(await edit(id, lead.id, { team: "structures" })).toEqual({
        ok: false,
        error: NOT_YOUR_TEAM_TO_MOVE,
      });
      expect(await edit(id, lead.id, { team: null })).toEqual({
        ok: false,
        error: PICK_YOUR_TEAM,
      });
      expect(await edit(id, lead.id)).toEqual({ ok: true });
      expect((await stored(id)).title).toBe("Buy more gas bottles");
    });

    it("refuses the person responsible, who may only move it", async () => {
      const { captain, member } = await people();
      const id = await added(captain.id, { assigneeId: member.id });

      expect(await edit(id, member.id, { assigneeId: member.id })).toEqual({
        ok: false,
        error: CANNOT_EDIT,
      });
      expect(await stored(id)).toMatchObject({
        title: "Buy gas bottles",
        version: 1,
      });
    });

    it("tells the second editor someone else edited first, and changes nothing", async () => {
      const { captain, lead } = await people();
      const id = await added(captain.id);

      expect(await edit(id, lead.id, { title: "First" })).toEqual({
        ok: true,
      });
      expect(
        await edit(id, captain.id, { title: "Second", version: 1 }),
      ).toEqual({ ok: false, error: TASK_EDITED });
      expect(await stored(id)).toMatchObject({ title: "First", version: 2 });

      // With the version they now see, the second editor gets through.
      expect(
        await edit(id, captain.id, { title: "Second", version: 2 }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toMatchObject({ title: "Second", version: 3 });
    });

    it("does not bump the version on a move, so an open edit still saves", async () => {
      const { captain, member } = await people();
      const id = await added(captain.id, { assigneeId: member.id });

      await moveTask({
        taskId: id,
        actorId: member.id,
        from: "open",
        to: "in_progress",
      });
      expect(await stored(id)).toMatchObject({
        status: "in_progress",
        version: 1,
      });
      expect(await edit(id, captain.id, { version: 1 })).toEqual({
        ok: true,
      });
      expect(await stored(id)).toMatchObject({
        status: "in_progress",
        version: 2,
      });
    });

    it("refuses a lead removed between opening the edit and saving it", async () => {
      const db = h.db();
      const { captain, lead } = await people();
      const id = await added(captain.id);
      // The lead could edit it a moment ago.
      expect(await edit(id, lead.id, { title: "Before" })).toEqual({
        ok: true,
      });

      await db
        .update(schema.teamMemberships)
        .set({ isLead: false })
        .where(
          and(
            eq(schema.teamMemberships.userId, lead.id),
            eq(schema.teamMemberships.team, "kitchen"),
          ),
        );
      expect(await edit(id, lead.id, { title: "After", version: 2 })).toEqual({
        ok: false,
        error: CANNOT_EDIT,
      });
      expect((await stored(id)).title).toBe("Before");
    });

    it("gives the task only to an approved, current member", async () => {
      const db = h.db();
      const { captain, member } = await people();
      const id = await added(captain.id);
      const pending = await makeUser(db, { approvalStatus: "pending" });

      expect(await edit(id, captain.id, { assigneeId: pending.id })).toEqual({
        ok: false,
        error: NOT_A_MEMBER,
      });
      expect(await stored(id)).toMatchObject({ assigneeId: null, version: 1 });
      expect(await edit(id, captain.id, { assigneeId: member.id })).toEqual({
        ok: true,
      });
    });

    it("keeps a switched-off team on a task, but moves none onto one", async () => {
      const { captain } = await people();
      const id = await added(captain.id);
      const withoutKitchen = ALL_ACTIVE.filter((t) => t !== "kitchen");
      const withoutStructures = ALL_ACTIVE.filter((t) => t !== "structures");

      expect(
        await edit(id, captain.id, {
          team: "structures",
          activeTeams: withoutStructures,
        }),
      ).toEqual({ ok: false, error: TEAM_NOT_ACTIVE });
      expect((await stored(id)).team).toBe("kitchen");

      expect(
        await edit(id, captain.id, {
          team: "kitchen",
          activeTeams: withoutKitchen,
        }),
      ).toEqual({ ok: true });
      expect((await stored(id)).team).toBe("kitchen");
    });

    it("keeps a person responsible who has since left the approved list, but gives the task to nobody new like them", async () => {
      const db = h.db();
      const { captain } = await people();
      const erased = await makeUser(db);
      const sentBack = await makeUser(db);
      const id = await added(captain.id, { assigneeId: erased.id });
      await db
        .update(schema.users)
        .set({ sanitised: true })
        .where(eq(schema.users.id, erased.id));
      await db
        .update(schema.users)
        .set({ approvalStatus: "pending" })
        .where(eq(schema.users.id, sentBack.id));

      // A title fix with the same person responsible still saves.
      expect(
        await edit(id, captain.id, {
          title: "Fixed title",
          assigneeId: erased.id,
        }),
      ).toEqual({ ok: true });
      expect(await stored(id)).toMatchObject({
        title: "Fixed title",
        assigneeId: erased.id,
        version: 2,
      });

      // Handing it to another person who is not approved is still refused.
      expect(
        await edit(id, captain.id, { version: 2, assigneeId: sentBack.id }),
      ).toEqual({ ok: false, error: NOT_A_MEMBER });
      expect(await stored(id)).toMatchObject({
        assigneeId: erased.id,
        version: 2,
      });
    });

    it("says a removed task is gone", async () => {
      const { captain } = await people();
      const id = await added(captain.id);
      await removeTask({ taskId: id, actorId: captain.id });
      expect(await edit(id, captain.id)).toEqual({
        ok: false,
        error: TASK_GONE,
      });
      expect(await edit("not-a-uuid", captain.id)).toEqual({
        ok: false,
        error: TASK_GONE,
      });
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

  describe("listMyOpenTasks", () => {
    it("lists only the viewer's unfinished tasks, soonest deadline first, with the total", async () => {
      const db = h.db();
      const { captain, member, lead } = await people();
      const add = async (
        title: string,
        dueAt: Date | null,
        assigneeId: string | null = member.id,
      ) => {
        const r = await addTask({
          creatorId: captain.id,
          ...task({ title, dueAt, assigneeId }),
        });
        if (!r.ok) throw new Error(r.error);
        return r.id;
      };
      const firstUndated = await add("Undated, older", null);
      const secondUndated = await add("Undated, newer", null);
      await add("Later", new Date("2026-10-10T00:00:00Z"));
      const doing = await add(
        "Sooner, doing",
        new Date("2026-10-01T00:00:00Z"),
      );
      const done = await add("Done", new Date("2026-09-24T00:00:00Z"));
      const removed = await add("Removed", new Date("2026-09-24T00:00:00Z"));
      await add("Someone else's", new Date("2026-09-24T00:00:00Z"), lead.id);
      await add("Nobody's", new Date("2026-09-24T00:00:00Z"), null);
      // Pin the creation order of the two undated ones, which breaks their tie.
      await db
        .update(schema.tasks)
        .set({ createdAt: new Date("2026-09-01T00:00:00Z") })
        .where(eq(schema.tasks.id, firstUndated));
      await db
        .update(schema.tasks)
        .set({ createdAt: new Date("2026-09-02T00:00:00Z") })
        .where(eq(schema.tasks.id, secondUndated));
      expect(
        (
          await moveTask({
            taskId: doing,
            actorId: member.id,
            from: "open",
            to: "in_progress",
          })
        ).ok,
      ).toBe(true);
      expect(
        (
          await moveTask({
            taskId: done,
            actorId: member.id,
            from: "open",
            to: "done",
          })
        ).ok,
      ).toBe(true);
      await removeTask({ taskId: removed, actorId: captain.id });

      const all = await listMyOpenTasks(member.id);
      expect(all.items.map((t) => [t.title, t.status])).toEqual([
        ["Sooner, doing", "in_progress"],
        ["Later", "open"],
        ["Undated, older", "open"],
        ["Undated, newer", "open"],
      ]);
      expect(all.items[0]).toMatchObject({
        id: doing,
        team: "kitchen",
        dueAt: new Date("2026-10-01T00:00:00Z"),
      });
      expect(all.total).toBe(4);

      const firstTwo = await listMyOpenTasks(member.id, 2);
      expect(firstTwo.items.map((t) => t.title)).toEqual([
        "Sooner, doing",
        "Later",
      ]);
      expect(firstTwo.total).toBe(4);
    });

    it("gives someone with no tasks, or an id that is not a user, nothing", async () => {
      const { member } = await people();
      expect(await listMyOpenTasks(member.id)).toEqual({ items: [], total: 0 });
      expect(await listMyOpenTasks("not-a-uuid")).toEqual({
        items: [],
        total: 0,
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
