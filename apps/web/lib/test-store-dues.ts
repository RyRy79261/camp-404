import "server-only";

import {
  campDayKey,
  canManageMoney,
  duesBalance,
  duesSettled,
  nextInstalment,
  proposeRefund,
  splitEvenly,
} from "@camp404/core";
import {
  CHARGE_GONE,
  FEE_ALREADY_SET,
  FEE_CHANGED,
  NO_SUCH_MEMBER,
  NO_TIERS_YET,
  NOT_A_MONEY_KEEPER,
  NOT_YOUR_PAYMENT,
  PLAN_CHANGED,
  PLEDGE_NOT_BELOW,
  REFUND_ALREADY_OPEN,
  REFUND_CHANGED,
  REFUND_NOT_RECEIVED,
  REFUND_TOO_LARGE,
  SETTLE_UP_CHANGED,
  SETTLE_UP_NOBODY,
  TIER_GONE,
  TOO_MANY_TIERS,
  YEAR_CHANGED,
  type DuesAccountRow,
  type DuesChargeRow,
  type DuesPaymentRow,
  type DuesRefundRow,
  type DuesYear,
  type FeeTier,
  type MemberDues,
  type MoneyResult,
  type RefundProposal,
  type SettleUpCandidate,
} from "@camp404/db/dues";
import { reachRank } from "@camp404/db/power";
import type {
  ChargeInput,
  ChargeKind,
  DuesYearInput,
  FeeTierInput,
  PaymentPlanInput,
  PledgeInput,
  RefundStatus,
  SetFeeInput,
  SettleUpInput,
} from "@camp404/types";
import { testStore, type TestPayment } from "./test-store";

// The in-memory twin of @camp404/db/dues (#240), for E2E_TEST_MODE. The same
// rules, sentences and results as the database module, over the store's own
// rows: only a captain or a Finance lead writes (the twin of lockMoneyKeeper),
// every decision is a compare-and-set, and a pledge becomes the fee when the
// member is accepted. The store keeps no audit log. Kept apart from
// test-store.ts, which calls in here only to reset, to charge a fee on
// acceptance and for the roster's paid state.

interface TierRow {
  id: string;
  cycle: number;
  label: string;
  amountCents: number;
  archivedAt: Date | null;
}

interface AccountRow {
  userId: string;
  cycle: number;
  pledgedTierId: string | null;
  pledgedAmountCents: number | null;
  pledgedAt: Date | null;
  planVersion: number;
}

interface ChargeRow {
  id: string;
  userId: string;
  cycle: number;
  kind: ChargeKind;
  description: string;
  amountCents: number;
  standardAmountCents: number | null;
  concessionReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
}

interface InstalmentRow {
  userId: string;
  cycle: number;
  dueOn: string;
  amountCents: number;
}

interface RefundRow {
  id: string;
  paymentId: string;
  userId: string;
  cycle: number;
  status: RefundStatus;
  proposedCents: number | null;
  amountCents: number;
  note: string | null;
  declineReason: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

interface DuesState {
  years: Map<number, DuesYear>;
  tiers: TierRow[];
  accounts: Map<string, AccountRow>;
  charges: ChargeRow[];
  instalments: InstalmentRow[];
  refunds: RefundRow[];
}

const KEY = "__camp404DuesTestStore__";

function state(): DuesState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    years: new Map(),
    tiers: [],
    accounts: new Map(),
    charges: [],
    instalments: [],
    refunds: [],
  } satisfies DuesState;
  return g[KEY] as DuesState;
}

const accountKey = (userId: string, cycle: number) => `${userId}:${cycle}`;

/** Clear every dues row (testStore.reset calls this). */
export function resetDuesStore(): void {
  const d = state();
  d.years.clear();
  d.tiers.length = 0;
  d.accounts.clear();
  d.charges.length = 0;
  d.instalments.length = 0;
  d.refunds.length = 0;
}

/** A captain, or a lead of Finance this year (lockMoneyKeeper's twin). */
export function isMoneyKeeperInStore(actorId: string): boolean {
  const reach = testStore.senderReach(actorId);
  return canManageMoney(reachRank(reach), reach ?? []);
}

function liveCharges(userId: string, cycle: number): ChargeRow[] {
  return state().charges.filter(
    (c) => c.userId === userId && c.cycle === cycle && c.cancelledAt === null,
  );
}

function refundsOf(userId: string, cycle: number): RefundRow[] {
  return state().refunds.filter(
    (r) => r.userId === userId && r.cycle === cycle,
  );
}

const zar = <T extends object>(row: T) => ({ ...row, currency: "ZAR" });

/** The roster's paid state, the twin of duesSettledSql. */
export function duesSettledInStore(
  userId: string,
  cycle: number,
  payments: readonly TestPayment[],
): boolean {
  return duesSettled({
    charges: liveCharges(userId, cycle).map(zar),
    payments,
    refunds: refundsOf(userId, cycle).map(zar),
  });
}

/** A payment's refund that is not declined, for the ledger's rows. */
export function refundStatusOf(
  paymentId: string,
): "requested" | "refunded" | null {
  const live = state().refunds.find(
    (r) => r.paymentId === paymentId && r.status !== "declined",
  );
  return live?.status === "requested" || live?.status === "refunded"
    ? live.status
    : null;
}

function isConcession(c: ChargeRow): boolean {
  return (
    c.kind === "fee" &&
    (c.concessionReason !== null ||
      (c.standardAmountCents !== null && c.amountCents < c.standardAmountCents))
  );
}

function liveTiers(cycle: number): TierRow[] {
  return state()
    .tiers.filter((t) => t.cycle === cycle && t.archivedAt === null)
    .sort(
      (a, b) => a.amountCents - b.amountCents || a.label.localeCompare(b.label),
    );
}

/** The twin of chargeFeeFromPledge. */
function chargeFromPledge(userId: string, cycle: number): boolean {
  const account = state().accounts.get(accountKey(userId, cycle));
  if (!account || account.pledgedAmountCents === null) return false;
  if (liveCharges(userId, cycle).some((c) => c.kind === "fee")) return false;
  const tier = state().tiers.find((t) => t.id === account.pledgedTierId);
  state().charges.push({
    id: crypto.randomUUID(),
    userId,
    cycle,
    kind: "fee",
    description: tier ? `Camp fee: ${tier.label}` : "Camp fee: pledged amount",
    amountCents: account.pledgedAmountCents,
    standardAmountCents: null,
    concessionReason: null,
    cancelledAt: null,
    createdAt: new Date(),
  });
  return true;
}

/** decideParticipation's twin calls this when a member is accepted. */
export function chargeFeeOnAccept(
  userId: string,
  cycle: number,
  _actorId: string,
): void {
  chargeFromPledge(userId, cycle);
}

function keeper<T extends object>(
  actorId: string,
  fn: () => T | string,
): MoneyResult<T> {
  if (!isMoneyKeeperInStore(actorId)) {
    return { ok: false, error: NOT_A_MONEY_KEEPER };
  }
  const result = fn();
  return typeof result === "string"
    ? { ok: false, error: result }
    : { ok: true, ...result };
}

function isMember(userId: string): boolean {
  return testStore.findUserById(userId) !== null;
}

function nameOf(userId: string): string {
  return (
    testStore.findUserById(userId)?.displayName?.trim() || "Unnamed burner"
  );
}

export const duesTestStore = {
  getDuesYear(cycle: number): DuesYear {
    return (
      state().years.get(cycle) ?? {
        cycle,
        deadline: null,
        fullRefundUntil: null,
        partialRefundUntil: null,
        partialRefundPct: null,
        version: 0,
      }
    );
  },

  saveDuesYear(
    input: DuesYearInput & { cycle: number; actorId: string },
  ): MoneyResult<{ version: number }> {
    return keeper(input.actorId, () => {
      const current = this.getDuesYear(input.cycle);
      if (current.version !== input.expectedVersion) return YEAR_CHANGED;
      const version = input.expectedVersion + 1;
      state().years.set(input.cycle, {
        cycle: input.cycle,
        deadline: input.deadline,
        fullRefundUntil: input.fullRefundUntil,
        partialRefundUntil: input.partialRefundUntil,
        partialRefundPct: input.partialRefundPct,
        version,
      });
      return { version };
    });
  },

  listFeeTiers(
    cycle: number,
    options: { includeArchived?: boolean } = {},
  ): FeeTier[] {
    return state()
      .tiers.filter(
        (t) => t.cycle === cycle && (options.includeArchived || !t.archivedAt),
      )
      .sort(
        (a, b) =>
          a.amountCents - b.amountCents || a.label.localeCompare(b.label),
      )
      .map((t) => ({
        id: t.id,
        label: t.label,
        amountCents: t.amountCents,
        currency: "ZAR",
        archived: t.archivedAt !== null,
      }));
  },

  addFeeTier(
    input: FeeTierInput & { cycle: number; actorId: string },
  ): MoneyResult<{ id: string }> {
    return keeper(input.actorId, () => {
      if (liveTiers(input.cycle).length >= 12) return TOO_MANY_TIERS;
      const id = crypto.randomUUID();
      state().tiers.push({
        id,
        cycle: input.cycle,
        label: input.label,
        amountCents: input.amountCents,
        archivedAt: null,
      });
      return { id };
    });
  },

  editFeeTier(
    input: FeeTierInput & { tierId: string; actorId: string },
  ): MoneyResult {
    return keeper(input.actorId, () => {
      const tier = state().tiers.find(
        (t) => t.id === input.tierId && t.archivedAt === null,
      );
      if (!tier) return TIER_GONE;
      tier.label = input.label;
      tier.amountCents = input.amountCents;
      return {};
    });
  },

  archiveFeeTier(input: { tierId: string; actorId: string }): MoneyResult {
    return keeper(input.actorId, () => {
      const tier = state().tiers.find(
        (t) => t.id === input.tierId && t.archivedAt === null,
      );
      if (!tier) return TIER_GONE;
      tier.archivedAt = new Date();
      return {};
    });
  },

  getMemberDues(
    userId: string,
    cycle: number,
    options: { forFinance: boolean; today?: string },
  ): MemberDues | null {
    const user = testStore.findUserById(userId);
    if (!user) return null;
    const d = state();
    const account = d.accounts.get(accountKey(userId, cycle));
    const tier = account
      ? d.tiers.find((t) => t.id === account.pledgedTierId)
      : undefined;
    const charges = d.charges
      .filter((c) => c.userId === userId && c.cycle === cycle)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const payments = testStore
      .duesPayments(cycle)
      .filter((p) => p.userId === userId)
      .reverse();
    const refunds = refundsOf(userId, cycle);
    const refundRows: DuesRefundRow[] = [...refunds].reverse().map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      status: r.status,
      proposedCents: r.proposedCents,
      amountCents: r.amountCents,
      currency: "ZAR",
      note: options.forFinance ? r.note : null,
      declineReason: r.declineReason,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
    }));
    const chargeRows: DuesChargeRow[] = charges.map((c) => ({
      id: c.id,
      kind: c.kind,
      description: c.description,
      amountCents: c.amountCents,
      currency: "ZAR",
      standardAmountCents: options.forFinance ? c.standardAmountCents : null,
      concessionReason: options.forFinance ? c.concessionReason : null,
      concession: options.forFinance ? isConcession(c) : false,
      cancelled: c.cancelledAt !== null,
      createdAt: c.createdAt,
    }));
    const paymentRows: DuesPaymentRow[] = payments.map((p) => ({
      id: p.id,
      reference: p.reference,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      source: p.source,
      method: p.method,
      paidOn: p.paidOn,
      hasProof: p.proofPathname !== null,
      note: options.forFinance ? p.note : null,
      createdAt: p.createdAt,
      refund: refundRows.find((r) => r.paymentId === p.id) ?? null,
    }));
    const instalments = d.instalments
      .filter((i) => i.userId === userId && i.cycle === cycle)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
      .map((i) => ({ dueOn: i.dueOn, amountCents: i.amountCents }));
    const balance = duesBalance({
      charges: liveCharges(userId, cycle).map(zar),
      payments,
      refunds: refunds.map(zar),
    });
    const place = testStore.getParticipation(userId, cycle);
    return {
      userId,
      cycle,
      name: nameOf(userId),
      refCode: testStore.memberRefCode(userId),
      pledge:
        account && account.pledgedAmountCents !== null
          ? {
              tierId: account.pledgedTierId,
              tierLabel: tier?.label ?? null,
              amountCents: account.pledgedAmountCents,
              pledgedAt: account.pledgedAt,
            }
          : null,
      planVersion: account?.planVersion ?? 0,
      instalments,
      charges: chargeRows,
      payments: paymentRows,
      participation: place
        ? {
            status: place.status,
            withdrewOn:
              place.status === "not_attending"
                ? campDayKey(place.updatedAt)
                : null,
          }
        : null,
      balance,
      next: nextInstalment(
        instalments,
        balance.paidCents,
        options.today ?? campDayKey(new Date()),
      ),
    };
  },

  savePledge(input: {
    userId: string;
    cycle: number;
    pledge: PledgeInput;
  }): MoneyResult<{ charged: boolean }> {
    if (!isMember(input.userId)) return { ok: false, error: NO_SUCH_MEMBER };
    const tiers = liveTiers(input.cycle);
    if (tiers.length === 0) return { ok: false, error: NO_TIERS_YET };
    const pledge = input.pledge;
    let tierId: string | null = null;
    let amountCents: number;
    if (pledge.kind === "tier") {
      const tier = tiers.find((t) => t.id === pledge.tierId);
      if (!tier) return { ok: false, error: TIER_GONE };
      tierId = tier.id;
      amountCents = tier.amountCents;
    } else {
      if (pledge.amountCents >= tiers[0]!.amountCents) {
        return { ok: false, error: PLEDGE_NOT_BELOW };
      }
      amountCents = pledge.amountCents;
    }
    if (liveCharges(input.userId, input.cycle).some((c) => c.kind === "fee")) {
      return { ok: false, error: FEE_ALREADY_SET };
    }
    const key = accountKey(input.userId, input.cycle);
    const account = state().accounts.get(key) ?? {
      userId: input.userId,
      cycle: input.cycle,
      pledgedTierId: null,
      pledgedAmountCents: null,
      pledgedAt: null,
      planVersion: 0,
    };
    account.pledgedTierId = tierId;
    account.pledgedAmountCents = amountCents;
    account.pledgedAt = new Date();
    state().accounts.set(key, account);
    const charged =
      testStore.getParticipation(input.userId, input.cycle)?.status ===
      "accepted"
        ? chargeFromPledge(input.userId, input.cycle)
        : false;
    return { ok: true, charged };
  },

  setFee(
    input: SetFeeInput & {
      cycle: number;
      expectedFeeId: string | null;
      actorId: string;
    },
  ): MoneyResult<{ id: string }> {
    return keeper(input.actorId, () => {
      if (!isMember(input.userId)) return NO_SUCH_MEMBER;
      const live = liveCharges(input.userId, input.cycle).find(
        (c) => c.kind === "fee",
      );
      if ((live?.id ?? null) !== input.expectedFeeId) return FEE_CHANGED;
      const account = state().accounts.get(
        accountKey(input.userId, input.cycle),
      );
      const now = new Date();
      if (live) live.cancelledAt = now;
      const standard =
        account?.pledgedAmountCents ??
        live?.standardAmountCents ??
        live?.amountCents ??
        null;
      const id = crypto.randomUUID();
      state().charges.push({
        id,
        userId: input.userId,
        cycle: input.cycle,
        kind: "fee",
        description: "Camp fee",
        amountCents: input.amountCents,
        standardAmountCents: standard,
        concessionReason: input.concessionReason,
        cancelledAt: null,
        createdAt: now,
      });
      return { id };
    });
  },

  addCharge(
    input: ChargeInput & { cycle: number; actorId: string },
  ): MoneyResult<{ id: string }> {
    return keeper(input.actorId, () => {
      if (!isMember(input.userId)) return NO_SUCH_MEMBER;
      const id = crypto.randomUUID();
      state().charges.push({
        id,
        userId: input.userId,
        cycle: input.cycle,
        kind: input.kind,
        description: input.description,
        amountCents: input.amountCents,
        standardAmountCents: null,
        concessionReason: null,
        cancelledAt: null,
        createdAt: new Date(),
      });
      return { id };
    });
  },

  cancelCharge(input: { chargeId: string; actorId: string }): MoneyResult {
    return keeper(input.actorId, () => {
      const row = state().charges.find(
        (c) => c.id === input.chargeId && c.cancelledAt === null,
      );
      if (!row) return CHARGE_GONE;
      row.cancelledAt = new Date();
      return {};
    });
  },

  setPaymentPlan(
    input: PaymentPlanInput & { cycle: number; actorId: string },
  ): MoneyResult<{ version: number }> {
    return keeper(input.actorId, () => {
      if (!isMember(input.userId)) return NO_SUCH_MEMBER;
      const key = accountKey(input.userId, input.cycle);
      const account = state().accounts.get(key) ?? {
        userId: input.userId,
        cycle: input.cycle,
        pledgedTierId: null,
        pledgedAmountCents: null,
        pledgedAt: null,
        planVersion: 0,
      };
      if (account.planVersion !== input.expectedVersion) return PLAN_CHANGED;
      account.planVersion = input.expectedVersion + 1;
      state().accounts.set(key, account);
      const d = state();
      d.instalments = d.instalments.filter(
        (i) => !(i.userId === input.userId && i.cycle === input.cycle),
      );
      for (const i of input.instalments) {
        d.instalments.push({
          userId: input.userId,
          cycle: input.cycle,
          dueOn: i.dueOn,
          amountCents: i.amountCents,
        });
      }
      return { version: account.planVersion };
    });
  },

  listDuesAccounts(cycle: number, today: string): DuesAccountRow[] {
    return testStore
      .allUsers()
      .filter((u) => u.approvalStatus === "approved")
      .map((u) => {
        const dues = this.getMemberDues(u.id, cycle, {
          forFinance: true,
          today,
        })!;
        const fee = liveCharges(u.id, cycle).find((c) => c.kind === "fee");
        return {
          userId: u.id,
          name: dues.name,
          refCode: dues.refCode,
          participation: dues.participation?.status ?? null,
          pledgeLabel: dues.pledge?.tierLabel ?? null,
          pledgeCents: dues.pledge?.amountCents ?? null,
          feeCents: fee?.amountCents ?? null,
          concession: fee ? isConcession(fee) : false,
          balance: dues.balance,
          next: dues.next,
          pendingProofs: dues.payments.filter(
            (p) => p.status === "pending" && p.source === "member",
          ).length,
          openRefunds: refundsOf(u.id, cycle).filter(
            (r) => r.status === "requested",
          ).length,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  settleUpCandidates(cycle: number): SettleUpCandidate[] {
    return state()
      .charges.filter(
        (c) => c.cycle === cycle && c.kind === "fee" && c.cancelledAt === null,
      )
      .filter((c) => isMember(c.userId))
      .map((c) => ({
        userId: c.userId,
        name: nameOf(c.userId),
        concession: isConcession(c),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  publishSettleUp(
    input: SettleUpInput & {
      cycle: number;
      previewedUserIds: readonly string[];
      actorId: string;
    },
  ): MoneyResult<{ id: string; members: number }> {
    return keeper(input.actorId, () => {
      const ids = this.settleUpCandidates(input.cycle)
        .filter((c) => !(input.skipConcessions && c.concession))
        .map((c) => c.userId)
        .sort();
      const previewed = [...new Set(input.previewedUserIds)].sort();
      if (ids.length === 0) return SETTLE_UP_NOBODY;
      if (ids.join(",") !== previewed.join(",")) return SETTLE_UP_CHANGED;
      const sign = input.direction === "refund" ? -1 : 1;
      const id = crypto.randomUUID();
      for (const [userId, cents] of splitEvenly(input.totalCents, ids)) {
        if (cents <= 0) continue;
        state().charges.push({
          id: crypto.randomUUID(),
          userId,
          cycle: input.cycle,
          kind: "settle_up",
          description: input.description,
          amountCents: sign * cents,
          standardAmountCents: null,
          concessionReason: null,
          cancelledAt: null,
          createdAt: new Date(),
        });
      }
      return { id, members: ids.length };
    });
  },

  proposeRefundFor(paymentId: string, today: string): RefundProposal | null {
    const payment = testStore.getPayment(paymentId);
    if (!payment) return null;
    const place = testStore.getParticipation(payment.userId, payment.cycle);
    const onDay =
      place?.status === "not_attending" ? campDayKey(place.updatedAt) : today;
    return {
      ...proposeRefund(
        payment.amountCents,
        onDay,
        this.getDuesYear(payment.cycle),
      ),
      onDay,
    };
  },

  requestRefund(input: {
    paymentId: string;
    amountCents: number | null;
    note: string | null;
    actorId: string;
    today: string;
  }): MoneyResult<{ id: string }> {
    const payment = testStore.getPayment(input.paymentId);
    if (!payment) return { ok: false, error: REFUND_NOT_RECEIVED };
    const asMember = input.amountCents === null;
    if (asMember && payment.userId !== input.actorId) {
      return { ok: false, error: NOT_YOUR_PAYMENT };
    }
    if (!asMember && !isMoneyKeeperInStore(input.actorId)) {
      return { ok: false, error: NOT_A_MONEY_KEEPER };
    }
    if (payment.status !== "reconciled") {
      return { ok: false, error: REFUND_NOT_RECEIVED };
    }
    const proposal = this.proposeRefundFor(input.paymentId, input.today)!;
    const amountCents = asMember
      ? (proposal.amountCents ?? payment.amountCents)
      : input.amountCents!;
    if (amountCents > payment.amountCents) {
      return { ok: false, error: REFUND_TOO_LARGE };
    }
    if (refundStatusOf(input.paymentId) !== null) {
      return { ok: false, error: REFUND_ALREADY_OPEN };
    }
    const id = crypto.randomUUID();
    state().refunds.push({
      id,
      paymentId: input.paymentId,
      userId: payment.userId,
      cycle: payment.cycle,
      status: "requested",
      proposedCents: proposal.amountCents,
      amountCents,
      note: input.note,
      declineReason: null,
      decidedAt: null,
      createdAt: new Date(),
    });
    return { ok: true, id };
  },

  decideRefund(
    input: (
      | { to: "refunded"; amountCents: number }
      | { to: "declined"; reason: string }
    ) & { refundId: string; actorId: string },
  ): MoneyResult {
    return keeper(input.actorId, () => {
      const row = state().refunds.find(
        (r) => r.id === input.refundId && r.status === "requested",
      );
      if (!row) return REFUND_CHANGED;
      if (input.to === "refunded") {
        const paid = testStore.getPayment(row.paymentId)?.amountCents ?? 0;
        if (input.amountCents > paid) return REFUND_TOO_LARGE;
        row.amountCents = input.amountCents;
      } else {
        row.declineReason = input.reason;
      }
      row.status = input.to;
      row.decidedAt = new Date();
      return {};
    });
  },

  getPaymentProof(paymentId: string): {
    userId: string;
    reference: string;
    pathname: string;
    contentType: string;
  } | null {
    const payment = testStore.getPayment(paymentId);
    if (!payment?.proofPathname || !payment.proofContentType) return null;
    return {
      userId: payment.userId,
      reference: payment.reference,
      pathname: payment.proofPathname,
      contentType: payment.proofContentType,
    };
  },

  statementContext(cycle: number) {
    return {
      members: testStore.allUsers().map((u) => ({
        id: u.id,
        name: nameOf(u.id),
        refCode: testStore.memberRefCode(u.id),
      })),
      payments: testStore.duesPayments(cycle).map((p) => ({
        id: p.id,
        userId: p.userId,
        amountCents: p.amountCents,
        status: p.status,
        paidOn: p.paidOn,
      })),
    };
  },
};
