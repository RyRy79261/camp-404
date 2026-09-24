import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { TASK_REF_TYPE, campDayStart } from "@camp404/core";
import type { NotificationKind } from "@camp404/types";
import * as schema from "../schema";
import { remindTaskDeadlines } from "../tasks";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// The daily task deadline nudge on a real Postgres (PGlite). What matters: the
// person responsible hears about a task the camp day before it is due and on
// the day, once each; a re-run never sends twice; moving the deadline or
// handing the task to someone else sends a fresh reminder; and nobody is
// nudged about a finished, removed, unassigned, far-off or overdue task, or on
// behalf of someone who is not an approved member.

const KIND: NotificationKind = "task_reminder";
// Thu 24 Sep 2026, 11:00 in camp (UTC+2): when the 09:00 UTC cron runs.
const NOW = new Date("2026-09-24T09:00:00Z");
const NEXT_DAY = new Date("2026-09-25T09:00:00Z");

type TaskStatus = (typeof schema.taskStatusEnum.enumValues)[number];

describe("remindTaskDeadlines", () => {
  const h = useTestDb();

  async function makeTask(input: {
    assigneeId: string | null;
    dueDay: string | null;
    status?: TaskStatus;
    title?: string;
  }) {
    const [row] = await h
      .db()
      .insert(schema.tasks)
      .values({
        title: input.title ?? "Pack the shade cloth",
        assigneeId: input.assigneeId,
        dueAt: input.dueDay ? campDayStart(input.dueDay) : null,
        status: input.status ?? "open",
      })
      .returning();
    return row!;
  }

  async function deliveriesFor(userId: string) {
    return await h
      .db()
      .select()
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, userId))
      .orderBy(schema.notificationDeliveries.createdAt);
  }

  it("reminds the person responsible the day before a task is due", async () => {
    const member = await makeUser(h.db());
    const task = await makeTask({
      assigneeId: member.id,
      dueDay: "2026-09-25",
    });

    expect(await remindTaskDeadlines({ now: NOW })).toEqual({
      tasks: 1,
      reminded: 1,
    });

    const rows = await deliveriesFor(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: KIND,
      title: "Pack the shade cloth",
      body: "Due tomorrow: Pack the shade cloth. Tap to open the task board.",
      refType: TASK_REF_TYPE,
      refId: task.id,
      broadcastId: null,
      channel: "both",
      presentation: "feed",
      emailStatus: "queued",
      pushStatus: "queued",
    });
  });

  it("never sends twice when the run is repeated", async () => {
    const member = await makeUser(h.db());
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-25" });

    await remindTaskDeadlines({ now: NOW });
    expect(await remindTaskDeadlines({ now: NOW })).toEqual({
      tasks: 1,
      reminded: 0,
    });
    expect(await deliveriesFor(member.id)).toHaveLength(1);
  });

  it("reminds on the day a task is due", async () => {
    const member = await makeUser(h.db());
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-24" });

    await remindTaskDeadlines({ now: NOW });

    const rows = await deliveriesFor(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toBe(
      "Due today: Pack the shade cloth. Tap to open the task board.",
    );
    const [record] = await h.db().select().from(schema.taskDeadlineReminders);
    expect(record).toMatchObject({ dueDay: "2026-09-24", stage: "due_day" });
  });

  it("sends the on-the-day reminder the day after the day-before one", async () => {
    const member = await makeUser(h.db());
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-25" });

    await remindTaskDeadlines({ now: NOW });
    await remindTaskDeadlines({ now: NEXT_DAY });

    const rows = await deliveriesFor(member.id);
    expect(rows.map((r) => r.body)).toEqual([
      "Due tomorrow: Pack the shade cloth. Tap to open the task board.",
      "Due today: Pack the shade cloth. Tap to open the task board.",
    ]);
  });

  it("reminds nobody about a finished, removed, unassigned, far-off or overdue task", async () => {
    const member = await makeUser(h.db());
    await makeTask({
      assigneeId: member.id,
      dueDay: "2026-09-25",
      status: "done",
    });
    await makeTask({
      assigneeId: member.id,
      dueDay: "2026-09-25",
      status: "cancelled",
    });
    await makeTask({ assigneeId: null, dueDay: "2026-09-25" });
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-26" });
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-23" });
    await makeTask({ assigneeId: member.id, dueDay: null });

    expect(await remindTaskDeadlines({ now: NOW })).toEqual({
      tasks: 0,
      reminded: 0,
    });
    expect(
      await h.db().select().from(schema.notificationDeliveries),
    ).toHaveLength(0);
  });

  it("reminds a task in the Doing column", async () => {
    const member = await makeUser(h.db());
    await makeTask({
      assigneeId: member.id,
      dueDay: "2026-09-25",
      status: "in_progress",
    });
    await remindTaskDeadlines({ now: NOW });
    expect(await deliveriesFor(member.id)).toHaveLength(1);
  });

  it("does not remind a sanitised or unapproved assignee", async () => {
    const lostCat = await makeUser(h.db(), { sanitised: true });
    const pending = await makeUser(h.db(), { approvalStatus: "pending" });
    const system = await makeUser(h.db(), { isSystem: true });
    for (const person of [lostCat, pending, system]) {
      await makeTask({ assigneeId: person.id, dueDay: "2026-09-25" });
    }

    expect(await remindTaskDeadlines({ now: NOW })).toEqual({
      tasks: 0,
      reminded: 0,
    });
    expect(
      await h.db().select().from(schema.notificationDeliveries),
    ).toHaveLength(0);
  });

  it("reminds again when the deadline moves to another day", async () => {
    const member = await makeUser(h.db());
    const task = await makeTask({
      assigneeId: member.id,
      dueDay: "2026-09-25",
    });
    await remindTaskDeadlines({ now: NOW });

    await h
      .db()
      .update(schema.tasks)
      .set({ dueAt: campDayStart("2026-09-26") })
      .where(eq(schema.tasks.id, task.id));
    // The next day, the moved task is a day away again: a fresh day-before.
    await remindTaskDeadlines({ now: NEXT_DAY });

    const rows = await deliveriesFor(member.id);
    expect(rows.map((r) => r.body)).toEqual([
      "Due tomorrow: Pack the shade cloth. Tap to open the task board.",
      "Due tomorrow: Pack the shade cloth. Tap to open the task board.",
    ]);
  });

  it("reminds the new person when the task is handed on", async () => {
    const first = await makeUser(h.db());
    const second = await makeUser(h.db());
    const task = await makeTask({ assigneeId: first.id, dueDay: "2026-09-25" });
    await remindTaskDeadlines({ now: NOW });

    await h
      .db()
      .update(schema.tasks)
      .set({ assigneeId: second.id })
      .where(eq(schema.tasks.id, task.id));
    expect(await remindTaskDeadlines({ now: NOW })).toEqual({
      tasks: 1,
      reminded: 1,
    });

    expect(await deliveriesFor(first.id)).toHaveLength(1);
    const handedOn = await deliveriesFor(second.id);
    expect(handedOn).toHaveLength(1);
    expect(handedOn[0]!.refId).toBe(task.id);
  });

  it("reads the day in camp time: 00:30 in camp is already the due day", async () => {
    const member = await makeUser(h.db());
    // Camp midnight on the 25th is 22:00 UTC on the 24th; 22:30 UTC is 00:30
    // on the 25th in camp, so a task due on the 25th is due today.
    await makeTask({ assigneeId: member.id, dueDay: "2026-09-25" });

    await remindTaskDeadlines({ now: new Date("2026-09-24T22:30:00Z") });

    const [record] = await h.db().select().from(schema.taskDeadlineReminders);
    expect(record).toMatchObject({ dueDay: "2026-09-25", stage: "due_day" });
    const rows = await deliveriesFor(member.id);
    expect(rows[0]!.body).toMatch(/^Due today:/);
  });
});
