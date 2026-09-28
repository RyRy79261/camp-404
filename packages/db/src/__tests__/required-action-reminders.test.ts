import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  QUESTIONNAIRE_REF_TYPE,
  REQUIRED_ACTION_REF_TYPE,
  requiredActionReminderNotification,
} from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import {
  DUE_SOON_WINDOW_MS,
  REMINDER_WINDOW_MS,
  remindDueSoon,
  remindRequiredActionsDueSoon,
} from "../questionnaire-lifecycle";
import * as schema from "../schema";

// The deadline nudge for required actions no questionnaire send stands behind
// (#134), on a real Postgres. What matters: a pending row with a deadline in
// the next 48 hours nudges its member once per 24 hours however often the page
// loads; nothing else does (a questionnaire gate is remindDueSoon's, and a
// done, overdue, far-off or undated row, or a departed or declined account,
// is left alone).

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
type Status = (typeof schema.requiredActionStatusEnum.enumValues)[number];

const NOW = new Date("2026-03-01T09:00:00Z");
const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const TITLE = "Sign the camp agreement";

async function action(
  db: DB,
  input: {
    userId: string;
    dueAt: Date | null;
    status?: Status;
    activationId?: string | null;
    actionKey?: string;
  },
) {
  const [row] = await db
    .insert(schema.requiredActions)
    .values({
      userId: input.userId,
      type: "acknowledgement",
      actionKey: input.actionKey ?? "camp_agreement",
      title: TITLE,
      status: input.status ?? "pending",
      dueAt: input.dueAt,
      activationId: input.activationId ?? null,
    })
    .returning();
  return row!;
}

async function deliveriesFor(db: DB, userId: string) {
  return await db
    .select()
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.userId, userId));
}

describe("remindRequiredActionsDueSoon", () => {
  const h = useTestDb();

  it("nudges the member about a required action due within 48 hours", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const row = await action(db, { userId: member.id, dueAt: inHours(30) });

    expect(await remindRequiredActionsDueSoon({ now: NOW })).toEqual({
      actions: 1,
      reminded: 1,
    });

    const rows = await deliveriesFor(db, member.id);
    expect(rows).toHaveLength(1);
    const payload = requiredActionReminderNotification({
      requiredActionId: row.id,
      title: TITLE,
      dueAt: inHours(30),
    });
    expect(rows[0]).toMatchObject({
      kind: payload.kind,
      title: TITLE,
      body: payload.body,
      refType: REQUIRED_ACTION_REF_TYPE,
      refId: row.id,
      broadcastId: null,
      channel: "both",
      presentation: "popup",
      emailStatus: "queued",
      pushStatus: "queued",
    });
    expect(rows[0]!.createdAt.getTime()).toBe(NOW.getTime());
  });

  it("is idempotent: a re-run in the same window sends nothing", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await action(db, { userId: member.id, dueAt: inHours(30) });

    await remindRequiredActionsDueSoon({ now: NOW });
    // Page loads five minutes and twenty-three hours later.
    expect(
      await remindRequiredActionsDueSoon({
        now: new Date(NOW.getTime() + 5 * 60 * 1000),
      }),
    ).toEqual({ actions: 1, reminded: 0 });
    expect(await remindRequiredActionsDueSoon({ now: inHours(23) })).toEqual({
      actions: 1,
      reminded: 0,
    });

    expect(await deliveriesFor(db, member.id)).toHaveLength(1);
  });

  it("nudges again once the 24-hour window has passed, until the deadline", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await action(db, { userId: member.id, dueAt: inHours(40) });

    await remindRequiredActionsDueSoon({ now: NOW });
    const next = new Date(NOW.getTime() + REMINDER_WINDOW_MS + 60 * 1000);
    expect(await remindRequiredActionsDueSoon({ now: next })).toEqual({
      actions: 1,
      reminded: 1,
    });
    // Past the deadline: overdue rows are left alone.
    expect(await remindRequiredActionsDueSoon({ now: inHours(41) })).toEqual({
      actions: 0,
      reminded: 0,
    });
    expect(await deliveriesFor(db, member.id)).toHaveLength(2);
  });

  it("dedupes per row: a second action for the same member still nudges", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await action(db, { userId: member.id, dueAt: inHours(30) });
    await remindRequiredActionsDueSoon({ now: NOW });
    await action(db, {
      userId: member.id,
      dueAt: inHours(20),
      actionKey: "gate_code",
    });

    expect(await remindRequiredActionsDueSoon({ now: inHours(1) })).toEqual({
      actions: 2,
      reminded: 1,
    });
    expect(await deliveriesFor(db, member.id)).toHaveLength(2);
  });

  it("leaves alone what is not a pending, dated, un-sent action due soon", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await action(db, { userId: member.id, dueAt: null, actionKey: "a" });
    await action(db, { userId: member.id, dueAt: inHours(72), actionKey: "b" });
    await action(db, { userId: member.id, dueAt: inHours(-1), actionKey: "c" });
    for (const status of ["completed", "waived", "expired"] as const) {
      await action(db, {
        userId: member.id,
        dueAt: inHours(10),
        status,
        actionKey: `done-${status}`,
      });
    }

    expect(await remindRequiredActionsDueSoon({ now: NOW })).toEqual({
      actions: 0,
      reminded: 0,
    });
    expect(await deliveriesFor(db, member.id)).toHaveLength(0);
  });

  it("does not nudge a departed, system or declined account", async () => {
    const db = h.db();
    const gone = await makeUser(db, { sanitised: true });
    const system = await makeUser(db, { isSystem: true });
    const declined = await makeUser(db, { approvalStatus: "rejected" });
    const pending = await makeUser(db, { approvalStatus: "pending" });
    for (const u of [gone, system, declined, pending]) {
      await action(db, { userId: u.id, dueAt: inHours(10) });
    }

    expect(await remindRequiredActionsDueSoon({ now: NOW })).toEqual({
      actions: 1,
      reminded: 1,
    });
    expect(await deliveriesFor(db, pending.id)).toHaveLength(1);
  });

  it("leaves a questionnaire gate to remindDueSoon, so nobody hears twice", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await makeActivation(db, {
      status: "open",
      dueAt: inHours(30),
    });
    await db.insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: act.questionnaireKey,
      version: "1",
      activationId: act.id,
      title: "Camp feedback",
      dueAt: inHours(30),
    });

    expect(await remindRequiredActionsDueSoon({ now: NOW })).toEqual({
      actions: 0,
      reminded: 0,
    });
    await remindDueSoon({ now: NOW });

    const rows = await deliveriesFor(db, member.id);
    expect(rows.map((r) => r.refType)).toEqual([QUESTIONNAIRE_REF_TYPE]);
  });

  it("looks exactly 48 hours ahead", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await action(db, {
      userId: member.id,
      dueAt: new Date(NOW.getTime() + DUE_SOON_WINDOW_MS),
      actionKey: "edge",
    });
    await action(db, {
      userId: member.id,
      dueAt: new Date(NOW.getTime() + DUE_SOON_WINDOW_MS + 1000),
      actionKey: "past-edge",
    });

    expect(await remindRequiredActionsDueSoon({ now: NOW })).toEqual({
      actions: 1,
      reminded: 1,
    });
  });
});
