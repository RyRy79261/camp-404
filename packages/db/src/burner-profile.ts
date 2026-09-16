import { and, eq, sql } from "drizzle-orm";
import { approvalNotification } from "@camp404/core";
import type {
  EmergencyContact,
  QuestionnaireFieldChange,
} from "@camp404/types";
import { satisfyRequiredAction } from "./activations";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { recordQuestionnaireEdit } from "./questionnaire-edits";
import { deliveryValues } from "./deliveries";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

export async function findUserByAuthId(authUserId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.authUserId, authUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCampUser(input: {
  authUserId: string;
  displayName: string | null;
  inviteCode: string | null;
  rank?: "captain" | "member";
  approvalStatus?: "pending" | "approved" | "rejected";
}) {
  const db = createHttpDb();
  const [created] = await db
    .insert(schema.users)
    .values({
      authUserId: input.authUserId,
      displayName: input.displayName,
      inviteCode: input.inviteCode,
      ...(input.rank ? { rank: input.rank } : {}),
      ...(input.approvalStatus
        ? { approvalStatus: input.approvalStatus }
        : {}),
    })
    .returning();
  if (!created) throw new Error("Failed to insert camp user row");
  return created;
}

/**
 * Set a member's approval status without a deciding captain — used to drop a
 * redeemer into the `pending` queue at signup. Captain decisions go through
 * {@link setUserApproval}, which also records who decided.
 */
export async function setUserApprovalStatus(
  userId: string,
  status: "pending" | "approved" | "rejected",
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    // A reason belongs to the decision it was written for, so it goes when
    // the status moves.
    .set({
      approvalStatus: status,
      approvalDecisionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

/**
 * Record a captain's vetting decision on a pending member. Stamps who
 * decided and when for the camp-management audit trail.
 *
 * Compare-and-set: ONLY a row still `pending` flips. Two captains working the
 * same queue from separately-rendered rosters can both still see the Approve /
 * Reject buttons, so without the precondition the second write silently
 * overwrites the first decision AND its audit stamp. Returns true when this
 * call was the decision, false when the row was already decided (or no such
 * user) — the same fail-closed shape as `decideCaptainPromotion`'s
 * `eq(status, "sent")` guard in `captain-promotion.ts`.
 *
 * An approval also tells the member, in the same transaction: a pop-up and a
 * push saying they are in. Only the call that won the compare-and-set writes
 * it, so a second captain's click cannot send it twice. A rejection sends
 * nothing (see approvalNotification). The winning call also writes a
 * `member.approval_decided` audit row in the same transaction.
 */
export async function setUserApproval(input: {
  userId: string;
  status: "approved" | "rejected";
  decidedByUserId: string;
  /** What the captain tells the member; null or blank means none. */
  reason?: string | null;
}): Promise<boolean> {
  const reason = input.reason?.trim() || null;
  return await withTransaction(async (tx) => {
    const rows = await tx
      .update(schema.users)
      .set({
        approvalStatus: input.status,
        approvalDecidedByUserId: input.decidedByUserId,
        approvalDecidedAt: new Date(),
        approvalDecisionReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.users.id, input.userId),
          eq(schema.users.approvalStatus, "pending"),
        ),
      )
      .returning({ id: schema.users.id });
    if (rows.length === 0) return false;
    await writeAuditEvent(tx, {
      actorId: input.decidedByUserId,
      action: "member.approval_decided",
      target: input.userId,
      // Whether a reason was given, not the words: the audit row records the
      // decision, and the reason lives on the member's row.
      metadata: { status: input.status, withReason: reason !== null },
    });
    if (input.status === "approved") {
      await tx.insert(schema.notificationDeliveries).values(
        deliveryValues(approvalNotification(), {
          userId: input.userId,
          broadcastId: null,
          channel: "both",
          presentation: "popup",
        }),
      );
    }
    return true;
  });
}

export async function setUserInviteCode(userId: string, code: string) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ inviteCode: code, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserRank(userId: string, rank: "captain" | "member") {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ rank, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserProfileImage(
  userId: string,
  profileImageUrl: string | null,
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ profileImageUrl, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function setUserDisplayName(
  userId: string,
  displayName: string | null,
) {
  const db = createHttpDb();
  await db
    .update(schema.users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export async function getBurnerProfileByUserId(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.burnerProfiles)
    .where(eq(schema.burnerProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertBurnerProfile(
  input: {
    userId: string;
    version: string;
    responses: Record<string, unknown>;
    markComplete: boolean;
  },
  db: DbOrTx = createHttpDb(),
) {
  const now = new Date();
  await db
    .insert(schema.burnerProfiles)
    .values({
      userId: input.userId,
      version: input.version,
      responses: input.responses,
      completedAt: input.markComplete ? now : null,
    })
    .onConflictDoUpdate({
      target: schema.burnerProfiles.userId,
      set: {
        version: input.version,
        responses: input.responses,
        updatedAt: now,
        // Preserve the ORIGINAL completion timestamp on replay (OD10): stamp
        // `now` only when it was never completed; otherwise keep the existing
        // value so completedAt doesn't drift to the most-recent edit.
        completedAt: input.markComplete
          ? sql`coalesce(${schema.burnerProfiles.completedAt}, ${now})`
          : sql`${schema.burnerProfiles.completedAt}`,
      },
    });
}

/** Raw text read of the two ID-number ciphertext columns (no decrypt). */
export async function getIdDocumentColumns(userId: string) {
  const db = createHttpDb();
  const rows = await db
    .select({
      passportEncrypted: schema.users.passportEncrypted,
      saIdEncrypted: schema.users.saIdEncrypted,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The member's emergency contacts, or null when none are on file (or there is
 * no such member). Safety data: a caller reading someone else's goes through
 * resolveSafetyDataForViewer, which authorises and audits.
 */
export async function getEmergencyContactsColumn(
  userId: string,
): Promise<EmergencyContact[] | null> {
  const db = createHttpDb();
  const rows = await db
    .select({ contacts: schema.users.emergencyContacts })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const contacts = rows[0]?.contacts;
  return contacts && contacts.length > 0 ? contacts : null;
}

/** Replace the member's emergency contacts; an empty list clears them. */
export async function setEmergencyContactsColumn(
  userId: string,
  contacts: readonly EmergencyContact[],
  db: DbOrTx = createHttpDb(),
) {
  await db
    .update(schema.users)
    .set({
      emergencyContacts: contacts.length > 0 ? [...contacts] : null,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));
}

/** Raw text write of the two ID-number ciphertext columns. */
export async function setIdDocumentColumns(
  userId: string,
  cols: { passportEncrypted: string | null; saIdEncrypted: string | null },
  db: DbOrTx = createHttpDb(),
) {
  await db
    .update(schema.users)
    .set({ ...cols, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));
}

export interface BurnerProfileReplay {
  userId: string;
  version: string;
  /** The answers with the ID number and emergency contacts already split out. */
  responses: Record<string, unknown>;
  /** The ID ciphertext columns to write, or null to leave the ID alone. */
  idColumns: {
    passportEncrypted: string | null;
    saIdEncrypted: string | null;
  } | null;
  /** The whole list; an empty list clears the column. */
  emergencyContacts: readonly EmergencyContact[];
  /** The change-log row, or null when the replay changed nothing. */
  edit: {
    questionnaireKey: string;
    editedByUserId: string | null;
    changes: QuestionnaireFieldChange[];
  } | null;
}

/**
 * Save a My forms replay of the burner profile in ONE transaction: the
 * answers, the ID number, the emergency contacts, the gate, and the
 * change-log row. Before this each was its own write, so a failure after the
 * answers saved left them changed with no change-log row saying so.
 */
export async function saveBurnerProfileReplay(
  input: BurnerProfileReplay,
): Promise<void> {
  await withTransaction(async (tx) => {
    await upsertBurnerProfile(
      {
        userId: input.userId,
        version: input.version,
        responses: input.responses,
        // A replay only happens on a completed form, so it stays complete.
        markComplete: true,
      },
      tx,
    );
    if (input.idColumns) {
      await setIdDocumentColumns(input.userId, input.idColumns, tx);
    }
    await setEmergencyContactsColumn(input.userId, input.emergencyContacts, tx);
    // A re-submit also re-satisfies the gate (e.g. after a new version).
    await satisfyRequiredAction(
      input.userId,
      "burner_profile",
      input.version,
      tx,
    );
    if (input.edit && input.edit.changes.length > 0) {
      await recordQuestionnaireEdit(
        {
          userId: input.userId,
          questionnaireKey: input.edit.questionnaireKey,
          version: input.version,
          editedByUserId: input.edit.editedByUserId,
          changes: input.edit.changes,
        },
        tx,
      );
    }
  });
}
