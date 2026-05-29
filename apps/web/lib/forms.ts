import "server-only";

import type {
  Questionnaire,
  QuestionnaireFieldChange,
  QuestionnaireResponses,
} from "@camp404/types";
import {
  listQuestionnaireEdits as listEditsDb,
  recordQuestionnaireEdit as recordEditDb,
} from "@camp404/db/questionnaire-edits";
import { QUESTIONNAIRE } from "./questionnaire";
import { getBurnerProfile, upsertBurnerProfile } from "./users";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// Registry of questionnaires a user can "replay" — revisit and update after
// they have already completed them. Keyed by the same stable questionnaire
// key used by required_actions / questionnaire_activations.
//
// Each entry is bespoke (per the repo's "bespoke over generic" stance): it
// owns how its answers are loaded from and written back to its domain table.
// Today only the burner profile is wired up; dietary / driver / future
// questionnaires slot in here once their domain pages exist, with no change
// to the tool, the change-log table, or the replay screen.

export interface ReplayableForm {
  key: string;
  title: string;
  description: string;
  questionnaire: Questionnaire;
  /** Read this user's saved answers + completion state from the domain table. */
  load(userId: string): Promise<{
    responses: QuestionnaireResponses;
    completedAt: Date | null;
    updatedAt: Date | null;
  } | null>;
  /** Persist edited answers back to the domain table (a full re-submit). */
  save(userId: string, responses: QuestionnaireResponses): Promise<void>;
}

const BURNER_PROFILE: ReplayableForm = {
  key: "burner_profile",
  title: "Burner profile",
  description:
    "The onboarding questionnaire — who you are in the dust, your teams, skills and logistics.",
  questionnaire: QUESTIONNAIRE,
  async load(userId) {
    const profile = await getBurnerProfile(userId);
    if (!profile) return null;
    return {
      responses: (profile.responses as QuestionnaireResponses) ?? {},
      completedAt: profile.completedAt,
      updatedAt: profile.updatedAt,
    };
  },
  async save(userId, responses) {
    await upsertBurnerProfile({
      userId,
      version: QUESTIONNAIRE.version,
      responses,
      // A replay only happens on an already-completed form, so it stays
      // complete. markComplete is idempotent on completedAt.
      markComplete: true,
    });
  },
};

const REGISTRY: ReplayableForm[] = [BURNER_PROFILE];

export function getReplayableForm(key: string): ReplayableForm | undefined {
  return REGISTRY.find((f) => f.key === key);
}

export interface CompletedFormSummary {
  key: string;
  title: string;
  description: string;
  completedAt: Date;
  updatedAt: Date | null;
}

/**
 * The forms this user has completed and can therefore replay. A form only
 * shows up once it has a completion on record.
 */
export async function listCompletedForms(
  userId: string,
): Promise<CompletedFormSummary[]> {
  const out: CompletedFormSummary[] = [];
  for (const form of REGISTRY) {
    const state = await form.load(userId);
    if (!state?.completedAt) continue;
    out.push({
      key: form.key,
      title: form.title,
      description: form.description,
      completedAt: state.completedAt,
      updatedAt: state.updatedAt,
    });
  }
  return out;
}

// --- Edit change log ----------------------------------------------------
// Routed through the in-memory test store under E2E_TEST_MODE, mirroring
// the user / burner-profile helpers.

export interface FormEdit {
  id: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
  createdAt: Date;
}

export async function recordFormEdit(input: {
  userId: string;
  questionnaireKey: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
}): Promise<void> {
  if (isE2ETestMode()) {
    testStore.recordQuestionnaireEdit(input);
    return;
  }
  await recordEditDb(input);
}

export async function listFormEdits(
  userId: string,
  questionnaireKey: string,
  limit = 20,
): Promise<FormEdit[]> {
  if (isE2ETestMode()) {
    return testStore
      .listQuestionnaireEdits(userId, questionnaireKey, limit)
      .map((e) => ({
        id: e.id,
        version: e.version,
        editedByUserId: e.editedByUserId,
        changes: e.changes,
        createdAt: e.createdAt,
      }));
  }
  const rows = await listEditsDb(userId, questionnaireKey, limit);
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    editedByUserId: r.editedByUserId,
    changes: r.changes,
    createdAt: r.createdAt,
  }));
}
