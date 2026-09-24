import { and, eq } from "drizzle-orm";
import {
  isParticipationDecision,
  participationAfterIntent,
} from "@camp404/core";
import type {
  ParticipationIntent,
  ParticipationStatus,
  QuestionnaireFieldChange,
} from "@camp404/types";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { recordQuestionnaireEdit } from "./questionnaire-edits";

// The write path for `camp_participations`: who is coming, one row per member
// per burn year. The rules (what a Yes / Maybe / No does, which moves a captain
// may make) live in @camp404/core/participation; this module only applies them
// to the stored row.
//
// Nothing here opens a second connection inside a transaction. A caller that
// already holds one (the questionnaire submit) passes its `tx` to
// applyParticipationIntent; the functions that open their own transaction
// resolve the year BEFORE they open it.

/** The change log key for the member's own "Coming this year?" form. */
export const ATTENDANCE_EDIT_KEY = "attendance";

export type ParticipationRow = typeof schema.campParticipations.$inferSelect;

export interface ParticipationIntentResult {
  /** The member's status after the answer. */
  status: ParticipationStatus;
  /** False when the answer left the row as it was. */
  changed: boolean;
  /** True when the answer took the member off an accepted or waitlisted place. */
  withdrew: boolean;
}

/**
 * Apply a member's Yes / Maybe / No for one year, on the caller's handle.
 *
 * The first answer of the year inserts the row. A later one locks the row,
 * asks participationAfterIntent what it does, and writes only a change, so Yes
 * or Maybe never lowers an accepted or waitlisted place. When a No takes the
 * member off such a place, the withdrawal is audited in the same transaction.
 */
export async function applyParticipationIntent(
  tx: DbOrTx,
  input: {
    userId: string;
    cycle: number;
    intent: ParticipationIntent;
    now?: Date;
  },
): Promise<ParticipationIntentResult> {
  const now = input.now ?? new Date();
  const first = participationAfterIntent(null, input.intent);
  // Every answer from no row writes one, so `first` is never null.
  const [inserted] = await tx
    .insert(schema.campParticipations)
    .values({
      userId: input.userId,
      cycle: input.cycle,
      status: first!.next,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [
        schema.campParticipations.userId,
        schema.campParticipations.cycle,
      ],
    })
    // Bare RETURNING: a column list does not type-check on the DbOrTx union.
    .returning();
  if (inserted) {
    return { status: inserted.status, changed: true, withdrew: false };
  }

  const where = and(
    eq(schema.campParticipations.userId, input.userId),
    eq(schema.campParticipations.cycle, input.cycle),
  );
  const [current] = await tx
    .select({ status: schema.campParticipations.status })
    .from(schema.campParticipations)
    .where(where)
    .for("update");
  if (!current) {
    // The row the insert collided with is gone again (the member's account was
    // erased in between). Nothing to answer for.
    throw new Error("applyParticipationIntent: participation row vanished");
  }

  const change = participationAfterIntent(current.status, input.intent);
  if (!change) {
    return { status: current.status, changed: false, withdrew: false };
  }
  await tx
    .update(schema.campParticipations)
    .set({ status: change.next, updatedAt: now })
    .where(where);
  if (change.withdrew) {
    await writeAuditEvent(tx, {
      actorId: input.userId,
      action: "participation.withdrawn",
      target: input.userId,
      metadata: { cycle: input.cycle, from: current.status },
    });
  }
  return { status: change.next, changed: true, withdrew: change.withdrew };
}

/** One change-log entry for the member's own attendance form. */
export interface AttendanceEdit {
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
}

/**
 * Save a member's answer from their own "Coming this year?" form: the
 * participation row and, when there is one, its change-log entry, in one
 * transaction. The caller resolves `cycle` first (see the module note).
 */
export async function saveParticipationIntent(input: {
  userId: string;
  cycle: number;
  intent: ParticipationIntent;
  edit: AttendanceEdit | null;
}): Promise<ParticipationIntentResult> {
  return withTransaction(async (tx) => {
    const result = await applyParticipationIntent(tx, {
      userId: input.userId,
      cycle: input.cycle,
      intent: input.intent,
    });
    if (input.edit && input.edit.changes.length > 0) {
      await recordQuestionnaireEdit(
        {
          userId: input.userId,
          questionnaireKey: ATTENDANCE_EDIT_KEY,
          version: input.edit.version,
          editedByUserId: input.edit.editedByUserId,
          changes: input.edit.changes,
        },
        tx,
      );
    }
    return result;
  });
}

/**
 * A captain accepts a member or puts them on the waiting list for the camp's
 * current year.
 *
 * Compare-and-set on `from`, the status the captain saw: true when this call
 * made the decision, false when the row had already moved (another captain, or
 * the member answering No). A move that is not a decision
 * (isParticipationDecision) throws. The winning call writes a
 * `participation.decided` audit row in the same transaction.
 */
export async function decideParticipation(input: {
  userId: string;
  from: ParticipationStatus;
  to: ParticipationStatus;
  decidedByUserId: string;
}): Promise<boolean> {
  if (!isParticipationDecision(input.from, input.to)) {
    throw new Error(
      `decideParticipation: ${input.from} -> ${input.to} is not a decision`,
    );
  }
  // Resolved BEFORE the transaction: currentCycleNumber() reads camp_settings
  // on its own handle (see team-memberships.ts).
  const cycle = await currentCycleNumber();
  return withTransaction(async (tx) => {
    const now = new Date();
    const rows = await tx
      .update(schema.campParticipations)
      .set({
        status: input.to,
        decidedByUserId: input.decidedByUserId,
        decidedAt: now,
        reason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.campParticipations.userId, input.userId),
          eq(schema.campParticipations.cycle, cycle),
          eq(schema.campParticipations.status, input.from),
        ),
      )
      .returning({ userId: schema.campParticipations.userId });
    if (rows.length === 0) return false;

    await writeAuditEvent(tx, {
      actorId: input.decidedByUserId,
      action: "participation.decided",
      target: input.userId,
      metadata: { cycle, from: input.from, to: input.to },
    });
    return true;
  });
}

/** A member's own row for one year, or null when they have not answered. */
export async function getParticipation(
  userId: string,
  cycle: number,
): Promise<ParticipationRow | null> {
  const [row] = await createHttpDb()
    .select()
    .from(schema.campParticipations)
    .where(
      and(
        eq(schema.campParticipations.userId, userId),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .limit(1);
  return row ?? null;
}
