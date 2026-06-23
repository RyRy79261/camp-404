import { describe, expect, it } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";
import { useTestDb } from "./_harness";
import {
  getQuestionnaireDefinitionRow,
  insertDefinitionDraft,
  listDefinitionRows,
} from "../questionnaire-definitions";

const DEF: BuilderQuestionnaire = {
  version: "1",
  title: "Smoke",
  pages: [{ id: "p1", type: "question", title: "", blocks: [] }],
};

// Proves the whole chain wires up: PGlite boots, the committed migrations apply
// cleanly to it, the schema matches, and a production writer/reader round-trips
// through the injected handle. If this is green, the heavier invariant suites
// can rely on the harness.
describe("pglite harness", () => {
  useTestDb();

  it("boots, migrates, and round-trips a definition through the prod writer", async () => {
    await insertDefinitionDraft({
      key: "smoke",
      title: "Smoke",
      createdBy: null,
      definition: DEF,
    });

    const row = await getQuestionnaireDefinitionRow("smoke");
    expect(row?.title).toBe("Smoke");

    const rows = await listDefinitionRows();
    expect(rows.map((r) => r.key)).toContain("smoke");
  });

  it("truncates between tests (the prior row is gone)", async () => {
    const row = await getQuestionnaireDefinitionRow("smoke");
    expect(row).toBeNull();
  });
});
