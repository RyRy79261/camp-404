import { eq } from "drizzle-orm";
import { createHttpDb } from "./index";
import { questionnaireDefinitions } from "./schema";

// Stored questionnaire-definition reads. A questionnaire's catalogue is the
// @camp404/types `Questionnaire` JSON kept on `questionnaire_definitions`,
// keyed by its stable questionnaire_key. This module stays dumb (just SQL) —
// the app facade (apps/web/lib/questionnaire-definitions.ts) validates the
// JSONB with the zod schema and falls back to the code template + serves the
// E2E test store, mirroring the camp-config split. The writer lands with the
// in-app builder in a later phase.

export interface QuestionnaireDefinitionRow {
  key: string;
  title: string;
  /** The stored catalogue — validated by the app facade before use. */
  definition: unknown;
  updatedAt: Date;
}

/**
 * Read one stored questionnaire definition by key, or null when no row exists
 * yet (the common case until a captain edits it — the facade then serves the
 * code template).
 */
export async function getQuestionnaireDefinitionRow(
  key: string,
): Promise<QuestionnaireDefinitionRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      key: questionnaireDefinitions.key,
      title: questionnaireDefinitions.title,
      definition: questionnaireDefinitions.definition,
      updatedAt: questionnaireDefinitions.updatedAt,
    })
    .from(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key))
    .limit(1);
  return row ?? null;
}
