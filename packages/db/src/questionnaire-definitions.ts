import { and, eq } from "drizzle-orm";
import type { BuilderQuestionnaire } from "@camp404/types";
import { createHttpDb } from "./index";
import { questionnaireDefinitions, questionnaireVersions } from "./schema";

type DefinitionStatus = "draft" | "published" | "unpublished";

// Code-questionnaire keys a captain-authored questionnaire may never claim —
// they map to bespoke pages/tables. The builder hub excludes them and the
// writer refuses to mint them.
export const RESERVED_DEFINITION_KEYS: ReadonlySet<string> = new Set([
  "burner_profile",
  "dietary_requirements",
  "driver_profile",
  "driver_profiles",
]);

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

// --- Builder writers (Phase C) -------------------------------------------

export interface DefinitionListRow {
  key: string;
  title: string;
  status: DefinitionStatus;
  version: string | null;
  createdBy: string | null;
  definition: unknown;
  updatedAt: Date;
}

/** All builder-authored definition rows (reserved code keys excluded). */
export async function listDefinitionRows(): Promise<DefinitionListRow[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      key: questionnaireDefinitions.key,
      title: questionnaireDefinitions.title,
      status: questionnaireDefinitions.status,
      version: questionnaireDefinitions.version,
      createdBy: questionnaireDefinitions.createdBy,
      definition: questionnaireDefinitions.definition,
      updatedAt: questionnaireDefinitions.updatedAt,
    })
    .from(questionnaireDefinitions);
  return rows.filter((r) => !RESERVED_DEFINITION_KEYS.has(r.key));
}

/** True when a key is already taken — a stored row OR a reserved code key. */
export async function definitionKeyExists(key: string): Promise<boolean> {
  if (RESERVED_DEFINITION_KEYS.has(key)) return true;
  const db = createHttpDb();
  const [row] = await db
    .select({ key: questionnaireDefinitions.key })
    .from(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key))
    .limit(1);
  return Boolean(row);
}

export interface DefinitionMetaRow {
  key: string;
  status: DefinitionStatus;
  version: string | null;
  createdBy: string | null;
}

/** A definition's ownership + lifecycle, for the edit/delete permission check. */
export async function getDefinitionMetaRow(
  key: string,
): Promise<DefinitionMetaRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      key: questionnaireDefinitions.key,
      status: questionnaireDefinitions.status,
      version: questionnaireDefinitions.version,
      createdBy: questionnaireDefinitions.createdBy,
    })
    .from(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key))
    .limit(1);
  return row ?? null;
}

/** Insert a brand-new draft (status draft, version null). */
export async function insertDefinitionDraft(input: {
  key: string;
  title: string;
  createdBy: string | null;
  definition: BuilderQuestionnaire;
}): Promise<void> {
  const db = createHttpDb();
  await db.insert(questionnaireDefinitions).values({
    key: input.key,
    title: input.title,
    definition: input.definition,
    status: "draft",
    version: null,
    createdBy: input.createdBy,
  });
}

/**
 * Autosave the working head: rewrites the definition jsonb and keeps the display
 * `title` column in sync with definition.title. Never touches key/version/status.
 */
export async function updateDefinitionRow(input: {
  key: string;
  title: string;
  definition: BuilderQuestionnaire;
}): Promise<void> {
  const db = createHttpDb();
  await db
    .update(questionnaireDefinitions)
    .set({
      title: input.title,
      definition: input.definition,
      updatedAt: new Date(),
    })
    .where(eq(questionnaireDefinitions.key, input.key));
}

/** A row's title + definition for cloning, or null. */
export async function getDefinitionRowForClone(
  key: string,
): Promise<{ title: string; definition: unknown } | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      title: questionnaireDefinitions.title,
      definition: questionnaireDefinitions.definition,
    })
    .from(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key))
    .limit(1);
  return row ?? null;
}

/** Hard-delete a definition row (caller enforces draft-only + ownership). */
export async function deleteDefinitionRow(key: string): Promise<void> {
  const db = createHttpDb();
  await db
    .delete(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key));
}
