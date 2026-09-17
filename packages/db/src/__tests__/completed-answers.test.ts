import { describe, expect, it } from "vitest";
import {
  flattenQuestions,
  type BuilderQuestionnaire,
  type Questionnaire,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  listCompletedQuestionnaireAnswers,
  upsertQuestionnaireResponse,
} from "../questionnaire-responses";
import * as schema from "../schema";

// My forms lets a member reread what they answered. It must show the version
// they answered, only finished answers, and only their own.

/** A version published before the move, stored in the builder's shape. */
function builderDef(prompt: string): BuilderQuestionnaire {
  return {
    version: "1",
    title: "Camp feedback",
    pages: [
      {
        id: "p1",
        type: "question",
        title: "",
        blocks: [
          {
            kind: "question",
            question: {
              id: "q1",
              kind: "short_text",
              prompt,
              required: false,
              maxLength: 120,
            },
          },
        ],
      },
    ],
  };
}

/** A version published since, stored in the unified shape. */
function unifiedDef(prompt: string): Questionnaire {
  return {
    version: "1",
    title: "Camp feedback",
    pages: [
      {
        id: "p1",
        kind: "questions",
        title: "Feedback",
        questions: [
          {
            id: "q1",
            kind: "short_text",
            prompt,
            required: false,
            maxLength: 120,
          },
        ],
      },
    ],
  };
}

// v1 in the builder's shape, anything later unified: snapshots are never
// rewritten, so a member's older answers sit against an older shape.
const def = (version: string, prompt: string) =>
  version === "v1" ? builderDef(prompt) : unifiedDef(prompt);

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function publish(db: DB, version: string, prompt: string) {
  await db
    .insert(schema.questionnaireDefinitions)
    .values({
      key: "feedback",
      title: "Camp feedback",
      definition: def(version, prompt),
      status: "published",
      version,
    })
    .onConflictDoUpdate({
      target: schema.questionnaireDefinitions.key,
      set: { definition: def(version, prompt), version },
    });
  await db.insert(schema.questionnaireVersions).values({
    definitionKey: "feedback",
    version,
    definition: def(version, prompt),
  });
}

describe("listCompletedQuestionnaireAnswers", () => {
  const h = useTestDb();

  it("shows each finished answer against the version it was given for", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await publish(db, "v1", "What went well?");
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: "feedback",
      definitionVersion: "v1",
      cycle: 2025,
      responses: { q1: "The kitchen" },
      completedAt: new Date("2025-05-01T10:00:00Z"),
    });
    // The questionnaire is reworded before next year's send.
    await publish(db, "v2", "What should change?");
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: "feedback",
      definitionVersion: "v2",
      cycle: 2026,
      responses: { q1: "More shade" },
      completedAt: new Date("2026-05-01T10:00:00Z"),
    });

    const answers = await listCompletedQuestionnaireAnswers(member.id);
    expect(
      answers.map((a) => [
        a.cycle,
        a.responses.q1,
        flattenQuestions(a.questionnaire)[0]!.prompt,
      ]),
    ).toEqual([
      [2026, "More shade", "What should change?"],
      [2025, "The kitchen", "What went well?"],
    ]);

    const one = await listCompletedQuestionnaireAnswers(member.id, {
      definitionKey: "feedback",
      cycle: 2025,
    });
    expect(one).toHaveLength(1);
    expect(one[0]!.responses.q1).toBe("The kitchen");
  });

  it("reads the builder-shaped snapshot and the unified one as the same model", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await publish(db, "v1", "What went well?");
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: "feedback",
      definitionVersion: "v1",
      cycle: 2025,
      responses: { q1: "The kitchen" },
      completedAt: new Date("2025-05-01T10:00:00Z"),
    });
    const [answers] = await listCompletedQuestionnaireAnswers(member.id);
    expect(answers!.questionnaire.pages[0]).toMatchObject({
      kind: "questions",
      pageType: "question",
      questions: [{ id: "q1", prompt: "What went well?" }],
    });
  });

  it("leaves out a finished answer whose pinned snapshot is malformed", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await db.insert(schema.questionnaireDefinitions).values({
      key: "broken",
      title: "Broken",
      definition: unifiedDef("Broken?"),
      status: "published",
      version: "v1",
    });
    await db.insert(schema.questionnaireVersions).values({
      definitionKey: "broken",
      version: "v1",
      definition: { version: "1", pages: "not pages" } as never,
    });
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: "broken",
      definitionVersion: "v1",
      cycle: 2026,
      responses: { q1: "lost" },
      completedAt: new Date("2026-05-01T10:00:00Z"),
    });
    expect(await listCompletedQuestionnaireAnswers(member.id)).toEqual([]);
  });

  it("leaves out unfinished answers and other members' answers", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await publish(db, "v1", "What went well?");
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: "feedback",
      definitionVersion: "v1",
      cycle: 2026,
      responses: { q1: "half done" },
    });
    await upsertQuestionnaireResponse({
      userId: other.id,
      definitionKey: "feedback",
      definitionVersion: "v1",
      cycle: 2026,
      responses: { q1: "theirs" },
      completedAt: new Date("2026-05-01T10:00:00Z"),
    });

    expect(await listCompletedQuestionnaireAnswers(member.id)).toEqual([]);
    expect(await listCompletedQuestionnaireAnswers(other.id)).toHaveLength(1);
  });
});
