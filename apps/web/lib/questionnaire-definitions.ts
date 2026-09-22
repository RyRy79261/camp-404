import "server-only";

import { randomUUID } from "node:crypto";
import {
  flattenQuestions,
  safeParseStoredDefinition,
  type Questionnaire,
  type ViewerRank,
} from "@camp404/types";
import {
  canViewBuilderDefinition,
  regenerateQuestionnaireIds,
  slugify,
} from "@camp404/core";
import {
  RESERVED_DEFINITION_KEYS,
  definitionKeyExists,
  deleteDefinitionRow,
  getDefinitionRowForClone,
  getQuestionnaireDefinitionRow,
  getQuestionnaireVersionRow,
  insertDefinitionDraft,
  listDefinitionRows,
  updateDefinitionRow,
} from "@camp404/db/questionnaire-definitions";
import { listOpenSendBlocking as dbListOpenSendBlocking } from "@camp404/db/questionnaire-lifecycle";
import {
  listOpenSendGates as dbListOpenSendGates,
  type OpenSendGateRow,
} from "@camp404/db/questionnaire-results";
import { BURNER_PROFILE_TEMPLATE, readStoredDefinition } from "./questionnaire";
import { usesTestStore } from "./test-mode";

// Questionnaire-definition data facade. Reads the stored catalogue from the
// Neon-backed `questionnaire_definitions` / `questionnaire_versions` tables.
// EVERY read goes through parseStoredDefinition (@camp404/types): a row may
// hold the builder's older shape or the unified model, snapshots are never
// rewritten, and callers only ever see the unified `Questionnaire`. Every
// write stores the unified model. Code questionnaires fall back to their
// template when the row is absent or malformed — the same resolve-with-fallback
// shape camp-config uses. Under E2E_TEST_MODE (no database during Playwright)
// it serves the template directly. Team-bound questions are NOT resolved here;
// the caller (questionnaire-config.ts) injects the live teams via
// resolveTeamBindings.

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
  if (usesTestStore()) return template;

  const row = await getQuestionnaireDefinitionRow(key);
  if (!row) return template;

  return readStoredDefinition(row.definition, template);
}

/**
 * Load a BUILDER questionnaire definition (the in-app, data-only kind) as the
 * unified model, whichever shape it is stored in. With a `version`, reads the
 * immutable published snapshot from questionnaire_versions (what an activation
 * pins); without one, reads the editable head from questionnaire_definitions
 * (what the builder edits). Returns null for an absent/malformed row, and for a
 * reserved code-questionnaire key — those load via getQuestionnaireDefinition
 * instead. No code template: builder questionnaires exist only as data.
 */
export async function getBuilderDefinition(
  key: string,
  version?: string,
): Promise<Questionnaire | null> {
  if (usesTestStore()) return null;
  if (RESERVED_DEFINITION_KEYS.has(key)) return null;
  const raw = version
    ? (await getQuestionnaireVersionRow(key, version))?.definition
    : (await getQuestionnaireDefinitionRow(key))?.definition;
  if (raw == null) return null;
  return safeParseStoredDefinition(raw);
}

// --- Builder authoring (Phase C) -----------------------------------------

const DRAFT_VERSION = "1";

/**
 * A blank one-page questionnaire to start a draft from. Its page takes the
 * questionnaire's name, as AfrikaBurn's builder titles its first section: a
 * page needs a title to publish, and a one-page questionnaire has no better
 * one.
 */
function blankDefinition(title: string): Questionnaire {
  return {
    version: DRAFT_VERSION,
    title,
    pages: [
      {
        id: randomUUID(),
        kind: "questions",
        title,
        pageType: "question",
        questions: [],
      },
    ],
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

/** Autosave the working head (validated upstream), in the unified model. */
export async function updateDefinition(
  key: string,
  definition: Questionnaire,
): Promise<void> {
  await updateDefinitionRow({
    key,
    title: definition.title?.trim() || "Untitled questionnaire",
    definition,
  });
}

/** Duplicate a definition into a fresh draft; returns the new key, or null. */
export async function duplicateDefinition(input: {
  key: string;
  createdBy: string;
}): Promise<string | null> {
  if (RESERVED_DEFINITION_KEYS.has(input.key)) return null;
  const row = await getDefinitionRowForClone(input.key);
  if (!row) return null;
  const parsed = safeParseStoredDefinition(row.definition);
  if (!parsed) return null;
  const title = `${parsed.title || "Untitled questionnaire"} (copy)`;
  const key = await generateDefinitionKey(title);
  await insertDefinitionDraft({
    key,
    title,
    createdBy: input.createdBy,
    definition: regenerateQuestionnaireIds(
      { ...parsed, version: DRAFT_VERSION, title },
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
 * The hub list for a viewer, newest first. Who sees what is
 * `canViewBuilderDefinition`: a captain sees every builder questionnaire; a
 * team lead sees published and unpublished ones plus their own drafts.
 */
export async function listDefinitionsForViewer(viewer: {
  userId: string;
  rank: ViewerRank;
}): Promise<DefinitionSummary[]> {
  // The test store models no builder questionnaires: in E2E the hub opens
  // empty, honestly, rather than failing on a database that is not there.
  if (usesTestStore()) return [];
  const rows = await listDefinitionRows();
  return rows
    .filter((r) => canViewBuilderDefinition(viewer, r))
    .map((r) => {
      const parsed = safeParseStoredDefinition(r.definition);
      return {
        key: r.key,
        title: r.title,
        status: r.status,
        questionCount: parsed ? flattenQuestions(parsed).length : 0,
        createdBy: r.createdBy,
        updatedAt: r.updatedAt,
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * Whether each questionnaire's open send is blocking, for the hub. Empty in
 * E2E, where no sends are modelled.
 */
export async function listOpenSendBlocking(): Promise<Map<string, boolean>> {
  if (usesTestStore()) return new Map();
  return dbListOpenSendBlocking();
}

/**
 * Every open send's gates, one row per gate — what the Overview turns into
 * "answered out of reached" through @camp404/core's `tallyActivationCompletion`.
 *
 * Empty in E2E, where no sends are modelled. An empty list reads as "no
 * questionnaire is open", which would be a claim the test store cannot make, so
 * the panel that renders this withholds itself under the test store instead of
 * printing zeroes (see the Overview's captain panels).
 */
export async function listOpenSendGates(): Promise<OpenSendGateRow[]> {
  if (usesTestStore()) return [];
  return dbListOpenSendGates();
}
