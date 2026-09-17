import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getTeamBudget, listTeamBudgets, setTeamBudget } from "../team-budgets";
import * as schema from "../schema";

// Budgets are one per team per year: reads and writes use the camp's current
// year, and migration 0034 moves rows that predate the column into it.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function setYears(db: DB, cycles: unknown) {
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
    .set({ config: { ...(row!.config as object), cycles } as never })
    .where(eq(schema.campSettings.id, true));
}

const OPEN_2027 = [
  {
    year: 2026,
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-06-01T00:00:00.000Z",
  },
  { year: 2027, startedAt: "2026-06-01T00:00:00.000Z", endedAt: null },
];

describe("team budgets", () => {
  const h = useTestDb();

  it("sets this year's budget, keeps unnamed fields, and audits which fields changed", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await setYears(db, OPEN_2027);

    await setTeamBudget({
      team: "kitchen",
      change: { assignedAmount: "5000.00", notes: "Gas and ice" },
      actorId: lead.id,
    });
    const row = await setTeamBudget({
      team: "kitchen",
      change: { perceivedAmount: "6200.00" },
      actorId: lead.id,
    });
    expect(row).toMatchObject({
      team: "kitchen",
      cycle: 2027,
      assignedAmount: "5000.00",
      perceivedAmount: "6200.00",
      notes: "Gas and ice",
    });

    const audit = await db.select().from(schema.auditLog);
    expect(audit.map((a) => a.metadata)).toEqual([
      { team: "kitchen", cycle: 2027, fields: ["assignedAmount", "notes"] },
      { team: "kitchen", cycle: 2027, fields: ["perceivedAmount"] },
    ]);
  });

  it("reads only the current year", async () => {
    const db = h.db();
    await setYears(db, OPEN_2027);
    await db.insert(schema.teamBudgets).values([
      { team: "kitchen", cycle: 2026, assignedAmount: "100.00" },
      { team: "kitchen", cycle: 2027, assignedAmount: "200.00" },
      { team: "structures", cycle: 2026, assignedAmount: "300.00" },
    ]);
    expect((await listTeamBudgets()).map((b) => [b.team, b.cycle])).toEqual([
      ["kitchen", 2027],
    ]);
    expect((await getTeamBudget("kitchen"))?.assignedAmount).toBe("200.00");
    expect(await getTeamBudget("structures")).toBeNull();
  });
});

describe("migration 0034's year step", () => {
  const h = useTestDb();
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        "../../migrations/0034_team_budget_and_adoptee_years.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  // The two UPDATE statements, run again on rows put back on the sentinel.
  const yearSteps = migration
    .split("--> statement-breakpoint")
    .filter((statement) => statement.includes("UPDATE"));

  async function runYearSteps(db: DB) {
    for (const statement of yearSteps) await db.execute(sql.raw(statement));
  }

  it("moves sentinel rows into the open year", async () => {
    const db = h.db();
    await setYears(db, OPEN_2027);
    await db.insert(schema.teamBudgets).values({ team: "kitchen", cycle: 1 });
    await db
      .insert(schema.adoptees)
      .values({ slotNumber: 4, name: "A", cycle: 1 });
    expect(yearSteps).toHaveLength(2);
    await runYearSteps(db);
    expect((await db.select().from(schema.teamBudgets))[0]!.cycle).toBe(2027);
    expect((await db.select().from(schema.adoptees))[0]!.cycle).toBe(2027);
  });

  it("uses the latest year when none or several are open, and leaves a camp with no year alone", async () => {
    const db = h.db();
    await setYears(db, [
      {
        year: 2025,
        startedAt: "2025-01-01T00:00:00.000Z",
        endedAt: "2025-06-01T00:00:00.000Z",
      },
      {
        year: 2026,
        startedAt: "2025-06-01T00:00:00.000Z",
        endedAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    await db.insert(schema.teamBudgets).values({ team: "kitchen", cycle: 1 });
    await runYearSteps(db);
    expect((await db.select().from(schema.teamBudgets))[0]!.cycle).toBe(2026);

    await setYears(db, []);
    await db
      .insert(schema.teamBudgets)
      .values({ team: "structures", cycle: 1 });
    await runYearSteps(db);
    const structures = await db
      .select()
      .from(schema.teamBudgets)
      .where(eq(schema.teamBudgets.team, "structures"));
    expect(structures[0]!.cycle).toBe(1);
  });
});
