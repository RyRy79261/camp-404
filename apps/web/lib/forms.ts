import "server-only";

import {
  PARTICIPATION_INTENTS,
  attendanceQuestionnaire,
  mergeEmergencyContacts,
  splitEmergencyContacts,
  telegramHandleFromResponses,
  validateResponses,
  type ParticipationIntent,
  type ParticipationStatus,
  type Questionnaire,
  type QuestionnaireFieldChange,
  type QuestionnaireResponses,
} from "@camp404/types";
import { listQuestionnaireEdits as listEditsDb } from "@camp404/db/questionnaire-edits";
import { splitIdNumber, mergeIdNumber } from "@camp404/db/id-documents";
import {
  listCompletedQuestionnaireAnswers as listCompletedAnswersDb,
  type CompletedQuestionnaireAnswers,
} from "@camp404/db/questionnaire-responses";
import {
  validateBurnerProfileReplay,
  type ReplayValidation,
} from "./burner-profile-replay";
import { ATTENDANCE_CHECK_KEY } from "./attendance-check";
import { getMyParticipation, saveAttendanceAnswer } from "./participations";
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
// Today the burner profile and the member's "Coming this year?" answer are
// wired up; dietary / driver / future questionnaires slot in here once their
// domain pages exist, with no change to the tool, the change-log table, or the
// replay screen.

export interface ReplayableForm {
  key: string;
  title: string;
  description: string;
  questionnaire: Questionnaire;
  /** Read this user's saved answers + completion state from the domain table. */
  load(userId: string): Promise<ReplayState | null>;
  /**
   * The server's checks on a final submit, and the questionnaire the stored
   * and new answers are diffed against. A server action takes any POST, so
   * everything the wizard checks is checked again here.
   */
  validate(raw: unknown, now: Date): Promise<ReplayValidation>;
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

export type { ReplayValidation };

/** A member's saved answers to one replayable form. */
export interface ReplayState {
  responses: QuestionnaireResponses;
  completedAt: Date | null;
  updatedAt: Date | null;
  /** One line the replay page shows under its heading, when there is one. */
  notice?: string;
}

/** One replay's change-log entry. */
export interface ReplayEdit {
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
}

// The static half of a form. getReplayableForm attaches `questionnaire`
// per-request, from the live config where the form has one.
type ReplayableFormDef = Omit<ReplayableForm, "questionnaire"> & {
  loadQuestionnaire(): Promise<Questionnaire>;
};

const BURNER_PROFILE: ReplayableFormDef = {
  key: "burner_profile",
  title: "Burner profile",
  description:
    "The onboarding questionnaire — who you are in the dust, your teams, skills and logistics.",
  // The replay picker shows ACTIVE teams (config labels). Validating a
  // re-submit against all teams, so an archived pick isn't silently dropped,
  // is validate's job (it builds the full catalogue itself).
  loadQuestionnaire: () => getQuestionnaireForPicker(),
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
  validate: validateBurnerProfileReplay,
  async save(userId, responses, edit) {
    const split = splitIdNumber(responses);
    const { idType, idNumber } = split;
    const questionnaire = await getQuestionnaireForResponses();
    const { cleaned, contacts } = splitEmergencyContacts(
      questionnaire,
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
      // The answer stays in the profile too; this copies it to the roster.
      telegramHandle: telegramHandleFromResponses(questionnaire, cleaned, {
        complete: true,
      }),
      edit: edit ? { questionnaireKey: "burner_profile", ...edit } : null,
    });
  },
};

// What a No would cost a member who holds a place, said before they choose.
const PLACE_NOTICE: Partial<Record<ParticipationStatus, string>> = {
  accepted:
    "You have a place this year. Choosing No gives it up; Maybe keeps it.",
  waitlisted:
    "You're on the waiting list. Choosing No takes you off it; Maybe keeps you on it.",
};

function isIntent(value: unknown): value is ParticipationIntent {
  return (PARTICIPATION_INTENTS as readonly unknown[]).includes(value);
}

// The member's Yes / Maybe / No for the camp's current year. The builder
// questionnaire that first asks it is read-only once submitted; this form is
// how a Maybe changes their mind later, and it rewrites the answer stored with
// that questionnaire too, so My forms lists it once (listAnsweredQuestionnaires
// leaves it out) and its results agree with the roster. It writes by the same
// rule as that submit: Yes and Maybe never lower an accepted or waitlisted
// place, and No always wins (audited when it gives a place up). The form reads
// back what the member answered, not the captain's decision.
const ATTENDANCE: ReplayableFormDef = {
  key: "attendance",
  title: "Coming this year?",
  description:
    "Whether you're coming to AfrikaBurn with Camp 404 this year. Change it any time.",
  loadQuestionnaire: async () => attendanceQuestionnaire(),
  async load(userId) {
    // No row this year means no answer yet, so no card: the member answers
    // the questionnaire first.
    const row = await getMyParticipation(userId);
    if (!row) return null;
    const notice = PLACE_NOTICE[row.status];
    return {
      responses: { coming: row.intent },
      completedAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(notice ? { notice } : {}),
    };
  },
  async validate(raw) {
    const questionnaire = attendanceQuestionnaire();
    const result = validateResponses(questionnaire, raw);
    if (!result.ok) return result;
    return {
      ok: true,
      responses: result.responses,
      diffAgainst: questionnaire,
    };
  },
  async save(userId, responses, edit) {
    const intent = responses.coming;
    // validate() admits only the three fixed option values.
    if (!isIntent(intent)) {
      throw new Error(`attendance: not an answer: ${String(intent)}`);
    }
    await saveAttendanceAnswer({
      userId,
      intent,
      edit: edit
        ? { version: attendanceQuestionnaire().version, ...edit }
        : null,
    });
  },
};

const REGISTRY: ReplayableFormDef[] = [BURNER_PROFILE, ATTENDANCE];

export async function getReplayableForm(
  key: string,
): Promise<ReplayableForm | undefined> {
  const def = REGISTRY.find((f) => f.key === key);
  if (!def) return undefined;
  const { loadQuestionnaire, ...form } = def;
  return { ...form, questionnaire: await loadQuestionnaire() };
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

/**
 * Every builder questionnaire this member has finished, newest first, except
 * "Coming this year?": its answer is the editable attendance form above, and a
 * second, read-only copy of it would only repeat it.
 */
export async function listAnsweredQuestionnaires(
  userId: string,
): Promise<CompletedQuestionnaireAnswers[]> {
  // The E2E store models no builder responses.
  if (usesTestStore()) return [];
  const answered = await listCompletedAnswersDb(userId);
  return answered.filter((a) => a.definitionKey !== ATTENDANCE_CHECK_KEY);
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
