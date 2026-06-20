import { and, eq } from "drizzle-orm";
import { createHttpDb } from "./index";
import { questionnaireDefinitions, questionnaireVersions } from "./schema";

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

export interface QuestionnaireVersionRow {
  definitionKey: string;
  version: string;
  /** The immutable published snapshot — validated by the app facade before use. */
  definition: unknown;
}

/**
 * Read one immutable published-version snapshot, or null when that
 * (key, version) was never published. The runner loads by the (key, version)
 * an activation pinned so historical responses render against the exact version
 * they were answered under.
 */
export async function getQuestionnaireVersionRow(
  key: string,
  version: string,
): Promise<QuestionnaireVersionRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      definitionKey: questionnaireVersions.definitionKey,
      version: questionnaireVersions.version,
      definition: questionnaireVersions.definition,
    })
    .from(questionnaireVersions)
    .where(
      and(
        eq(questionnaireVersions.definitionKey, key),
        eq(questionnaireVersions.version, version),
      ),
    )
    .limit(1);
  return row ?? null;
}
