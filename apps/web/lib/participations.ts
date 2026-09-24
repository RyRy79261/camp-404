import "server-only";

import {
  flattenQuestions,
  type ParticipationIntent,
  type ParticipationStatus,
} from "@camp404/types";
import { currentCycleNumber as dbCurrentCycleNumber } from "@camp404/db/cycles";
import {
  ATTENDANCE_EDIT_KEY,
  decideParticipation as dbDecideParticipation,
  getParticipation as dbGetParticipation,
  saveParticipationIntent as dbSaveParticipationIntent,
  type AttendanceEdit,
  type AttendanceResponseRef,
  type ParticipationIntentResult,
  type ParticipationRow,
} from "@camp404/db/participations";
import { ATTENDANCE_CHECK_KEY } from "./attendance-check";
import { getBuilderDefinition } from "./questionnaire-definitions";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Who is coming this year: the facade over `@camp404/db/participations`,
// routed through the in-memory test store under E2E_TEST_MODE so Playwright
// can drive the member form and the captain roster. Every caller gates the
// viewer itself; this module gates nothing.

export type { AttendanceEdit, ParticipationIntentResult };

export interface DecideParticipationInput {
  userId: string;
  /** The status the deciding captain saw. */
  from: ParticipationStatus;
  to: ParticipationStatus;
  decidedByUserId: string;
}

interface ParticipationsBackend {
  currentCycleNumber(): Promise<number>;
  getParticipation(
    userId: string,
    cycle: number,
  ): Promise<ParticipationRow | null>;
  saveParticipationIntent(input: {
    userId: string;
    cycle: number;
    intent: ParticipationIntent;
    edit: AttendanceEdit | null;
    response?: AttendanceResponseRef | null;
  }): Promise<ParticipationIntentResult>;
  decideParticipation(input: DecideParticipationInput): Promise<boolean>;
}

// Each entry calls through at CALL time, so a unit test's vi.mock of the db
// module still intercepts it.
const realBackend: ParticipationsBackend = {
  currentCycleNumber: () => dbCurrentCycleNumber(),
  getParticipation: (userId, cycle) => dbGetParticipation(userId, cycle),
  saveParticipationIntent: (input) => dbSaveParticipationIntent(input),
  decideParticipation: (input) => dbDecideParticipation(input),
};

const testBackend: ParticipationsBackend = {
  async currentCycleNumber() {
    return testStore.currentCycleNumber();
  },
  async getParticipation(userId, cycle) {
    return testStore.getParticipation(userId, cycle);
  },
  // The store has no transactions; the answer and its change-log entry are
  // written one after the other, the same pair production commits together.
  // It models no builder responses, so there is no stored answer to rewrite.
  async saveParticipationIntent({ userId, cycle, intent, edit }) {
    const result = testStore.applyParticipationIntent({
      userId,
      cycle,
      intent,
    });
    if (result.answerChanged && edit && edit.changes.length > 0) {
      testStore.recordQuestionnaireEdit({
        userId,
        questionnaireKey: ATTENDANCE_EDIT_KEY,
        version: edit.version,
        editedByUserId: edit.editedByUserId,
        changes: edit.changes,
      });
    }
    return result;
  },
  // The store keeps no audit log, so the captain's id stops at the row.
  async decideParticipation(input) {
    return testStore.decideParticipation(input);
  },
};

function backend(): ParticipationsBackend {
  return usesTestStore() ? testBackend : realBackend;
}

/** What a member may read of their own row. */
export interface MyParticipation {
  cycle: number;
  status: ParticipationStatus;
  /** What they last answered, which a captain's decision does not change. */
  intent: ParticipationIntent;
  /** When they first answered this year. */
  createdAt: Date;
  updatedAt: Date;
}

/** The member's own answer for the camp's current year, or null. */
export async function getMyParticipation(
  userId: string,
): Promise<MyParticipation | null> {
  const b = backend();
  const cycle = await b.currentCycleNumber();
  const row = await b.getParticipation(userId, cycle);
  // Only the member's own fields: never who decided or why.
  return row
    ? {
        cycle: row.cycle,
        status: row.status,
        intent: row.intent,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    : null;
}

/**
 * Save the member's answer from their own "Coming this year?" form, for the
 * camp's current year, with its change-log entry when there is one.
 */
export async function saveAttendanceAnswer(input: {
  userId: string;
  intent: ParticipationIntent;
  edit: AttendanceEdit | null;
}): Promise<ParticipationIntentResult> {
  const b = backend();
  // Both resolved before the write opens its transaction (the one-connection
  // rule).
  const cycle = await b.currentCycleNumber();
  const response = await attendanceResponseRef();
  return b.saveParticipationIntent({ ...input, cycle, response });
}

/**
 * Where the camp's "Coming this year?" questionnaire keeps this answer: its
 * key and the id of its participation_intent question, or null when there is
 * no such questionnaire (or the test store, which has none).
 */
async function attendanceResponseRef(): Promise<AttendanceResponseRef | null> {
  const definition = await getBuilderDefinition(ATTENDANCE_CHECK_KEY);
  if (!definition) return null;
  const question = flattenQuestions(definition).find(
    (q) => "role" in q && q.role === "participation_intent",
  );
  return question
    ? { definitionKey: ATTENDANCE_CHECK_KEY, fieldId: question.id }
    : null;
}

/**
 * A captain accepts a member or puts them on the waiting list for this year.
 * False when the member's status had already moved from `from`.
 */
export function decideParticipation(
  input: DecideParticipationInput,
): Promise<boolean> {
  return backend().decideParticipation(input);
}
