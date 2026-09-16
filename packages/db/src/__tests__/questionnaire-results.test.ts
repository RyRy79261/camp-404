import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import {
  listActivationResponses,
  listActivationsForCycle,
  listResultCycles,
} from "../questionnaire-results";
import * as schema from "../schema";

// The results read, against real Postgres — everything under test is a join, a
// WHERE clause or a foreign key's ON DELETE behaviour, which is exactly the set
// of things a mock would happily lie about.

const KEY = "feedback";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function answer(
  db: DB,
  input: {
    userId: string;
    cycle: number;
    responses: Record<string, unknown>;
    activationId?: string | null;
    completedAt?: Date | null;
    definitionKey?: string;
  },
): Promise<void> {
  await db.insert(schema.questionnaireResponses).values({
    userId: input.userId,
    definitionKey: input.definitionKey ?? KEY,
    definitionVersion: "1",
    cycle: input.cycle,
    responses: input.responses as never,
    activationId: input.activationId ?? null,
    completedAt:
      input.completedAt === undefined
        ? new Date("2026-02-01T00:00:00Z")
        : input.completedAt,
  });
}

async function gate(
  db: DB,
  input: {
    userId: string;
    activationId: string | null;
    status?: (typeof schema.requiredActionStatusEnum.enumValues)[number];
  },
): Promise<void> {
  await db.insert(schema.requiredActions).values({
    userId: input.userId,
    type: "questionnaire",
    actionKey: KEY,
    version: "1",
    activationId: input.activationId,
    title: "Camp feedback",
    status: input.status ?? "pending",
  });
}

describe("listActivationResponses — the re-send trap", () => {
  const h = useTestDb();

  it("still resolves the earlier send's answers after the questionnaire is re-sent", async () => {
    const db = h.db();
    const answered = await makeUser(db, { displayName: "Ada" });
    const silent = await makeUser(db, { displayName: "Grace" });

    // Send one: Ada answers it and her gate completes.
    const first = await makeActivation(db, { status: "closed", cycle: 1 });
    await answer(db, {
      userId: answered.id,
      cycle: 1,
      responses: { q1: "yes" },
      activationId: first.id,
    });

    // Send two, the same year. required_actions is unique on
    // (user, actionKey), so the re-send OVERWRITES both members' gates in
    // place — Ada's row stops pointing at the send she actually answered.
    const second = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: answered.id, activationId: second.id });
    await gate(db, { userId: silent.id, activationId: second.id });

    const rows = await listActivationResponses({
      definitionKey: KEY,
      cycle: 1,
    });

    const ada = rows.find((r) => r.userId === answered.id);
    // The whole point: her answers belong to the first send, her gate to the
    // second, and the read is keyed on neither — it is keyed on (key, cycle).
    expect(ada?.responses).toEqual({ q1: "yes" });
    expect(ada?.completedAt).not.toBeNull();
    expect(ada?.gateActivationId).toBe(second.id);
    expect(rows.find((r) => r.userId === silent.id)?.responses).toBeNull();
  });

  it("keeps the answers when the activation they were given under is deleted", async () => {
    const db = h.db();
    const user = await makeUser(db, { displayName: "Ada" });
    const act = await makeActivation(db, { status: "closed", cycle: 1 });
    await answer(db, {
      userId: user.id,
      cycle: 1,
      responses: { q1: "yes" },
      activationId: act.id,
    });

    // questionnaire_responses.activation_id is ON DELETE SET NULL, so the link
    // a result filter would have relied on is genuinely gone.
    await db
      .delete(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, act.id));

    const rows = await listActivationResponses({
      definitionKey: KEY,
      cycle: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.responses).toEqual({ q1: "yes" });
  });
});

describe("listActivationResponses — the year namespace", () => {
  const h = useTestDb();

  it("returns only the cycle asked for", async () => {
    const db = h.db();
    const user = await makeUser(db, { displayName: "Ada" });
    await answer(db, { userId: user.id, cycle: 1, responses: { q1: "2026" } });
    await answer(db, { userId: user.id, cycle: 2, responses: { q1: "2027" } });

    const lastYear = await listActivationResponses({
      definitionKey: KEY,
      cycle: 1,
    });
    const thisYear = await listActivationResponses({
      definitionKey: KEY,
      cycle: 2,
    });

    expect(lastYear[0]?.responses).toEqual({ q1: "2026" });
    expect(thisYear[0]?.responses).toEqual({ q1: "2027" });
  });

  it("shows a member gated this year with no answers for the year being viewed", async () => {
    const db = h.db();
    const user = await makeUser(db, { displayName: "Ada" });
    await answer(db, { userId: user.id, cycle: 1, responses: { q1: "2026" } });
    const act = await makeActivation(db, { status: "open", cycle: 2 });
    await gate(db, { userId: user.id, activationId: act.id });

    const rows = await listActivationResponses({
      definitionKey: KEY,
      cycle: 2,
    });
    expect(rows).toHaveLength(1);
    // Gated for 2027, but last year's answer must not leak into this year's.
    expect(rows[0]?.responses).toBeNull();
    expect(rows[0]?.gateStatus).toBe("pending");
  });

  it("ignores another questionnaire's answers", async () => {
    const db = h.db();
    const user = await makeUser(db, { displayName: "Ada" });
    await answer(db, {
      userId: user.id,
      cycle: 1,
      responses: { q1: "other" },
      definitionKey: "dietary",
    });

    expect(
      await listActivationResponses({ definitionKey: KEY, cycle: 1 }),
    ).toEqual([]);
  });

  it("leaves out members who were never asked and never answered", async () => {
    const db = h.db();
    const asked = await makeUser(db, { displayName: "Ada" });
    await makeUser(db, { displayName: "Bystander" });
    const act = await makeActivation(db, { status: "open", cycle: 1 });
    await gate(db, { userId: asked.id, activationId: act.id });

    const rows = await listActivationResponses({
      definitionKey: KEY,
      cycle: 1,
    });
    expect(rows.map((r) => r.displayName)).toEqual(["Ada"]);
  });
});

describe("listResultCycles / listActivationsForCycle", () => {
  const h = useTestDb();

  it("lists every year with a send or an answer, newest first", async () => {
    const db = h.db();
    const user = await makeUser(db);
    await answer(db, { userId: user.id, cycle: 1, responses: { q1: "a" } });
    await answer(db, { userId: user.id, cycle: 3, responses: { q1: "b" } });
    // A year that was sent in but never answered still has results to show.
    await makeActivation(db, { status: "closed", cycle: 2 });

    expect(await listResultCycles(KEY)).toEqual([3, 2, 1]);
  });

  it("returns one year's sends, newest first, and nothing from other years", async () => {
    const db = h.db();
    await makeActivation(db, {
      status: "closed",
      cycle: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    const open = await makeActivation(db, {
      status: "open",
      cycle: 1,
      createdAt: new Date("2026-06-01T00:00:00Z"),
    });
    await makeActivation(db, { status: "closed", cycle: 2 });

    const acts = await listActivationsForCycle(KEY, 1);
    expect(acts).toHaveLength(2);
    expect(acts[0]?.id).toBe(open.id);
    expect(acts.every((a) => a.cycle === 1)).toBe(true);
  });
});
