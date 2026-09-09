import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import {
  REMINDER_REF_TYPE,
  REMINDER_WINDOW_MS,
  reminderBody,
  sendReminder,
} from "../questionnaire-lifecycle";
import * as schema from "../schema";

// The §7.4 reminder against real Postgres. Everything worth testing here is a
// WHERE clause over rows a mock would happily invent: which gate statuses count
// as outstanding, and whether a delivery written 3 hours ago is still inside the
// 24-hour window. The dedup rule is the feature — a reminder that fires twice
// is worse than no reminder — so it gets the most coverage.

const KEY = "feedback";
const TITLE = "Camp feedback";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

/** A required_actions gate for one member on one activation. */
async function gate(
  db: DB,
  input: {
    userId: string;
    activationId: string;
    status?: (typeof schema.requiredActionStatusEnum.enumValues)[number];
  },
): Promise<void> {
  await db.insert(schema.requiredActions).values({
    userId: input.userId,
    type: "questionnaire",
    actionKey: KEY,
    version: "1",
    activationId: input.activationId,
    title: TITLE,
    status: input.status ?? "pending",
  });
}

/** Everyone who holds a reminder delivery for this activation. */
async function remindedUserIds(db: DB, activationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.notificationDeliveries.userId })
    .from(schema.notificationDeliveries)
    .innerJoin(
      schema.broadcasts,
      eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
    )
    .where(
      and(
        eq(schema.broadcasts.kind, "reminder"),
        eq(schema.notificationDeliveries.refId, activationId),
      ),
    );
  return rows.map((r) => r.userId).sort();
}

describe("sendReminder — the dedup window", () => {
  const h = useTestDb();

  it("sends once, then refuses the second call inside 24h and says why", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const slow = await makeUser(db, { displayName: "Grace" });
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: slow.id, activationId: act.id });

    const first = new Date("2026-03-01T09:00:00Z");
    const one = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: first,
    });
    expect(one).toMatchObject({ ok: true, outcome: "sent", sent: 1 });

    // The captain taps again three hours later — a page refresh, a second
    // device, an impatient thumb. Nothing must go out.
    const threeHoursLater = new Date(first.getTime() + 3 * 60 * 60 * 1000);
    const two = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: threeHoursLater,
    });

    expect(two.ok).toBe(true);
    if (!two.ok) throw new Error("unreachable");
    expect(two.outcome).toBe("recently_reminded");
    expect(two.sent).toBe(0);
    if (two.outcome !== "recently_reminded") throw new Error("unreachable");
    expect(two.suppressed).toBe(1);
    // Not a silent no-op: the caller is handed the moment the next nudge is
    // allowed, so it can tell the captain WHEN rather than just "nothing".
    expect(two.nextAllowedAt).toEqual(
      new Date(first.getTime() + REMINDER_WINDOW_MS),
    );

    // Exactly one delivery, from exactly one broadcast.
    const deliveries = await db.select().from(schema.notificationDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(await db.select().from(schema.broadcasts)).toHaveLength(1);
  });

  it("sends again once the window has passed", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const slow = await makeUser(db);
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: slow.id, activationId: act.id });

    const first = new Date("2026-03-01T09:00:00Z");
    await sendReminder({ activationId: act.id, senderId: captain.id, now: first });

    const justPast = new Date(first.getTime() + REMINDER_WINDOW_MS + 1000);
    const again = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: justPast,
    });
    expect(again).toMatchObject({ ok: true, outcome: "sent", sent: 1 });
    expect(await db.select().from(schema.notificationDeliveries)).toHaveLength(2);
  });

  it("nudges only the member outside the window, and reports the one it skipped", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const reminded = await makeUser(db, { displayName: "Ada" });
    const fresh = await makeUser(db, { displayName: "Grace" });
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: reminded.id, activationId: act.id });

    const first = new Date("2026-03-01T09:00:00Z");
    await sendReminder({ activationId: act.id, senderId: captain.id, now: first });

    // Grace is added to the send afterwards — the window is per (member,
    // activation), so Ada's fresh reminder must not silence Grace's first one.
    await gate(db, { userId: fresh.id, activationId: act.id });
    const second = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: new Date(first.getTime() + 60 * 60 * 1000),
    });

    expect(second).toMatchObject({
      ok: true,
      outcome: "sent",
      sent: 1,
      suppressed: 1,
    });
    expect(await remindedUserIds(db, act.id)).toEqual(
      [reminded.id, fresh.id].sort(),
    );
  });

  it("does not let another activation's reminder suppress this one", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const other = await makeActivation(db, {
      status: "open",
      questionnaireKey: "other",
      cycle: 1,
    });
    const act = await makeActivation(db, { status: "open", cycle: 1 });

    // A reminder for a DIFFERENT send, minutes ago. required_actions is unique
    // on (user, actionKey), so the member holds one gate per key.
    await db.insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "other",
      version: "1",
      activationId: other.id,
      title: "Other",
    });
    const now = new Date("2026-03-01T09:00:00Z");
    await sendReminder({ activationId: other.id, senderId: captain.id, now });

    await gate(db, { userId: member.id, activationId: act.id });
    const res = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: new Date(now.getTime() + 60_000),
    });
    expect(res).toMatchObject({ ok: true, outcome: "sent", sent: 1 });
  });
});

describe("sendReminder — who is outstanding", () => {
  const h = useTestDb();

  it("targets only the pending gates — never completed, waived or expired", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const pending = await makeUser(db, { displayName: "Pending" });
    const done = await makeUser(db, { displayName: "Done" });
    const waived = await makeUser(db, { displayName: "Waived" });
    const expired = await makeUser(db, { displayName: "Expired" });
    const act = await makeActivation(db, { status: "open", cycle: 1 });

    await gate(db, { userId: pending.id, activationId: act.id });
    await gate(db, {
      userId: done.id,
      activationId: act.id,
      status: "completed",
    });
    // Wave 3's tally puts waived + expired in a CLOSED bucket for a reason: a
    // waiver is a captain's decision that this member need not answer, and an
    // expired gate belongs to a send that is over. Neither gets pushed at.
    await gate(db, { userId: waived.id, activationId: act.id, status: "waived" });
    await gate(db, {
      userId: expired.id,
      activationId: act.id,
      status: "expired",
    });

    const res = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: new Date("2026-03-01T09:00:00Z"),
    });
    expect(res).toMatchObject({ ok: true, outcome: "sent", sent: 1 });
    expect(await remindedUserIds(db, act.id)).toEqual([pending.id]);
  });

  it("skips a gate belonging to a different send of the same questionnaire", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const stale = await makeActivation(db, { status: "closed", cycle: 1 });
    const live = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: member.id, activationId: stale.id });

    const res = await sendReminder({
      activationId: live.id,
      senderId: captain.id,
      now: new Date("2026-03-01T09:00:00Z"),
    });
    expect(res).toEqual({
      ok: true,
      outcome: "nobody_pending",
      sent: 0,
      suppressed: 0,
    });
  });

  it("leaves a sanitised (departed) member alone", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const gone = await makeUser(db, { sanitised: true });
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: gone.id, activationId: act.id });

    expect(
      await sendReminder({
        activationId: act.id,
        senderId: captain.id,
        now: new Date("2026-03-01T09:00:00Z"),
      }),
    ).toMatchObject({ outcome: "nobody_pending" });
  });

  it("is an honest no-op, not an error, when everyone has answered", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const done = await makeUser(db);
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, {
      userId: done.id,
      activationId: act.id,
      status: "completed",
    });

    const res = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now: new Date("2026-03-01T09:00:00Z"),
    });
    expect(res).toEqual({
      ok: true,
      outcome: "nobody_pending",
      sent: 0,
      suppressed: 0,
    });
    // Nothing was written — no empty broadcast left behind to confuse the
    // announcements list or the dispatch cron.
    expect(await db.select().from(schema.broadcasts)).toHaveLength(0);
  });
});

describe("sendReminder — what it writes", () => {
  const h = useTestDb();

  it("reuses the broadcast spine, already dispatched, deep-linked at the send", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const dueAt = new Date("2026-03-10T12:00:00Z");
    const act = await makeActivation(db, { status: "open", cycle: 1, dueAt });
    await gate(db, { userId: member.id, activationId: act.id });

    const now = new Date("2026-03-01T09:00:00Z");
    const res = await sendReminder({
      activationId: act.id,
      senderId: captain.id,
      now,
    });
    expect(res.ok).toBe(true);

    const [broadcast] = await db.select().from(schema.broadcasts);
    expect(broadcast).toMatchObject({
      kind: "reminder",
      scope: "individual",
      senderId: captain.id,
      title: TITLE,
      body: reminderBody(TITLE, dueAt),
      refType: REMINDER_REF_TYPE,
      refId: act.id,
    });
    // Published AND dispatched inline, exactly as publishAnnouncement does, so
    // dispatchDueBroadcasts (published + dispatched_at IS NULL) cannot fan the
    // same reminder out a second time.
    expect(broadcast!.publishedAt).toEqual(now);
    expect(broadcast!.dispatchedAt).toEqual(now);

    const targets = await db.select().from(schema.broadcastTargets);
    expect(targets).toEqual([{ broadcastId: broadcast!.id, userId: member.id }]);

    const [delivery] = await db.select().from(schema.notificationDeliveries);
    expect(delivery).toMatchObject({
      userId: member.id,
      channel: "both",
      presentation: "popup",
      pushStatus: "queued",
      refType: REMINDER_REF_TYPE,
      refId: act.id,
    });
    // createdAt IS the dedup clock, so it must be the injected `now` rather
    // than the column default.
    expect(delivery!.createdAt).toEqual(now);
  });

  it("refuses a closed send with a reason that isn't 'everyone answered'", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const act = await makeActivation(db, { status: "closed", cycle: 1 });

    expect(
      await sendReminder({ activationId: act.id, senderId: captain.id }),
    ).toEqual({
      ok: false,
      error: "This send is closed, so nobody is waiting on it any more.",
    });
  });
});

describe("reminderBody", () => {
  it("names the questionnaire and its deadline", () => {
    const body = reminderBody(TITLE, new Date("2026-03-10T12:00:00Z"));
    expect(body).toContain(TITLE);
    expect(body).toMatch(/due 10 Mar/);
    expect(body).toMatch(/Tap to complete\.$/);
  });

  it("says something true when the send has no deadline", () => {
    const body = reminderBody(TITLE, null);
    expect(body).toContain(TITLE);
    expect(body).not.toMatch(/due/);
    expect(body).not.toMatch(/undefined|null|Invalid/);
  });
});
