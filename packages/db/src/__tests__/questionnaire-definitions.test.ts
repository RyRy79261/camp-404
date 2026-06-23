import { describe, expect, it } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  definitionKeyExists,
  deleteDefinitionRow,
  getDefinitionMetaRow,
  getQuestionnaireDefinitionRow,
  getQuestionnaireVersionRow,
  insertDefinitionDraft,
  listDefinitionRows,
  updateDefinitionRow,
} from "../questionnaire-definitions";
import * as schema from "../schema";

function def(title: string): BuilderQuestionnaire {
  return {
    version: "1",
    title,
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
              prompt: "Name",
              required: false,
              maxLength: 120,
            },
          },
        ],
      },
    ],
  };
}

describe("definition writers / readers", () => {
  const h = useTestDb();

  it("inserts a draft and reads it back (status draft, version null)", async () => {
    const db = h.db();
    const owner = await makeUser(db);
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: owner.id,
      definition: def("Camp feedback"),
    });

    const row = await getQuestionnaireDefinitionRow("feedback");
    expect(row?.title).toBe("Camp feedback");

    const meta = await getDefinitionMetaRow("feedback");
    expect(meta).toMatchObject({
      key: "feedback",
      status: "draft",
      createdBy: owner.id,
    });
  });

  it("updateDefinitionRow rewrites definition + title, never status/version", async () => {
    const db = h.db();
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: null,
      definition: def("Camp feedback"),
    });
    await updateDefinitionRow({
      key: "feedback",
      title: "Renamed",
      definition: def("Renamed"),
    });

    const [row] = await db
      .select()
      .from(schema.questionnaireDefinitions);
    expect(row!.title).toBe("Renamed");
    expect(row!.status).toBe("draft");
    expect(row!.version).toBeNull();
  });

  it("listDefinitionRows excludes reserved code keys", async () => {
    const db = h.db();
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: null,
      definition: def("Camp feedback"),
    });
    // a reserved code-questionnaire row (would be seeded in prod)
    await db.insert(schema.questionnaireDefinitions).values({
      key: "burner_profile",
      title: "Burner profile",
      definition: def("Burner profile"),
      status: "published",
      version: "1",
      createdBy: null,
    });

    const rows = await listDefinitionRows();
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("feedback");
    expect(keys).not.toContain("burner_profile");
  });

  it("definitionKeyExists is true for stored rows AND reserved keys", async () => {
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: null,
      definition: def("Camp feedback"),
    });
    expect(await definitionKeyExists("feedback")).toBe(true);
    expect(await definitionKeyExists("burner_profile")).toBe(true); // reserved
    expect(await definitionKeyExists("not-a-key")).toBe(false);
  });

  it("getQuestionnaireVersionRow round-trips an immutable snapshot", async () => {
    const db = h.db();
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: null,
      definition: def("Camp feedback"),
    });
    await db.insert(schema.questionnaireVersions).values({
      definitionKey: "feedback",
      version: "1",
      definition: def("Camp feedback"),
    });

    const v = await getQuestionnaireVersionRow("feedback", "1");
    expect(v?.definitionKey).toBe("feedback");
    expect(v?.version).toBe("1");
    expect(await getQuestionnaireVersionRow("feedback", "99")).toBeNull();
  });

  it("deleteDefinitionRow removes the row", async () => {
    await insertDefinitionDraft({
      key: "feedback",
      title: "Camp feedback",
      createdBy: null,
      definition: def("Camp feedback"),
    });
    await deleteDefinitionRow("feedback");
    expect(await getQuestionnaireDefinitionRow("feedback")).toBeNull();
  });
});
