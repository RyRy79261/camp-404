import "server-only";

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
  pledgeAskAudience,
  REMINDERS_NEED_COLLECTING,
} from "@camp404/core";
import { NOT_A_MONEY_KEEPER, type MoneyResult } from "@camp404/db/dues";
import {
  feeReminderMemberOf,
  type FeeReminderPreview,
} from "@camp404/db/fee-reminders";
import { testStore } from "./test-store";
import { duesTestStore, isMoneyKeeperInStore } from "./test-store-dues";

// The in-memory twin of @camp404/db/fee-reminders (camp fees sprint), for
// E2E_TEST_MODE: the same audiences (@camp404/core), the same nudges (one
// non-blocking action and one notice each, never stacking) and the same
// refusals. The general Telegram post is counted once a camp day per place.
// The automatic reminder does not run under E2E (runDueWork is off), so it
// has no twin. lib/__tests__/fee-reminders-agreement.test.ts holds the two
// sides equal.

const KEY = "__camp404FeeReminderPosts__";

/** The general posts queued, as `cycle:day`. */
function posts(): Set<string> {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= new Set<string>();
  return g[KEY] as Set<string>;
}

/** Forget the posts (testStore.reset calls this). */
export function resetFeeReminderStore(): void {
  posts().clear();
}

function today(): string {
  return campDayKey(new Date());
}

export const feeReminderTestStore = {
  feeReminderPreview(cycle: number, day: string): FeeReminderPreview {
    const members = duesTestStore
      .listDuesAccounts(cycle, day)
      .map(feeReminderMemberOf);
    const notComing = testStore.notComingUserIds(cycle);
    const remind = feeReminderAudience(members, notComing);
    const ask = pledgeAskAudience(members, notComing);
    return {
      collecting: duesTestStore.getDuesYear(cycle).collectingFees,
      remind: {
        reach: remind.reach.map((m) => ({
          userId: m.userId,
          name: m.name,
          next: m.feeNext,
          owingCents: m.feeOwingCents,
          telegram: testStore.getTelegramConnection(m.userId).connected,
        })),
        notComing: remind.notComing.map((m) => m.name),
        subsidy: remind.subsidy.map((m) => m.name),
      },
      ask: {
        reach: ask.reach.map((m) => ({ userId: m.userId, name: m.name })),
        notComing: ask.notComing.map((m) => m.name),
      },
      telegramPlaces: testStore.listTelegramPlaces().length,
    };
  },

  askForPledges(input: {
    cycle: number;
    actorId: string;
  }): MoneyResult<{ asked: number; notified: number }> {
    if (!isMoneyKeeperInStore(input.actorId)) {
      return { ok: false, error: NOT_A_MONEY_KEEPER };
    }
    const targets = pledgeAskAudience(
      duesTestStore
        .listDuesAccounts(input.cycle, today())
        .map(feeReminderMemberOf),
      testStore.notComingUserIds(input.cycle),
    ).reach;
    let notified = 0;
    for (const t of targets) {
      testStore.openNudge({
        userId: t.userId,
        actionKey: FEE_PLEDGE_ACTION_KEY,
        title: FEE_PLEDGE_ACTION_TITLE,
      });
      if (testStore.hasUnreadNotice(t.userId, FEE_PLEDGE_REF_TYPE)) continue;
      testStore.pushNotice(
        t.userId,
        feePledgeAskNotification({ requiredActionId: null }),
      );
      notified += 1;
    }
    return { ok: true, asked: targets.length, notified };
  },

  remindFeesOwed(input: {
    cycle: number;
    actorId: string;
    postInTelegram: boolean;
  }): MoneyResult<{ reminded: number; notified: number; posted: number }> {
    if (!isMoneyKeeperInStore(input.actorId)) {
      return { ok: false, error: NOT_A_MONEY_KEEPER };
    }
    if (!duesTestStore.getDuesYear(input.cycle).collectingFees) {
      return { ok: false, error: REMINDERS_NEED_COLLECTING };
    }
    const day = today();
    const targets = feeReminderAudience(
      duesTestStore.listDuesAccounts(input.cycle, day).map(feeReminderMemberOf),
      testStore.notComingUserIds(input.cycle),
    ).reach;
    let notified = 0;
    for (const t of targets) {
      testStore.openNudge({
        userId: t.userId,
        actionKey: FEE_PAYMENT_ACTION_KEY,
        title: FEE_PAYMENT_ACTION_TITLE,
      });
      if (testStore.hasUnreadNotice(t.userId, FEE_PAYMENT_REF_TYPE)) continue;
      testStore.pushNotice(
        t.userId,
        feePaymentReminderNotification({
          requiredActionId: null,
          next: t.row.feeNext,
          owingCents: t.row.feeOwingCents,
          paidCents: t.row.balance.paidCents,
          totalCents: t.row.feeTotalCents,
          refCode: t.row.refCode,
        }),
      );
      notified += 1;
    }
    let posted = 0;
    const key = `${input.cycle}:${day}`;
    if (input.postInTelegram && !posts().has(key)) {
      posted = testStore.listTelegramPlaces().length;
      if (posted > 0) posts().add(key);
    }
    return { ok: true, reminded: targets.length, notified, posted };
  },
};
