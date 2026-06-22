import "server-only";

import { randomUUID } from "node:crypto";
import {
  BuilderQuestionnaire,
  flattenBuilderQuestions,
  regenerateBuilderIds,
} from "@camp404/types";
import type { Questionnaire } from "@camp404/types";
import { slugify } from "@camp404/core";
import {
  definitionKeyExists,
  deleteDefinitionRow,
  getDefinitionRowForClone,
  getQuestionnaireDefinitionRow,
  getQuestionnaireVersionRow,
  insertDefinitionDraft,
  listDefinitionRows,
  updateDefinitionRow,
} from "@camp404/db/questionnaire-definitions";
import {
  BURNER_PROFILE_TEMPLATE,
  parseStoredBuilderDefinition,
  parseStoredDefinition,
} from "./questionnaire";
import { isE2ETestMode } from "./test-mode";

// Questionnaire-definition data facade. Reads the stored catalogue from the
// Neon-backed `questionnaire_definitions` table, validating the JSONB with the
// zod schema and falling back to the code template when the row is absent or
// malformed — the same resolve-with-fallback shape camp-config uses. Under
// E2E_TEST_MODE (no database during Playwright) it serves the template
// directly. Team-bound questions are NOT resolved here; the caller
// (questionnaire-config.ts) injects the live teams via resolveTeamBindings.

// The code-defined questionnaires, served until a captain edits them in-app.
// Today just the burner profile; new keys join as their templates land.
const TEMPLATES: Record<string, Questionnaire> = {
  burner_profile: BURNER_PROFILE_TEMPLATE,
};

/**
 * The stored definition for a questionnaire key, or its code template when no
 * edited row exists yet. Returns null only for an unknown key with no template.
 */
export async function getQuestionnaireDefinition(
  key: string,
): Promise<Questionnaire | null> {
  const template = TEMPLATES[key] ?? null;
  if (isE2ETestMode()) return template;

  const row = await getQuestionnaireDefinitionRow(key);
  if (!row) return template;

  return parseStoredDefinition(row.definition, template);
}

/**
 * Load a BUILDER questionnaire definition (the in-app, data-only kind). With a
 * `version`, reads the immutable published snapshot from questionnaire_versions
 * (what an activation pins); without one, reads the editable head from
 * questionnaire_definitions (what the builder edits). Returns null for an
 * absent/malformed row or a legacy code definition — those load via
 * getQuestionnaireDefinition instead. No code template: builder questionnaires
 * exist only as data.
 */
export async function getBuilderDefinition(
  key: string,
  version?: string,
): Promise<BuilderQuestionnaire | null> {
  if (isE2ETestMode()) return null;
  const raw = version
    ? (await getQuestionnaireVersionRow(key, version))?.definition
    : (await getQuestionnaireDefinitionRow(key))?.definition;
  if (raw == null) return null;
  return parseStoredBuilderDefinition(raw);
}

// --- Builder authoring (Phase C) -----------------------------------------

const DRAFT_VERSION = "1";

/** A blank one-page builder questionnaire to start a draft from. */
function blankDefinition(title: string): BuilderQuestionnaire {
  return {
    version: DRAFT_VERSION,
    title,
    pages: [{ id: randomUUID(), type: "question", title: "", blocks: [] }],
  };
}

/**
 * Mint a unique, immutable definition key from a title — a slug plus a numeric
 * suffix until free. Reserved code keys count as taken.
 */
export async function generateDefinitionKey(title: string): Promise<string> {
  const base = slugify(title) || "questionnaire";
  if (!(await definitionKeyExists(base))) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await definitionKeyExists(candidate))) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

/** Create a blank draft owned by `createdBy`; returns its new key. */
export async function createDraft(input: {
  title: string;
  createdBy: string;
}): Promise<string> {
  const title = input.title.trim() || "Untitled questionnaire";
  const key = await generateDefinitionKey(title);
  await insertDefinitionDraft({
    key,
    title,
    createdBy: input.createdBy,
    definition: blankDefinition(title),
  });
  return key;
}

/** Autosave the working head (validated upstream). */
export async function updateDefinition(
  key: string,
  definition: BuilderQuestionnaire,
): Promise<void> {
  await updateDefinitionRow({
    key,
    title: definition.title.trim() || "Untitled questionnaire",
    definition,
  });
}

/** Duplicate a definition into a fresh draft; returns the new key, or null. */
export async function duplicateDefinition(input: {
  key: string;
  createdBy: string;
}): Promise<string | null> {
  const row = await getDefinitionRowForClone(input.key);
  if (!row) return null;
  const parsed = BuilderQuestionnaire.safeParse(row.definition);
  if (!parsed.success) return null;
  const title = `${parsed.data.title || "Untitled questionnaire"} (copy)`;
  const key = await generateDefinitionKey(title);
  await insertDefinitionDraft({
    key,
    title,
    createdBy: input.createdBy,
    definition: regenerateBuilderIds(
      { ...parsed.data, version: DRAFT_VERSION, title },
      randomUUID,
    ),
  });
  return key;
}

/** Hard-delete a draft (caller enforces draft-only + ownership). */
export async function deleteDraft(key: string): Promise<void> {
  await deleteDefinitionRow(key);
}

export interface DefinitionSummary {
  key: string;
  title: string;
  status: "draft" | "published" | "unpublished";
  questionCount: number;
  createdBy: string | null;
  updatedAt: Date;
}

/**
 * The hub list for a viewer. Captains see every builder questionnaire;
 * team-leads see published ones plus their own drafts. Newest first.
 */
export async function listDefinitionsForViewer(input: {
  userId: string;
  canSeeAll: boolean;
}): Promise<DefinitionSummary[]> {
  const rows = await listDefinitionRows();
  return rows
    .filter(
      (r) =>
        input.canSeeAll || r.status !== "draft" || r.createdBy === input.userId,
    )
    .map((r) => {
      const parsed = BuilderQuestionnaire.safeParse(r.definition);
      return {
        key: r.key,
        title: r.title,
        status: r.status,
        questionCount: parsed.success
          ? flattenBuilderQuestions(parsed.data).length
          : 0,
        createdBy: r.createdBy,
        updatedAt: r.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
