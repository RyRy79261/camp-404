import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { makeUser } from "./_factories";
import { useTestDb } from "./_harness";

// Money is in rands only (owner's call, 2026-09-24). 0050 stops the deploy if
// any money table holds a row in another currency, rather than convert it, and
// 0051 replaces 0047's three-code constraints with currency = 'ZAR'. The
// harness has applied both to an empty database, so each test puts back the
// state 0047 left (its three-code constraints, so a USD or EUR row can be
// stored), stores rows, and runs the migrations' own SQL again. Amounts are
// made up.

function migration(name: string): string {
  return readFileSync(
    new URL(`../../migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
}

const GUARD_SQL = migration("0050_money_in_rands_only_guard");
const CHECK_SQL = migration("0051_money_in_rands_only");
const THREE_CODE_CHECK_SQL = migration("0047_currency_check");

const MONEY_TABLES = ["payments", "reimbursements", "team_budgets"] as const;
type MoneyTable = (typeof MONEY_TABLES)[number];

/** The Postgres error code, wherever drizzle nested it. */
function sqlState(err: unknown): string | undefined {
  let current: unknown = err;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

describe("0050_money_in_rands_only_guard and 0051_money_in_rands_only", () => {
  const h = useTestDb();

  /** The constraints as 0047 left them: ZAR, USD or EUR. */
  async function threeCodeChecks() {
    for (const table of MONEY_TABLES) {
      await h
        .client()
        .exec(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_currency_check"`,
        );
    }
    await h.client().exec(THREE_CODE_CHECK_SQL);
  }

  /** The predicate each money table's currency constraint holds now. */
  async function checkDefinitions() {
    const res = await h.client().query<{ name: string; def: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conname LIKE '%_currency_check'
        ORDER BY conname`,
    );
    return res.rows;
  }

  let refSeq = 0;
  async function store(table: MoneyTable, userId: string, currency: string) {
    if (table === "payments") {
      await h
        .db()
        .insert(schema.payments)
        .values({
          userId,
          cycle: 2026,
          amountCents: 1234,
          currency,
          reference: `C404-TEST-${++refSeq}`,
        });
    } else if (table === "reimbursements") {
      await h.db().insert(schema.reimbursements).values({
        submitterId: userId,
        amount: "12.34",
        currency,
        accountType: "sa",
        accountDetailsEncrypted: "fake-ciphertext",
        description: "Gaffer tape",
      });
    } else {
      const teams = schema.teamEnum.enumValues;
      await h
        .db()
        .insert(schema.teamBudgets)
        .values({
          team: teams[refSeq++ % teams.length]!,
          cycle: 2026,
          currency,
          assignedAmount: "999.00",
        });
    }
  }

  /** Every row's currency and amount, so a test can see nothing moved. */
  async function stored() {
    const rows: Record<string, string[]> = {};
    for (const table of MONEY_TABLES) {
      const amount = table === "payments" ? "amount_cents" : "amount";
      const column = table === "team_budgets" ? "assigned_amount" : amount;
      const res = await h.client().query<{ row: string }>(
        `SELECT "currency" || ' ' || "${column}"::text AS row
           FROM "${table}" ORDER BY row`,
      );
      rows[table] = res.rows.map((r) => r.row);
    }
    return rows;
  }

  it("lets a rands-only database through untouched, twice, and then refuses any other code", async () => {
    await threeCodeChecks();
    const user = await makeUser(h.db());
    for (const table of MONEY_TABLES) await store(table, user.id, "ZAR");
    const before = await stored();

    await h.client().exec(GUARD_SQL);
    await h.client().exec(GUARD_SQL);
    await h.client().exec(CHECK_SQL);

    expect(await stored()).toEqual(before);
    for (const { def } of await checkDefinitions()) {
      expect(def).not.toContain("USD");
    }
    for (const table of MONEY_TABLES) {
      for (const code of ["USD", "EUR", "zar"]) {
        const err = await store(table, user.id, code).catch((e: unknown) => e);
        expect(sqlState(err), `${table} ${code}`).toBe("23514");
      }
    }
  });

  it.each(MONEY_TABLES)(
    "stops on a dollar or euro row in %s, converts nothing, and rolls the run back",
    async (table) => {
      await threeCodeChecks();
      const user = await makeUser(h.db());
      for (const t of MONEY_TABLES) await store(t, user.id, "ZAR");
      await store(table, user.id, table === "payments" ? "USD" : "EUR");
      const before = await stored();

      // drizzle's migrator runs every pending migration in one transaction.
      const err = await h
        .client()
        .transaction(async (tx) => {
          await tx.exec(GUARD_SQL);
          await tx.exec(CHECK_SQL);
        })
        .catch((e: unknown) => e);

      expect((err as Error).message).toContain(
        `rands only: ${table} holds a row in a currency other than ZAR`,
      );
      expect(await stored()).toEqual(before);
      // The rands-only constraints did not go on either: the run was rolled
      // back whole, and 0047's are still there.
      const defs = await checkDefinitions();
      expect(defs.map((d) => d.name)).toEqual([
        "payments_currency_check",
        "reimbursements_currency_check",
        "team_budgets_currency_check",
      ]);
      for (const { def } of defs) expect(def).toContain("USD");
    },
  );
});
