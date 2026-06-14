import "server-only";

import type { Questionnaire } from "@camp404/types";
import { activeTeams, getTeamsConfig, type TeamsConfig } from "./camp-config";
import { buildQuestionnaire, type TeamOption } from "./questionnaire";

// Resolve the burner-profile questionnaire against the live camp config (Phase 3),
// so a captain's relabel / reorder / archive flows into onboarding. The team-
// interest sliders + the team-lead multi-select are built from config; everything
// else is static. Two variants, by intent:
//   - PICKER  (active teams only)  — what a fresh sign-up / a replay renders.
//   - RESPONSES (all teams, incl. archived) — used to VALIDATE and DISPLAY a
//     stored response, so an archived pick still validates (the multi_select
//     validator silently drops values not in its options, which would lose data
//     on re-save) and still resolves to its label instead of the raw key.
// Team keys are immutable (assertStableTeamKeys), so "all config teams" is always
// a superset of any key a stored response can contain — no per-response union
// needed. This module is server-only (getTeamsConfig pulls the DB driver); the
// pure builder it calls stays DB-free for the client wizard + unit tests.

function activeTeamOptions(config: TeamsConfig): TeamOption[] {
  return activeTeams(config).map((t) => ({ value: t.key, label: t.label }));
}

function allTeamOptions(config: TeamsConfig): TeamOption[] {
  return [...config.teams]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ value: t.key, label: t.label }));
}

/** The questionnaire for a fresh picker — active teams only, config labels. */
export async function getQuestionnaireForPicker(): Promise<Questionnaire> {
  return buildQuestionnaire(activeTeamOptions(await getTeamsConfig()));
}

/**
 * The questionnaire for validating / displaying a stored response — every team
 * (incl. archived), so an archived pick still validates and resolves to a label.
 */
export async function getQuestionnaireForResponses(): Promise<Questionnaire> {
  return buildQuestionnaire(allTeamOptions(await getTeamsConfig()));
}
