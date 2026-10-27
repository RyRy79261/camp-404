import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  campDayKey,
  FEE_PAYMENT_ACTION_KEY,
  FEE_PAYMENT_ACTION_TITLE,
  FEE_PAYMENT_REF_TYPE,
  FEE_PLEDGE_ACTION_KEY,
  FEE_PLEDGE_ACTION_TITLE,
  FEE_PLEDGE_REF_TYPE,
  feePaymentReminderNotification,
  feePledgeAskNotification,
  feeReminderAudience,
  feeReminderDue,
  pledgeAskAudience,
  REMINDERS_NEED_COLLECTING,
  type FeeReminderMember,
  type NextFeePayment,
} from "@camp404/core";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { deliveryValues } from "./deliveries";
import {
  assertMoneyKeeper,
  listDuesAccounts,
  refuse,
  write,
  type DuesAccountRow,
  type MoneyResult,
} from "./dues";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { openNudges } from "./nudges";
import * as schema from "./schema";
import { listTelegramPlaces, queueFeeReminderPost } from "./telegram-posts";

// Camp fee reminders (camp fees sprint, owner 2026-10-27; plan P, Reminders).
//
//  - "Ask everyone to pledge" and "Remind who still owes" are the Finance
//    team's (MONEY_KEEPER, re-checked inside each write), each a nudge on the
//    gate spine (./nudges): one NON-blocking `required_actions` row and one
//    notice per member, never a second while the first is unread. Pledging
//    (./dues savePledge) and sending a proof (./payments recordPayment) close
//    them. Audited in the same transaction.
//  - Each notice is about the member's OWN pledge or next payment, and goes
//    by inbox, push, email and Ol' Jeb's private message (`fee_reminder` is a
//    personal notice). The camp's Telegram chats get only a general post that
//    names nobody and shows no amount (owner 2A).
//  - Reminding needs Collecting fees on: the year's row is locked and read in
//    the same transaction, so switching it off at the same moment wins.
//  - The automatic reminder (remindFeesDueSoon, from runDueWork on a page
//    load, in camp daytime) goes once per member and instalment day
//    (`fee_payment_reminders`), only while collecting is on, and never to a
//    member who asked for a subsidy or said Not coming this year.
//
// Who is reached is @camp404/core's (feeReminderAudience, pledgeAskAudience),
// the same rule the test store's twin applies.
//
// PGlite has ONE connection: inside a transaction everything goes through `tx`.

export { REMINDERS_NEED_COLLECTING };

/** A dues row as the reminder rules read it. */
export function feeReminderMemberOf(
  row: DuesAccountRow,
): FeeReminderMember & { row: DuesAccountRow } {
  return {
    userId: row.userId,
    name: row.name,
    participation: row.participation,
    subsidy: row.subsidy,
    feeOwingCents: row.feeOwingCents,
    feeNext: row.feeNext,
    hasPledge: row.pledgeCents !== null || row.feeCents !== null,
    row,
  };
}

/** One member a reminder reaches, as the dialog lists them. */
export interface FeeReminderPerson {
  userId: string;
  name: string;
  next: NextFeePayment;
  owingCents: number;
  /** Connected Ol' Jeb for private messages. */
  telegram: boolean;
}

export interface FeeReminderPreview {
  /** The year's Collecting fees switch. */
  collecting: boolean;
  remind: {
    reach: FeeReminderPerson[];
    /** Names of members who said Not coming this year. */
    notComing: string[];
    /** Names of members who asked for a subsidy (never reminded). */
    subsidy: string[];
  };
  ask: {
    reach: { userId: string; name: string }[];
    notComing: string[];
  };
  /** The chats Ol' Jeb posts in: 0 hides the Telegram tick. */
  telegramPlaces: number;
}

/** Who has Ol' Jeb connected for private messages, of these members. */
async function telegramConnected(
  userIds: readonly string[],
  db: DbOrTx,
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        inArray(schema.users.id, [...userIds]),
        isNotNull(schema.users.telegramDmAt),
        isNotNull(schema.users.telegramUserId),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * What the two buttons would do now: who each reaches, who is left out and
 * why, who has Ol' Jeb connected, and whether a general Telegram post is
 * possible. For the Finance team only: the caller gates it.
 */
export async function feeReminderPreview(
  cycle: number,
  today: string,
): Promise<FeeReminderPreview> {
  const db = createHttpDb();
  const [accounts, year, places] = await Promise.all([
    listDuesAccounts(cycle, today, db),
    db
      .select({ collecting: schema.duesYears.collectingFees })
      .from(schema.duesYears)
      .where(eq(schema.duesYears.cycle, cycle))
      .limit(1),
    listTelegramPlaces(db),
  ]);
  const members = accounts.map(feeReminderMemberOf);
  const remind = feeReminderAudience(members);
  const ask = pledgeAskAudience(members);
  const connected = await telegramConnected(
    remind.reach.map((m) => m.userId),
    db,
  );
  return {
    collecting: year[0]?.collecting ?? false,
    remind: {
      reach: remind.reach.map((m) => ({
        userId: m.userId,
        name: m.name,
        next: m.feeNext,
        owingCents: m.feeOwingCents,
        telegram: connected.has(m.userId),
      })),
      notComing: remind.notComing.map((m) => m.name),
      subsidy: remind.subsidy.map((m) => m.name),
    },
    ask: {
      reach: ask.reach.map((m) => ({ userId: m.userId, name: m.name })),
      notComing: ask.notComing.map((m) => m.name),
    },
    telegramPlaces: places.length,
  };
}

/** The year's Collecting fees switch, locked for the rest of the transaction. */
async function lockCollecting(tx: Tx, cycle: number): Promise<boolean> {
  const [row] = await tx
    .select({ collecting: schema.duesYears.collectingFees })
    .from(schema.duesYears)
    .where(eq(schema.duesYears.cycle, cycle))
    .limit(1)
    .for("update");
  return row?.collecting ?? false;
}

/**
 * "Ask everyone to pledge": nudge every member with no pledge and no fee yet
 * who did not say Not coming this year or ask for a subsidy. Pressing it
 * again reaches only those who still have not pledged, and never stacks.
 */
export async function askForPledges(input: {
  cycle: number;
  actorId: string;
}): Promise<MoneyResult<{ asked: number; notified: number }>> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    const today = campDayKey(new Date());
    const accounts = await listDuesAccounts(input.cycle, today, tx);
    const targets = pledgeAskAudience(accounts.map(feeReminderMemberOf)).reach;
    if (targets.length === 0) return { asked: 0, notified: 0 };
    const notified = await openNudges(tx, {
      userIds: targets.map((t) => t.userId),
      actionKey: FEE_PLEDGE_ACTION_KEY,
      title: FEE_PLEDGE_ACTION_TITLE,
      refType: FEE_PLEDGE_REF_TYPE,
      notice: (requiredActionId) =>
        feePledgeAskNotification({ requiredActionId }),
      now: new Date(),
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.pledges_asked",
      target: String(input.cycle),
      metadata: { cycle: input.cycle, asked: targets.length, notified },
    });
    return { asked: targets.length, notified };
  });
}

/**
 * "Remind who still owes": nudge every member who owes money on their fee,
 * except who asked for a subsidy or said Not coming this year, each with a
 * notice about their own next payment. With `postInTelegram`, also a general
 * post in each of Ol' Jeb's chats, once a camp day. Refused while Collecting
 * fees is off.
 */
export async function remindFeesOwed(input: {
  cycle: number;
  actorId: string;
  postInTelegram: boolean;
}): Promise<
  MoneyResult<{ reminded: number; notified: number; posted: number }>
> {
  return write(async (tx) => {
    await assertMoneyKeeper(tx, input.actorId);
    if (!(await lockCollecting(tx, input.cycle))) {
      refuse(REMINDERS_NEED_COLLECTING);
    }
    const now = new Date();
    const today = campDayKey(now);
    const accounts = await listDuesAccounts(input.cycle, today, tx);
    const targets = feeReminderAudience(
      accounts.map(feeReminderMemberOf),
    ).reach;
    const rowOf = new Map(targets.map((t) => [t.userId, t.row]));
    const notified =
      targets.length === 0
        ? 0
        : await openNudges(tx, {
            userIds: targets.map((t) => t.userId),
            actionKey: FEE_PAYMENT_ACTION_KEY,
            title: FEE_PAYMENT_ACTION_TITLE,
            refType: FEE_PAYMENT_REF_TYPE,
            notice: (requiredActionId, userId) =>
              paymentNotice(rowOf.get(userId)!, requiredActionId),
            now,
          });
    const posted = input.postInTelegram
      ? await queueFeeReminderPost(tx, { cycle: input.cycle, day: today })
      : 0;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "dues.fees_reminded",
      target: String(input.cycle),
      metadata: {
        cycle: input.cycle,
        asked: targets.length,
        notified,
        posted,
      },
    });
    return { reminded: targets.length, notified, posted };
  });
}

function paymentNotice(row: DuesAccountRow, requiredActionId: string | null) {
  return feePaymentReminderNotification({
    requiredActionId,
    next: row.feeNext,
    owingCents: row.feeOwingCents,
    paidCents: row.balance.paidCents,
    totalCents: row.feeTotalCents,
    refCode: row.refCode,
  });
}

/**
 * The automatic reminder: each member whose next instalment is due within
 * FEE_REMINDER_DAYS_AHEAD days (or already), once per instalment day. Only
 * while Collecting fees is on; never to a member who asked for a subsidy or
 * said Not coming this year. A member whose fee notice is still unread gets
 * no second one (the day is still marked, so it does not come later).
 */
export async function remindFeesDueSoon(
  input: { now?: Date } = {},
): Promise<{ reminded: number }> {
  const now = input.now ?? new Date();
  const today = campDayKey(now);
  return withTransaction(async (tx) => {
    const cycle = await currentCycleNumber(tx);
    if (!(await lockCollecting(tx, cycle))) return { reminded: 0 };
    const accounts = await listDuesAccounts(cycle, today, tx);
    const due = feeReminderAudience(accounts.map(feeReminderMemberOf))
      .reach// Only a Coming or Maybe member with a day to pay.
      .filter((m) => feeReminderDue(m.feeNext, today));
    if (due.length === 0) return { reminded: 0 };
    const unread = await tx
      .select({ userId: schema.notificationDeliveries.userId })
      .from(schema.notificationDeliveries)
      .where(
        and(
          inArray(
            schema.notificationDeliveries.userId,
            due.map((m) => m.userId),
          ),
          eq(schema.notificationDeliveries.refType, FEE_PAYMENT_REF_TYPE),
          isNull(schema.notificationDeliveries.readAt),
        ),
      );
    const stillUnread = new Set(unread.map((u) => u.userId));
    let reminded = 0;
    for (const m of due) {
      if (m.feeNext.kind !== "due") continue;
      const marked = await tx
        .insert(schema.feePaymentReminders)
        .values({ userId: m.userId, cycle, dueOn: m.feeNext.dueOn })
        .onConflictDoNothing()
        .returning({ userId: schema.feePaymentReminders.userId });
      if (marked.length === 0 || stillUnread.has(m.userId)) continue;
      await tx.insert(schema.notificationDeliveries).values(
        deliveryValues(paymentNotice(m.row, null), {
          userId: m.userId,
          broadcastId: null,
          channel: "both",
          presentation: "feed",
          createdAt: now,
        }),
      );
      reminded += 1;
    }
    return { reminded };
  });
}
