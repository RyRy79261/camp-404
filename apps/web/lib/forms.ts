import "server-only";

import {
  mergeEmergencyContacts,
  splitEmergencyContacts,
  type Questionnaire,
  type QuestionnaireFieldChange,
  type QuestionnaireResponses,
} from "@camp404/types";
import {
  listQuestionnaireEdits as listEditsDb,
} from "@camp404/db/questionnaire-edits";
import { splitIdNumber, mergeIdNumber } from "@camp404/db/id-documents";
import {
  listCompletedQuestionnaireAnswers as listCompletedAnswersDb,
  type CompletedQuestionnaireAnswers,
} from "@camp404/db/questionnaire-responses";
import { QUESTIONNAIRE_VERSION } from "./questionnaire";
import {
  getQuestionnaireForPicker,
  getQuestionnaireForResponses,
} from "./questionnaire-config";
import {
  getBurnerProfile,
  getEmergencyContacts,
  getIdDocuments,
  saveBurnerProfileReplay,
} from "./users";
import { usesTestStore } from "./test-mode";
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
  /**
   * Persist edited answers back to the domain table (a full re-submit), with
   * the change-log row when something changed, all or nothing.
   */
  save(
    userId: string,
    responses: QuestionnaireResponses,
    edit: ReplayEdit | null,
  ): Promise<void>;
}

/** One replay's change-log entry. */
export interface ReplayEdit {
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
}

// The static half of a form (everything except its config-derived catalogue).
// getReplayableForm attaches `questionnaire` per-request from the live config.
type ReplayableFormDef = Omit<ReplayableForm, "questionnaire">;

const BURNER_PROFILE: ReplayableFormDef = {
  key: "burner_profile",
  title: "Burner profile",
  description:
    "The onboarding questionnaire — who you are in the dust, your teams, skills and logistics.",
  async load(userId) {
    const profile = await getBurnerProfile(userId);
    if (!profile) return null;
    // Merge the decrypted ID number back in so the owner's replay pre-fills.
    const id = (await getIdDocuments(userId)) ?? {
      idType: null,
      idNumber: null,
    };
    // And the emergency contacts, which live on `users` by question role.
    const [questionnaire, contacts] = await Promise.all([
      getQuestionnaireForResponses(),
      getEmergencyContacts(userId),
    ]);
    return {
      responses: mergeEmergencyContacts(
        questionnaire,
        mergeIdNumber((profile.responses as Record<string, unknown>) ?? {}, id),
        contacts,
      ) as QuestionnaireResponses,
      completedAt: profile.completedAt,
      updatedAt: profile.updatedAt,
    };
  },
  async save(userId, responses, edit) {
    const split = splitIdNumber(responses);
    const { idType, idNumber } = split;
    const { cleaned, contacts } = splitEmergencyContacts(
      await getQuestionnaireForResponses(),
      split.cleaned,
    );
    // One transaction: the answers, the ID number, the contacts (a replay is a
    // full re-submit, so clearing them all clears the column), the gate, and
    // the change-log row.
    await saveBurnerProfileReplay({
      userId,
      version: QUESTIONNAIRE_VERSION,
      responses: cleaned,
      id: idNumber ? { idType, idNumber } : null,
      emergencyContacts: contacts,
      edit: edit ? { questionnaireKey: "burner_profile", ...edit } : null,
    });
  },
};

const REGISTRY: ReplayableFormDef[] = [BURNER_PROFILE];

export async function getReplayableForm(
  key: string,
): Promise<ReplayableForm | undefined> {
  const def = REGISTRY.find((f) => f.key === key);
  if (!def) return undefined;
  // The replay picker shows ACTIVE teams (config labels). Validating a re-submit
  // against all teams — so an archived pick isn't silently dropped — is the
  // replay action's job (it builds the full catalogue itself).
  return { ...def, questionnaire: await getQuestionnaireForPicker() };
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

// --- Finished builder questionnaires ------------------------------------
// Read-only: a builder questionnaire's answers are fixed once submitted (its
// send closes and refuses writes), so My forms lets a member reread them, not
// edit them. Shown against the version they answered.

export type { CompletedQuestionnaireAnswers };

/** Every builder questionnaire this member has finished, newest first. */
export async function listAnsweredQuestionnaires(
  userId: string,
): Promise<CompletedQuestionnaireAnswers[]> {
  // The E2E store models no builder responses.
  if (usesTestStore()) return [];
  return listCompletedAnswersDb(userId);
}

/** One finished questionnaire in one year, or null. */
export async function getAnsweredQuestionnaire(
  userId: string,
  definitionKey: string,
  cycle: number,
): Promise<CompletedQuestionnaireAnswers | null> {
  if (usesTestStore()) return null;
  const [answers] = await listCompletedAnswersDb(userId, {
    definitionKey,
    cycle,
  });
  return answers ?? null;
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

export async function listFormEdits(
  userId: string,
  questionnaireKey: string,
  limit = 20,
): Promise<FormEdit[]> {
  if (usesTestStore()) {
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
