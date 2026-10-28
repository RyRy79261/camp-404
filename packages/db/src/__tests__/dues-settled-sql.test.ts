import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { duesSettled, type PaymentStatus } from "@camp404/core";
import type { ChargeKind, RefundStatus } from "@camp404/types";
import { duesSettledSql } from "../payments";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// "Settled" is written twice on purpose: duesSettled in @camp404/core (the
// test store's roster) and duesSettledSql (the roster's one query, a column
// per member, where reading every member's rows into code would be the
// copy). This pins the two to the same answer on the same rows.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;
const YEAR = 2027;

interface Case {
  name: string;
  charges?: { kind: ChargeKind; cents: number; cancelled?: boolean }[];
  payments?: {
    cents: number;
    status: PaymentStatus;
    refund?: { cents: number; status: RefundStatus };
  }[];
  /** Rows in another year, which neither side may count. */
  otherYear?: boolean;
  settled: boolean;
}

const CASES: Case[] = [
  { name: "nothing at all", settled: false },
  {
    name: "no charges, a payment received",
    payments: [{ cents: 50_000, status: "reconciled" }],
    settled: true,
  },
  {
    name: "no charges, a payment waived",
    payments: [{ cents: 50_000, status: "waived" }],
    settled: true,
  },
  {
    name: "no charges, a payment pending only",
    payments: [{ cents: 50_000, status: "pending" }],
    settled: false,
  },
  {
    name: "a fee paid exactly",
    charges: [{ kind: "fee", cents: 100_000 }],
    payments: [{ cents: 100_000, status: "reconciled" }],
    settled: true,
  },
  {
    name: "a fee paid in part",
    charges: [{ kind: "fee", cents: 100_000 }],
    payments: [
      { cents: 40_000, status: "reconciled" },
      { cents: 60_000, status: "pending" },
    ],
    settled: false,
  },
  {
    name: "a fee and a rental, paid and waived",
    charges: [
      { kind: "fee", cents: 100_000 },
      { kind: "rental", cents: 20_000 },
    ],
    payments: [
      { cents: 100_000, status: "reconciled" },
      { cents: 20_000, status: "waived" },
    ],
    settled: true,
  },
  {
    name: "a cancelled charge only, nothing paid",
    charges: [{ kind: "fee", cents: 100_000, cancelled: true }],
    settled: false,
  },
  {
    name: "a cancelled charge only, a payment received",
    charges: [{ kind: "fee", cents: 100_000, cancelled: true }],
    payments: [{ cents: 10_000, status: "reconciled" }],
    settled: true,
  },
  {
    name: "paid, then part refunded",
    charges: [{ kind: "fee", cents: 100_000 }],
    payments: [
      {
        cents: 100_000,
        status: "reconciled",
        refund: { cents: 30_000, status: "refunded" },
      },
    ],
    settled: false,
  },
  {
    name: "paid, a refund asked for but not paid out",
    charges: [{ kind: "fee", cents: 100_000 }],
    payments: [
      {
        cents: 100_000,
        status: "reconciled",
        refund: { cents: 30_000, status: "requested" },
      },
    ],
    settled: true,
  },
  {
    name: "overpaid",
    charges: [{ kind: "fee", cents: 100_000 }],
    payments: [{ cents: 120_000, status: "reconciled" }],
    settled: true,
  },
  {
    name: "a settle-up that gives money back, nothing paid",
    charges: [{ kind: "settle_up", cents: -5_000 }],
    settled: true,
  },
  {
    name: "paid in another year only",
    payments: [{ cents: 100_000, status: "reconciled" }],
    otherYear: true,
    settled: false,
  },
];

async function seed(db: DB, userId: string, c: Case) {
  const cycle = c.otherYear ? YEAR - 1 : YEAR;
  for (const charge of c.charges ?? []) {
    await db.insert(schema.duesCharges).values({
      userId,
      cycle,
      kind: charge.kind,
      description: charge.kind,
      amountCents: charge.cents,
      cancelledAt: charge.cancelled ? new Date() : null,
    });
  }
  for (const payment of c.payments ?? []) {
    const [row] = await db
      .insert(schema.payments)
      .values({
        userId,
        cycle,
        amountCents: payment.cents,
        reference: `T-${crypto.randomUUID()}`,
        status: payment.status,
      })
      .returning({ id: schema.payments.id });
    if (payment.refund) {
      await db.insert(schema.paymentRefunds).values({
        paymentId: row!.id,
        userId,
        cycle,
        amountCents: payment.refund.cents,
        status: payment.refund.status,
      });
    }
  }
}

/** duesSettled on the rows as stored, read back for YEAR. */
async function settledInCode(db: DB, userId: string): Promise<boolean> {
  const [charges, payments, refunds] = await Promise.all([
    db
      .select()
      .from(schema.duesCharges)
      .where(
        and(
          eq(schema.duesCharges.userId, userId),
          eq(schema.duesCharges.cycle, YEAR),
          isNull(schema.duesCharges.cancelledAt),
        ),
      ),
    db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.userId, userId),
          eq(schema.payments.cycle, YEAR),
        ),
      ),
    db
      .select()
      .from(schema.paymentRefunds)
      .where(
        and(
          eq(schema.paymentRefunds.userId, userId),
          eq(schema.paymentRefunds.cycle, YEAR),
        ),
      ),
  ]);
  return duesSettled({ charges, payments, refunds });
}

describe("duesSettledSql agrees with duesSettled", () => {
  const h = useTestDb();

  it("gives the same answer on the same rows, case by case", async () => {
    const db = h.db();
    const ids = new Map<string, Case>();
    for (const c of CASES) {
      const user = await makeUser(db);
      await seed(db, user.id, c);
      ids.set(user.id, c);
    }
    const rows = await db
      .select({
        id: schema.users.id,
        settled: duesSettledSql(schema.users.id, YEAR),
      })
      .from(schema.users);
    const inSql = new Map(rows.map((r) => [r.id, r.settled]));

    const answers: Record<string, { sql: boolean | undefined; code: boolean }> =
      {};
    for (const [id, c] of ids) {
      answers[c.name] = {
        sql: inSql.get(id),
        code: await settledInCode(db, id),
      };
    }
    const expected = Object.fromEntries(
      CASES.map((c) => [c.name, { sql: c.settled, code: c.settled }]),
    );
    expect(answers).toEqual(expected);
  });
});
