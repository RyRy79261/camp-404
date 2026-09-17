import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import { listMemberQuestionnaireGates } from "../activations";
import * as schema from "../schema";

// The captain's view of one member's questionnaires: everything still pending,
// the code questionnaires, and this year's sends, oldest first. Last year's
// finished sends drop off so the list does not grow every year.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function foundedAt(db: DB, year: number): Promise<void> {
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
    .set({
      config: {
        ...row!.config,
        cycles: [
          { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
        ],
      },
    })
    .where(eq(schema.campSettings.id, true));
}

const at = (day: number) => new Date(Date.UTC(2027, 0, day));

describe("listMemberQuestionnaireGates", () => {
  const h = useTestDb();

  it("lists pending, code and this year's gates, and drops last year's finished ones", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const other = await makeUser(db);
    const lastYear = await makeActivation(db, {
      cycle: 2026,
      title: "Survey 2026",
    });
    const lastYearOpen = await makeActivation(db, {
      questionnaireKey: "safety",
      cycle: 2026,
      title: "Safety 2026",
    });
    const thisYear = await makeActivation(db, {
      questionnaireKey: "dietary",
      cycle: 2027,
      title: "Dietary",
    });

    await db.insert(schema.requiredActions).values([
      {
        userId: member.id,
        type: "questionnaire",
        actionKey: "burner_profile",
        title: "Complete your burner profile",
        status: "completed",
        createdAt: at(1),
        completedAt: at(2),
      },
      {
        userId: member.id,
        type: "questionnaire",
        actionKey: "feedback",
        activationId: lastYear.id,
        title: "Survey 2026",
        status: "completed",
        createdAt: at(3),
      },
      {
        userId: member.id,
        type: "questionnaire",
        actionKey: "safety",
        activationId: lastYearOpen.id,
        title: "Safety 2026",
        createdAt: at(4),
      },
      {
        userId: member.id,
        type: "questionnaire",
        actionKey: "dietary",
        activationId: thisYear.id,
        title: "Dietary",
        blocking: false,
        dueAt: at(20),
        createdAt: at(5),
      },
      {
        userId: member.id,
        type: "acknowledgement",
        actionKey: "rules",
        title: "Read the rules",
        createdAt: at(6),
      },
      {
        userId: other.id,
        type: "questionnaire",
        actionKey: "dietary",
        activationId: thisYear.id,
        title: "Dietary",
        createdAt: at(5),
      },
    ]);

    const gates = await listMemberQuestionnaireGates(member.id);
    expect(gates.map((g) => [g.actionKey, g.status, g.blocking])).toEqual([
      ["burner_profile", "completed", true],
      ["safety", "pending", true],
      ["dietary", "pending", false],
    ]);
    expect(gates[2]!.dueAt).toEqual(at(20));
  });
});
