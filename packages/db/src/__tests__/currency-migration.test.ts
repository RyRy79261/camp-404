import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURRENCIES } from "@camp404/core";
import * as schema from "../schema";
import { makeUser } from "./_factories";
import { useTestDb } from "./_harness";

// 0046 cleans the currency codes a live database already holds, and 0047 then
// holds the three money tables to ZAR, USD and EUR. The harness has applied
// both to an empty database, so each test drops the constraints, stores the
// dirty rows production may have, and runs the migrations' own SQL again.

function migration(name: string): string {
  return readFileSync(
    new URL(`../../migrations/${name}.sql`, import.meta.url),
    "utf8",
  );
}

const NORMALISE_SQL = migration("0046_normalise_currency_codes");
const CHECK_SQL = migration("0047_currency_check");

const MONEY_TABLES = ["payments", "reimbursements", "team_budgets"] as const;

const UNMAPPED_MESSAGE =
  "currency cleanup: payments holds a code other than ZAR, USD or EUR; add a mapping in a new migration";

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

describe("0046_normalise_currency_codes and 0047_currency_check", () => {
  const h = useTestDb();

  async function dropChecks() {
    for (const table of MONEY_TABLES) {
      await h
        .client()
        .exec(
          `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_currency_check"`,
        );
    }
  }

  let refSeq = 0;
  async function storePayment(userId: string, currency: string) {
    await h
      .db()
      .insert(schema.payments)
      .values({
        userId,
        cycle: 2026,
        amountCents: 150000,
        currency,
        reference: `C404-TEST-${++refSeq}`,
      });
  }

  async function storeClaim(submitterId: string, currency: string) {
    await h.db().insert(schema.reimbursements).values({
      submitterId,
      amount: "120.50",
      currency,
      accountType: "sa",
      accountDetailsEncrypted: "fake-ciphertext",
      description: "Gaffer tape",
    });
  }

  async function storeBudget(
    team: (typeof schema.teamEnum.enumValues)[number],
    currency: string,
  ) {
    await h.db().insert(schema.teamBudgets).values({
      team,
      cycle: 2026,
      currency,
      assignedAmount: "5000.00",
    });
  }

  async function storedCodes() {
    const codes: Record<string, string[]> = {};
    for (const table of MONEY_TABLES) {
      const res = await h.client().query<{
        currency: string;
      }>(`SELECT "currency" FROM "${table}" ORDER BY "currency"`);
      codes[table] = res.rows.map((r) => r.currency);
    }
    return codes;
  }

  /** Every spelling this migration is meant to clean, across the three tables. */
  async function storeDirtyRows() {
    const user = await makeUser(h.db());
    for (const code of [" zar", "usd", "R", "Euro", "EUR", "US$ ", "€"]) {
      await storePayment(user.id, code);
    }
    for (const code of ["zar ", "Dollars", "euros"]) {
      await storeClaim(user.id, code);
    }
    await storeBudget("kitchen", "rand");
    await storeBudget("finance", " usd ");
    await storeBudget("power_and_lighting", "EUR");
    return user;
  }

  it("cleans every stored code to ZAR, USD or EUR, twice without change, and then takes the constraint", async () => {
    await dropChecks();
    const user = await storeDirtyRows();

    await h.client().exec(NORMALISE_SQL);
    const once = await storedCodes();
    await h.client().exec(NORMALISE_SQL);
    expect(await storedCodes()).toEqual(once);

    expect(once).toEqual({
      payments: ["EUR", "EUR", "EUR", "USD", "USD", "ZAR", "ZAR"],
      reimbursements: ["EUR", "USD", "ZAR"],
      team_budgets: ["EUR", "USD", "ZAR"],
    });
    for (const codes of Object.values(once)) {
      for (const code of codes) expect(CURRENCIES).toContain(code);
    }

    await h.client().exec(CHECK_SQL);

    const err = await storePayment(user.id, "GBP").catch((e: unknown) => e);
    expect(sqlState(err)).toBe("23514");
    const claimErr = await storeClaim(user.id, "zar").catch((e: unknown) => e);
    expect(sqlState(claimErr)).toBe("23514");
    const budgetErr = await storeBudget("structures", "usd").catch(
      (e: unknown) => e,
    );
    expect(sqlState(budgetErr)).toBe("23514");
  });

  it("stops on a code it cannot map, and the whole run rolls back", async () => {
    await dropChecks();
    const user = await makeUser(h.db());
    await storePayment(user.id, "GBP");
    await storeClaim(user.id, " usd");

    // drizzle's migrator runs every pending migration in one transaction.
    const err = await h
      .client()
      .transaction((tx) => tx.exec(NORMALISE_SQL))
      .catch((e: unknown) => e);

    expect((err as Error).message).toContain(UNMAPPED_MESSAGE);
    expect(await storedCodes()).toEqual({
      payments: ["GBP"],
      reimbursements: [" usd"],
      team_budgets: [],
    });
  });

  it("the constraint cannot go on while a dirty code is stored, which is why 0046 runs first", async () => {
    await dropChecks();
    const user = await makeUser(h.db());
    await storePayment(user.id, "usd");

    const err = await h
      .client()
      .exec(CHECK_SQL)
      .catch((e: unknown) => e);
    expect(sqlState(err)).toBe("23514");
  });
});
