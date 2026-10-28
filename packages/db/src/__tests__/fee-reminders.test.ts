import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  FEE_PAYMENT_ACTION_KEY,
  FEE_PAYMENT_REF_TYPE,
  FEE_PLEDGE_ACTION_KEY,
  FEE_PLEDGE_REF_TYPE,
  FINANCE_TEAM,
  formatMoney,
  REMINDERS_NEED_COLLECTING,
  type AuditAction,
} from "@camp404/core";
import type { ParticipationStatus, Team } from "@camp404/types";
import type { CampConfig } from "../camp-config";
import { NOT_A_MONEY_KEEPER, savePledge, setCollectingFees } from "../dues";
import {
  askForPledges,
  feeReminderPreview,
  remindFeesDueSoon,
  remindFeesOwed,
} from "../fee-reminders";
import { recordPayment } from "../payments";
import * as schema from "../schema";
import { assignTeam, setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// Camp fee reminders on a real Postgres (PGlite): who each button reaches
// (never Not coming, never a subsidy), one notice each about the member's own
// next payment, never stacking, the nudge closed by pledging or sending a
// proof, the general Telegram post with no names or amounts, the automatic
// reminder once per instalment, and the audit rows.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 2027;

async function campYear(db: DB) {
  const cycles: CampConfig["cycles"] = [
    { year: YEAR, startedAt: `${YEAR}-01-01T00:00:00.000Z`, endedAt: null },
  ];
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, cycles } })
    .where(eq(schema.campSettings.id, true));
}

async function place(db: DB, userId: string, status: ParticipationStatus) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle: YEAR,
    status,
    intent: status === "not_attending" ? "no" : "yes",
  });
}

describe("fee reminders", () => {
  const h = useTestDb();

  async function camp() {
    const db = h.db();
    await campYear(db);
    // The captain and the Finance lead said Not coming, so the buttons reach
    // only the members below.
    const captain = await makeUser(db, { rank: "captain", displayName: "Cap" });
    await place(db, captain.id, "not_attending");
    const financeLead = await makeUser(db, { displayName: "Fin" });
    await place(db, financeLead.id, "not_attending");
    await assignTeam({
      userId: financeLead.id,
      team: FINANCE_TEAM as Team,
    });
    await setLead({
      userId: financeLead.id,
      team: FINANCE_TEAM as Team,
      isLead: true,
    });
    const lerato = await makeUser(db, {
      displayName: "Lerato",
      refCode: "C404-M017",
      telegramUserId: "111",
      telegramDmAt: new Date(),
    });
    await place(db, lerato.id, "applied");
    const sam = await makeUser(db, { displayName: "Sam" });
    await place(db, sam.id, "applied");
    const maybe = await makeUser(db, { displayName: "Mo" });
    await place(db, maybe.id, "maybe");
    const bongi = await makeUser(db, { displayName: "Bongi" });
    await place(db, bongi.id, "not_attending");
    const quiet = await makeUser(db, { displayName: "Quiet" });
    for (const [who, amountCents, payBy, subsidy] of [
      [lerato, 720_000, "part_by_end_nov", false],
      [sam, 0, null, true],
      [maybe, 400_000, "all_by_end_dec", false],
      [bongi, 500_000, "all_by_end_nov", false],
    ] as const) {
      const saved = await savePledge({
        userId: who.id,
        cycle: YEAR,
        pledge: { amountCents, payBy, subsidy },
      });
      expect(saved.ok).toBe(true);
    }
    return { captain, financeLead, lerato, sam, maybe, bongi, quiet };
  }

  async function collecting(actorId: string) {
    expect(
      await setCollectingFees({
        cycle: YEAR,
        on: true,
        expectedVersion: 0,
        actorId,
      }),
    ).toEqual({ ok: true, version: 1 });
  }

  async function noticesOf(userId: string) {
    return h
      .db()
      .select({
        kind: schema.notificationDeliveries.kind,
        title: schema.notificationDeliveries.title,
        body: schema.notificationDeliveries.body,
        refType: schema.notificationDeliveries.refType,
        readAt: schema.notificationDeliveries.readAt,
      })
      .from(schema.notificationDeliveries)
      .where(eq(schema.notificationDeliveries.userId, userId));
  }

  async function nudge(userId: string, actionKey: string) {
    const [row] = await h
      .db()
      .select({
        status: schema.requiredActions.status,
        blocking: schema.requiredActions.blocking,
      })
      .from(schema.requiredActions)
      .where(
        and(
          eq(schema.requiredActions.userId, userId),
          eq(schema.requiredActions.actionKey, actionKey),
        ),
      );
    return row ?? null;
  }

  async function audits(action: AuditAction) {
    return h
      .db()
      .select({ metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  async function addPlace(chatId: string) {
    await h.db().insert(schema.telegramChats).values({
      chatId,
      kind: "announcement_channel",
      title: "Camp 404 Announcements",
      postsSince: new Date(),
    });
  }

  it("previews who each button reaches, who is left out and who has Ol' Jeb", async () => {
    const { lerato, maybe } = await camp();
    const preview = await feeReminderPreview(YEAR, "2026-10-28");
    expect(preview.collecting).toBe(false);
    expect(preview.remind.reach).toEqual([
      {
        userId: lerato.id,
        name: "Lerato",
        next: expect.objectContaining({
          kind: "due",
          dueOn: "2026-11-30",
          amountCents: 360_000,
        }),
        owingCents: 720_000,
        telegram: true,
      },
      expect.objectContaining({ userId: maybe.id, telegram: false }),
    ]);
    expect(preview.remind.notComing).toEqual(["Bongi", "Cap", "Fin"]);
    expect(preview.remind.subsidy).toEqual(["Sam"]);
    // Asked to pledge: only who has no pledge and did not say Not coming.
    expect(preview.ask.reach.map((p) => p.name)).toEqual(["Quiet"]);
    expect(preview.telegramPlaces).toBe(0);
  });

  it("refuses to remind while collecting is off, and anyone but Finance", async () => {
    const { captain, lerato } = await camp();
    expect(
      await remindFeesOwed({
        cycle: YEAR,
        actorId: captain.id,
        postInTelegram: false,
      }),
    ).toEqual({ ok: false, error: REMINDERS_NEED_COLLECTING });
    await collecting(captain.id);
    expect(
      await remindFeesOwed({
        cycle: YEAR,
        actorId: lerato.id,
        postInTelegram: false,
      }),
    ).toEqual({ ok: false, error: NOT_A_MONEY_KEEPER });
    expect(await askForPledges({ cycle: YEAR, actorId: lerato.id })).toEqual({
      ok: false,
      error: NOT_A_MONEY_KEEPER,
    });
    expect(await noticesOf(lerato.id)).toEqual([]);
  });

  it("reminds who owes about their own next payment, once, and closes on a proof", async () => {
    const { financeLead, lerato, sam, maybe, bongi } = await camp();
    await collecting(financeLead.id);
    await addPlace("-100");
    // A fixed day, so the next payment is not overdue once the real date
    // passes 30 Nov.
    const now = new Date("2026-10-28T10:00:00+02:00");
    expect(
      await remindFeesOwed({
        cycle: YEAR,
        actorId: financeLead.id,
        postInTelegram: true,
        now,
      }),
    ).toEqual({ ok: true, reminded: 2, notified: 2, posted: 1 });

    expect(await noticesOf(lerato.id)).toEqual([
      {
        kind: "fee_reminder",
        title: `Your camp fee: ${formatMoney(360_000)} by 30 Nov`,
        body: `You have paid ${formatMoney(0)} of ${formatMoney(720_000)}. Your reference is C404-M017.`,
        refType: FEE_PAYMENT_REF_TYPE,
        readAt: null,
      },
    ]);
    expect(await nudge(lerato.id, FEE_PAYMENT_ACTION_KEY)).toEqual({
      status: "pending",
      blocking: false,
    });
    expect(await noticesOf(maybe.id)).toHaveLength(1);
    // Never a subsidy, never Not coming.
    expect(await noticesOf(sam.id)).toEqual([]);
    expect(await noticesOf(bongi.id)).toEqual([]);

    // The group post names nobody and shows no amount.
    const posts = await h
      .db()
      .select({
        kind: schema.telegramAnnouncements.kind,
        title: schema.telegramAnnouncements.title,
        body: schema.telegramAnnouncements.body,
        buttonPath: schema.telegramAnnouncements.buttonPath,
      })
      .from(schema.telegramAnnouncements);
    expect(posts).toEqual([
      {
        kind: "fee",
        title: "Camp fees are coming due",
        body: "Check My dues in Camp 404 to see what you owe and how to pay.",
        buttonPath: "/dues",
      },
    ]);

    // Again: no second notice while the first is unread, and one post a day.
    expect(
      await remindFeesOwed({
        cycle: YEAR,
        actorId: financeLead.id,
        postInTelegram: true,
        now,
      }),
    ).toEqual({ ok: true, reminded: 2, notified: 0, posted: 0 });
    expect(await noticesOf(lerato.id)).toHaveLength(1);

    expect(await audits("dues.fees_reminded")).toEqual([
      { metadata: { cycle: YEAR, asked: 2, notified: 2, posted: 1 } },
      { metadata: { cycle: YEAR, asked: 2, notified: 0, posted: 0 } },
    ]);

    // Sending a proof answers it: the row is done and the notice read.
    await recordPayment({
      userId: lerato.id,
      amountCents: 360_000,
      currency: "ZAR",
      status: "pending",
      recordedByUserId: lerato.id,
      source: "member",
      proofPathname: "payment-proofs/x.pdf",
      proofContentType: "application/pdf",
    });
    expect(await nudge(lerato.id, FEE_PAYMENT_ACTION_KEY)).toMatchObject({
      status: "completed",
    });
    expect((await noticesOf(lerato.id))[0]!.readAt).not.toBeNull();
  });

  it("asks who has not pledged, and pledging closes the ask", async () => {
    const { captain, quiet, lerato } = await camp();
    expect(await askForPledges({ cycle: YEAR, actorId: captain.id })).toEqual({
      ok: true,
      asked: 1,
      notified: 1,
    });
    expect(await noticesOf(quiet.id)).toEqual([
      expect.objectContaining({
        kind: "fee_reminder",
        refType: FEE_PLEDGE_REF_TYPE,
      }),
    ]);
    expect(await noticesOf(lerato.id)).toEqual([]);
    expect(await askForPledges({ cycle: YEAR, actorId: captain.id })).toEqual({
      ok: true,
      asked: 1,
      notified: 0,
    });
    await savePledge({
      userId: quiet.id,
      cycle: YEAR,
      pledge: { amountCents: 300_000, payBy: "all_by_15_jan", subsidy: false },
    });
    expect(await nudge(quiet.id, FEE_PLEDGE_ACTION_KEY)).toMatchObject({
      status: "completed",
    });
    expect(await askForPledges({ cycle: YEAR, actorId: captain.id })).toEqual({
      ok: true,
      asked: 0,
      notified: 0,
    });
    expect(await audits("dues.pledges_asked")).toHaveLength(2);
  });

  it("reminds automatically once per instalment, near its day, only while collecting", async () => {
    const { captain, lerato, maybe, sam, bongi } = await camp();
    const near = new Date("2026-11-28T08:00:00Z");
    // Off: nothing.
    expect(await remindFeesDueSoon({ now: near })).toEqual({ reminded: 0 });
    await collecting(captain.id);
    // Too early: Lerato's day is 30 Nov, Mo's 31 Dec.
    expect(
      await remindFeesDueSoon({ now: new Date("2026-11-20T08:00:00Z") }),
    ).toEqual({ reminded: 0 });
    expect(await remindFeesDueSoon({ now: near })).toEqual({ reminded: 1 });
    expect(await noticesOf(lerato.id)).toEqual([
      expect.objectContaining({
        title: `Your camp fee: ${formatMoney(360_000)} by 30 Nov`,
      }),
    ]);
    // Once per instalment, even after the notice is read.
    await h
      .db()
      .update(schema.notificationDeliveries)
      .set({ readAt: new Date() });
    expect(await remindFeesDueSoon({ now: near })).toEqual({ reminded: 0 });
    expect(await noticesOf(maybe.id)).toEqual([]);
    expect(await noticesOf(sam.id)).toEqual([]);
    expect(await noticesOf(bongi.id)).toEqual([]);
  });
});
