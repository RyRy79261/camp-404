import "server-only";

import type { Questionnaire } from "@camp404/types";
import { getQuestionnaireDefinitionRow } from "@camp404/db/questionnaire-definitions";
import { BURNER_PROFILE_TEMPLATE, parseStoredDefinition } from "./questionnaire";
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
