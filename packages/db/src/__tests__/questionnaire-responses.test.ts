import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  loadQuestionnaireResponse,
  upsertQuestionnaireResponse,
} from "../questionnaire-responses";
import * as schema from "../schema";

// The year namespace, at the response store. These run against real Postgres
// because everything under test lives in a WHERE clause, an ORDER BY, or a
// unique index: the carry/fresh split, the seed trap, and the three-column
// ON CONFLICT target that keeps last year's row alive.

const KEY = "feedback";

describe("loadQuestionnaireResponse — carry vs fresh", () => {
  const h = useTestDb();

  it("carry reads last year's row and reports seededFromCycle with completedAt forced null", async () => {
    const db = h.db();
    const user = await makeUser(db);
    await db.insert(schema.questionnaireResponses).values({
      userId: user.id,
      definitionKey: KEY,
      definitionVersion: "1",
      cycle: 1,
      responses: { q1: "last year" },
      completedAt: new Date("2025-01-01T00:00:00Z"),
    });

    const row = await loadQuestionnaireResponse(user.id, KEY, {
      cycle: 2,
      carryOver: true,
    });

    expect(row?.responses).toEqual({ q1: "last year" });
    expect(row?.seededFromCycle).toBe(1);
    // The seed trap: a prefilled form must not satisfy its own gate.
    expect(row?.completedAt).toBeNull();
  });

  it("fresh finds nothing when only last year's row exists", async () => {
    const db = h.db();
    const user = await makeUser(db);
    await db.insert(schema.questionnaireResponses).values({
      userId: user.id,
      definitionKey: KEY,
      definitionVersion: "1",
      cycle: 1,
      responses: { q1: "last year" },
      completedAt: new Date("2025-01-01T00:00:00Z"),
    });

    const row = await loadQuestionnaireResponse(user.id, KEY, {
      cycle: 2,
      carryOver: false,
    });

    expect(row).toBeNull();
  });

  it("returns this cycle's own row unseeded, with completedAt intact", async () => {
    const db = h.db();
    const user = await makeUser(db);
    const completedAt = new Date("2026-01-01T00:00:00Z");
    for (const [cycle, answer] of [
      [1, "last year"],
      [2, "this year"],
    ] as const) {
      await db.insert(schema.questionnaireResponses).values({
        userId: user.id,
        definitionKey: KEY,
        definitionVersion: "1",
        cycle,
        responses: { q1: answer },
        completedAt,
      });
    }

    for (const carryOver of [true, false]) {
      const row = await loadQuestionnaireResponse(user.id, KEY, {
        cycle: 2,
        carryOver,
      });
      // `desc(cycle)` + limit 1: carry never reaches past the current cycle's
      // own row when one exists.
      expect(row?.responses).toEqual({ q1: "this year" });
      expect(row?.seededFromCycle).toBeNull();
      expect(row?.completedAt).toEqual(completedAt);
    }
  });
});

describe("upsertQuestionnaireResponse — writes never fall back a cycle", () => {
  const h = useTestDb();

  it("a write in cycle 2 leaves cycle 1's row intact and readable", async () => {
    const db = h.db();
    const user = await makeUser(db);
    const cycleOneCompletedAt = new Date("2025-01-01T00:00:00Z");
    await upsertQuestionnaireResponse({
      userId: user.id,
      definitionKey: KEY,
      definitionVersion: "1",
      cycle: 1,
      responses: { q1: "last year" },
      completedAt: cycleOneCompletedAt,
    });

    await upsertQuestionnaireResponse({
      userId: user.id,
      definitionKey: KEY,
      definitionVersion: "2",
      cycle: 2,
      responses: { q1: "this year" },
      completedAt: null,
    });

    const rows = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(
        and(
          eq(schema.questionnaireResponses.userId, user.id),
          eq(schema.questionnaireResponses.definitionKey, KEY),
        ),
      )
      .orderBy(asc(schema.questionnaireResponses.cycle));

    expect(rows).toHaveLength(2);
    expect(rows[0]!.cycle).toBe(1);
    expect(rows[0]!.responses).toEqual({ q1: "last year" });
    expect(rows[0]!.completedAt).toEqual(cycleOneCompletedAt);
    expect(rows[1]!.cycle).toBe(2);
    expect(rows[1]!.responses).toEqual({ q1: "this year" });
  });

  it("re-upserting the same cycle updates in place", async () => {
    const db = h.db();
    const user = await makeUser(db);
    for (const answer of ["draft", "final"]) {
      await upsertQuestionnaireResponse({
        userId: user.id,
        definitionKey: KEY,
        definitionVersion: "1",
        cycle: 2,
        responses: { q1: answer },
      });
    }

    const rows = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, user.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.responses).toEqual({ q1: "final" });
  });

  it("the unique index permits one row per (user, key, cycle) but not two", async () => {
    const db = h.db();
    const user = await makeUser(db);
    const insert = (cycle: number) =>
      db.insert(schema.questionnaireResponses).values({
        userId: user.id,
        definitionKey: KEY,
        definitionVersion: "1",
        cycle,
        responses: {},
      });

    await insert(1);
    // A different cycle is a different row — that is the whole point of widening
    // the index.
    await insert(2);
    // The same cycle twice is not.
    await expect(insert(2)).rejects.toMatchObject({
      cause: { code: "23505" },
    });
  });
});
