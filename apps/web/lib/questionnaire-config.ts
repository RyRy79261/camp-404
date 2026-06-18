import "server-only";

import type { Questionnaire } from "@camp404/types";
import { activeTeams, getTeamsConfig, type TeamsConfig } from "./camp-config";
import {
  BURNER_PROFILE_TEMPLATE,
  resolveTeamBindings,
  type TeamOption,
} from "./questionnaire";
import { getQuestionnaireDefinition } from "./questionnaire-definitions";

// Resolve the burner-profile questionnaire against the live camp config (Phase 3),
// so a captain's relabel / reorder / archive flows into onboarding. The stored
// catalogue now comes from the DB-backed definition (getQuestionnaireDefinition,
// falling back to the code template); the team-interest sliders + the team-lead
// multi-select are injected from config by resolveTeamBindings; everything else
// is served verbatim. Two variants, by intent:
//   - PICKER  (active teams only)  — what a fresh sign-up / a replay renders.
//   - RESPONSES (all teams, incl. archived) — used to VALIDATE and DISPLAY a
//     stored response, so an archived pick still validates (the multi_select
//     validator silently drops values not in its options, which would lose data
//     on re-save) and still resolves to its label instead of the raw key.
// Team keys are immutable (assertStableTeamKeys), so "all config teams" is always
// a superset of any key a stored response can contain — no per-response union
// needed. This module is server-only (the definition read + getTeamsConfig pull
// the DB driver); the pure resolver it calls stays DB-free for unit tests.

function activeTeamOptions(config: TeamsConfig): TeamOption[] {
  return activeTeams(config).map((t) => ({ value: t.key, label: t.label }));
}

function allTeamOptions(config: TeamsConfig): TeamOption[] {
  return [...config.teams]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ value: t.key, label: t.label }));
}

async function burnerDefinition(): Promise<Questionnaire> {
  return (
    (await getQuestionnaireDefinition("burner_profile")) ??
    BURNER_PROFILE_TEMPLATE
  );
}

/** The questionnaire for a fresh picker — active teams only, config labels. */
export async function getQuestionnaireForPicker(): Promise<Questionnaire> {
  const [definition, config] = await Promise.all([
    burnerDefinition(),
    getTeamsConfig(),
  ]);
  return resolveTeamBindings(definition, activeTeamOptions(config));
}

/**
 * The questionnaire for validating / displaying a stored response — every team
 * (incl. archived), so an archived pick still validates and resolves to a label.
 */
export async function getQuestionnaireForResponses(): Promise<Questionnaire> {
  const [definition, config] = await Promise.all([
    burnerDefinition(),
    getTeamsConfig(),
  ]);
  return resolveTeamBindings(definition, allTeamOptions(config));
}
