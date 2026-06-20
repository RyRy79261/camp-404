import "server-only";

import type { BuilderQuestionnaire, Questionnaire } from "@camp404/types";
import {
  getQuestionnaireDefinitionRow,
  getQuestionnaireVersionRow,
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
