import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  FEE_TIMINGS,
  validateBuilderQuestionnaire,
} from "@camp404/types";
import { questionnaireRoleMirror } from "@camp404/core";
import { fromBuilderQuestionnaire } from "@camp404/types";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";

// 0124: Andrew's live "camp-fees-the-money-oracle" asks when each member can
// pay, so his question q_27b642d9 gets the fee_timing role, his option_1..6
// become the six fee timings, the stored answers follow, and each finished
// answer fills the member's pledge "by when". The harness migrates an empty
// database, so these tests store his questionnaire first and run the
// migration's SQL again (twice: it must be idempotent).

const MIGRATION_SQL = readFileSync(
  new URL("../../migrations/0124_money_oracle_fee_timing.sql", import.meta.url),
  "utf8",
);
const KEY = "camp-fees-the-money-oracle";
const Q = "q_27b642d9";
const LABELS = [
  "All by end of November",
  "All by end of December",
  "Part by end of November, rest later",
  "Part by end of December, rest later",
  "All by 15 January 2027",
  "I'll talk to a captain",
];

/** Andrew's questionnaire as production stores it (the builder's shape). */
function oracle(values = LABELS.map((_, i) => `option_${i + 1}`)) {
  return {
    version: "1",
    title: "Camp fees: the money oracle",
    pages: [
      {
        id: "p1",
        type: "question",
        title: "Money",
        blocks: [
          {
            kind: "question",
            question: {
              id: "q_amount",
              kind: "short_text",
              prompt: "How much?",
              required: false,
            },
          },
          {
            kind: "question",
            question: {
              id: Q,
              kind: "single_select",
              prompt: "When can you pay?",
              required: true,
              allowOther: false,
              options: values.map((value, i) => ({ value, label: LABELS[i]! })),
            },
          },
          {
            kind: "question",
            question: {
              id: "q_why",
              kind: "long_text",
              prompt: "Tell us more",
              required: false,
            },
            visibleIf: { fieldId: Q, op: "eq", value: "option_6" },
          },
        ],
      },
    ],
  };
}

describe("0124_money_oracle_fee_timing", () => {
  const h = useTestDb();

  async function store(definition: unknown) {
    const db = h.db();
    await db.insert(schema.questionnaireDefinitions).values({
      key: KEY,
      title: "Camp fees: the money oracle",
      definition: definition as never,
      status: "published",
      version: "1",
    });
    await db.insert(schema.questionnaireVersions).values({
      definitionKey: KEY,
      version: "1",
      definition: definition as never,
    });
  }

  async function answer(
    userId: string,
    value: string,
    options: { cycle?: number; done?: boolean } = {},
  ) {
    await h
      .db()
      .insert(schema.questionnaireResponses)
      .values({
        userId,
        definitionKey: KEY,
        definitionVersion: "1",
        cycle: options.cycle ?? 2027,
        responses: { q_amount: "R7200", [Q]: value },
        completedAt: options.done === false ? null : new Date(),
      });
  }

  const run = async () => {
    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);
  };

  it("gives the question the role and the timings, maps answers and fills by-when", async () => {
    const db = h.db();
    await store(oracle());
    const [nov, dec, talk, draft, already, erased] = await Promise.all(
      [0, 1, 2, 3, 4, 5].map(() => makeUser(db)),
    );
    await db
      .update(schema.users)
      .set({ sanitised: true })
      .where(eq(schema.users.id, erased!.id));
    await answer(nov!.id, "option_3");
    await answer(dec!.id, "option_4", { cycle: 2026 });
    await answer(talk!.id, "option_6");
    await answer(draft!.id, "option_1", { done: false });
    await answer(already!.id, "option_1");
    await answer(erased!.id, "option_2");
    await db.insert(schema.duesAccounts).values({
      userId: already!.id,
      cycle: 2027,
      pledgedAmountCents: 500_000,
      payBy: "all_by_15_jan",
    });

    await run();

    for (const table of [
      schema.questionnaireDefinitions,
      schema.questionnaireVersions,
    ]) {
      const [row] = await db.select({ d: table.definition }).from(table);
      const definition = BuilderQuestionnaire.parse(row!.d);
      expect(validateBuilderQuestionnaire(definition)).toEqual([]);
      const blocks = definition.pages[0]!.blocks;
      const when = blocks[1]!.kind === "question" ? blocks[1]!.question : null;
      expect(when).toMatchObject({
        id: Q,
        role: "fee_timing",
        options: FEE_TIMINGS.map((value, i) => ({ value, label: LABELS[i] })),
      });
      expect(when).not.toHaveProperty("allowOther");
      expect(blocks[2]).toMatchObject({
        visibleIf: { fieldId: Q, op: "eq", value: "talk_to_captain" },
      });
      // A submit now mirrors his answer onto the pledge.
      expect(
        questionnaireRoleMirror(fromBuilderQuestionnaire(definition), {
          [Q]: "part_by_end_nov",
        }).feeTiming,
      ).toEqual({ payBy: "part_by_end_nov" });
    }

    const answers = await db
      .select({
        userId: schema.questionnaireResponses.userId,
        responses: schema.questionnaireResponses.responses,
      })
      .from(schema.questionnaireResponses);
    const answerOf = (id: string) =>
      answers.find((a) => a.userId === id)!.responses;
    expect(answerOf(nov!.id)).toEqual({
      q_amount: "R7200",
      [Q]: "part_by_end_nov",
    });
    expect(answerOf(draft!.id)[Q]).toBe("all_by_end_nov");

    const accounts = await db
      .select({
        userId: schema.duesAccounts.userId,
        cycle: schema.duesAccounts.cycle,
        payBy: schema.duesAccounts.payBy,
        amount: schema.duesAccounts.pledgedAmountCents,
      })
      .from(schema.duesAccounts);
    const sorted = (rows: typeof accounts) =>
      [...rows].sort((a, b) => a.userId.localeCompare(b.userId));
    expect(sorted(accounts)).toEqual(
      sorted([
        {
          userId: nov!.id,
          cycle: 2027,
          payBy: "part_by_end_nov",
          amount: null,
        },
        {
          userId: dec!.id,
          cycle: 2026,
          payBy: "part_by_end_dec",
          amount: null,
        },
        {
          userId: talk!.id,
          cycle: 2027,
          payBy: "talk_to_captain",
          amount: null,
        },
        // Their own by-when stays; a draft and an erased member fill nothing.
        {
          userId: already!.id,
          cycle: 2027,
          payBy: "all_by_15_jan",
          amount: 500_000,
        },
      ]),
    );
  });

  it("changes nothing when the questionnaire is absent", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db.insert(schema.questionnaireResponses).values({
      userId: member.id,
      definitionKey: "another-form",
      definitionVersion: "1",
      cycle: 2027,
      responses: { [Q]: "option_1" },
      completedAt: new Date(),
    });
    await run();
    const [row] = await db
      .select({ responses: schema.questionnaireResponses.responses })
      .from(schema.questionnaireResponses);
    expect(row!.responses).toEqual({ [Q]: "option_1" });
    expect(await db.select().from(schema.duesAccounts)).toEqual([]);
  });

  it("leaves a question whose options are not his six alone", async () => {
    const db = h.db();
    const changed = oracle(["a", "b", "c", "d", "e", "f"]);
    await store(changed);
    const member = await makeUser(db);
    await answer(member.id, "a");
    await run();
    const [row] = await db
      .select({ d: schema.questionnaireDefinitions.definition })
      .from(schema.questionnaireDefinitions);
    expect(row!.d).toEqual(changed);
    expect(await db.select().from(schema.duesAccounts)).toEqual([]);
  });
});
