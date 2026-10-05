import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { approvalNotification, isReviewTransition } from "@camp404/core";
import type {
  ApprovalStatus,
  EmergencyContact,
  QuestionnaireFieldChange,
} from "@camp404/types";
import { satisfyRequiredAction } from "./activations";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
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
      ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
    })
    .returning();
  if (!created) throw new Error("Failed to insert camp user row");
  return created;
}

/**
 * The camp user for this auth id, creating it with `input` when there is none.
 * Race-safe: two first requests from one new account (the founder's first
 * page load fires several at once) both see no row, and a plain insert made
 * the second one fail on the unique `auth_user_id`. The insert does nothing
 * on that conflict, and the loser reads the winner's row. `created` says which
 * one this call was. The target is `auth_user_id` alone (a plain unique
 * constraint, not a partial index), so any other conflict still throws.
 *
 * `gate`, when given, is the blocking required action the new row starts with
 * (the founder's burner profile). It is written in the SAME transaction as
 * the row, so no other request can see the row without its gate: a request
 * that finds the row already there (and returns it at once) never lets the
 * member past a gate the winner has not written yet. The loser writes it too
 * (idempotent), so the gate exists whichever call returns first.
 */
export async function findOrCreateCampUser(
  input: {
    authUserId: string;
    displayName: string | null;
    inviteCode: string | null;
    rank?: "captain" | "member";
    approvalStatus?: "pending" | "approved" | "rejected";
  },
  gate?: {
    type: "questionnaire";
    actionKey: string;
    title: string;
    version: string | null;
  },
): Promise<{ user: typeof schema.users.$inferSelect; created: boolean }> {
  const values = {
    authUserId: input.authUserId,
    displayName: input.displayName,
    inviteCode: input.inviteCode,
    ...(input.rank ? { rank: input.rank } : {}),
    ...(input.approvalStatus ? { approvalStatus: input.approvalStatus } : {}),
  };
  if (!gate) {
    const db = createHttpDb();
    const [created] = await db
      .insert(schema.users)
      .values(values)
      .onConflictDoNothing({ target: schema.users.authUserId })
      .returning();
    if (created) return { user: created, created: true };
    const existing = await findUserByAuthId(input.authUserId);
    if (!existing) throw new Error("Failed to insert or find camp user row");
    return { user: existing, created: false };
  }
  return withTransaction(async (tx) => {
    const [created] = await tx
      .insert(schema.users)
      .values(values)
      .onConflictDoNothing({ target: schema.users.authUserId })
      .returning();
    const user =
      created ??
      (
        await tx
          .select()
          .from(schema.users)
          .where(eq(schema.users.authUserId, input.authUserId))
          .limit(1)
      )[0];
    if (!user) throw new Error("Failed to insert or find camp user row");
    await tx
      .insert(schema.requiredActions)
      .values({
        userId: user.id,
        type: gate.type,
        actionKey: gate.actionKey,
        title: gate.title,
        version: gate.version,
        blocking: true,
      })
      .onConflictDoNothing({
        target: [
          schema.requiredActions.userId,
          schema.requiredActions.actionKey,
        ],
      });
    return { user, created: !!created };
  });
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
 * Record a captain's vetting decision: approve, reject, or re-open to pending,
 * from whatever the member's status is now (owner's call, 2026-09-16: a
 * decision can be reversed). Stamps who decided and when.
 *
 * Compare-and-set on `from`, the status the captain was looking at. Two
 * captains working from separately-rendered rosters can both see the same
 * controls; without the precondition the second write silently overwrites the
 * first decision AND its audit stamp. Returns true when this call was the
 * decision, false when the row had already moved (or no such user). A move
 * that is not a decision at all (see isReviewTransition) throws.
 *
 * In the same transaction, only for the call that won:
 * - a `member.approval_decided` audit row;
 * - on approval, the "you're in" pop-up and push (a rejection or a re-open
 *   sends nothing, see approvalNotification);
 * - on rejection, the member comes off every team for this year (offboarding,
 *   owner's call). Past years stay on file, and approving them again does not
 *   put them back on a team.
 * - leaving approved (rejected, or re-opened to pending), the member comes off
 *   this year's shifts: only an approved member is on the roster, so a place
 *   kept for them would be full with nobody on it, and no lead could take
 *   them off. Approving them again does not put them back.
 */
export async function setUserApproval(input: {
  userId: string;
  /** The status the deciding captain saw. */
  from: ApprovalStatus;
  to: ApprovalStatus;
  decidedByUserId: string;
  /** What the captain tells the member; null or blank means none. */
  reason?: string | null;
}): Promise<boolean> {
  if (!isReviewTransition(input.from, input.to)) {
    throw new Error(
      `setUserApproval: ${input.from} -> ${input.to} is not a decision`,
    );
  }
  // A re-open clears the reason: it belonged to the decision being undone.
  const reason = input.to === "pending" ? null : input.reason?.trim() || null;
  // Resolved BEFORE the transaction: currentCycleNumber() reads camp_settings
  // on its own handle (see team-memberships.ts).
  const leaving = input.from === "approved";
  const cycle =
    input.to === "rejected" || leaving ? await currentCycleNumber() : null;
  return await withTransaction(async (tx) => {
    const rows = await tx
      .update(schema.users)
      .set({
        approvalStatus: input.to,
        approvalDecidedByUserId: input.decidedByUserId,
        approvalDecidedAt: new Date(),
        approvalDecisionReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.users.id, input.userId),
          eq(schema.users.approvalStatus, input.from),
        ),
      )
      .returning({ id: schema.users.id });
    if (rows.length === 0) return false;

    const removedTeams =
      cycle === null || input.to !== "rejected"
        ? []
        : await tx
            .delete(schema.teamMemberships)
            .where(
              and(
                eq(schema.teamMemberships.userId, input.userId),
                eq(schema.teamMemberships.cycle, cycle),
              ),
            )
            .returning({
              team: schema.teamMemberships.team,
              isLead: schema.teamMemberships.isLead,
            });

    await writeAuditEvent(tx, {
      actorId: input.decidedByUserId,
      action: "member.approval_decided",
      target: input.userId,
      // Whether a reason was given, not the words: the audit row records the
      // decision, and the reason lives on the member's row.
      metadata: {
        from: input.from,
        status: input.to,
        withReason: reason !== null,
      },
    });
    for (const removed of removedTeams) {
      await writeAuditEvent(tx, {
        actorId: input.decidedByUserId,
        action: "member.team_removed",
        target: input.userId,
        metadata: {
          team: removed.team,
          cycle,
          wasLead: removed.isLead,
          because: "rejected",
        },
      });
    }
    if (leaving && cycle !== null) {
      const thisYearsSlots = tx
        .select({ id: schema.shiftSlots.id })
        .from(schema.shiftSlots)
        .innerJoin(
          schema.shiftTypes,
          eq(schema.shiftTypes.id, schema.shiftSlots.typeId),
        )
        .where(eq(schema.shiftTypes.cycle, cycle));
      const removedShifts = await tx
        .delete(schema.shiftSignups)
        .where(
          and(
            eq(schema.shiftSignups.userId, input.userId),
            inArray(schema.shiftSignups.slotId, thisYearsSlots),
          ),
        )
        .returning({ slotId: schema.shiftSignups.slotId });
      for (const removed of removedShifts) {
        await writeAuditEvent(tx, {
          actorId: input.decidedByUserId,
          action: "shifts.member_removed",
          target: input.userId,
          metadata: { cycle, slotId: removed.slotId, because: input.to },
        });
      }
    }
    if (input.to === "approved") {
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

/**
 * The member's Telegram username (bare, no `@`), or null to clear it. The
 * roster reads it as the member's handle.
 */
export async function setTelegramHandleColumn(
  userId: string,
  handle: string | null,
  db: DbOrTx = createHttpDb(),
) {
  await db
    .update(schema.users)
    .set({ telegramHandle: handle, updatedAt: new Date() })
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
  /** The Telegram username, or null to clear it; undefined leaves it alone. */
  telegramHandle?: string | null;
  /** The change-log row, or null when the replay changed nothing. */
  edit: {
    questionnaireKey: string;
    editedByUserId: string | null;
    changes: QuestionnaireFieldChange[];
  } | null;
  /**
   * The `updated_at` of the completed profile the new answers were built on.
   * Given, the save is a compare-and-set: it writes only while the stored
   * profile is still complete and still that one, so answers merged over a
   * copy someone has since changed never overwrite the change. The Claude
   * connector merges a partial patch over the stored answers, so it passes it.
   */
  expectUpdatedAt?: Date;
}

/**
 * Save a My forms replay of the burner profile in ONE transaction: the
 * answers, the ID number, the emergency contacts, the gate, and the
 * change-log row. Before this each was its own write, so a failure after the
 * answers saved left them changed with no change-log row saying so.
 *
 * Returns false, having written nothing, when `expectUpdatedAt` is given and
 * the stored profile is no longer that completed one.
 */
export async function saveBurnerProfileReplay(
  input: BurnerProfileReplay,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    if (input.expectUpdatedAt) {
      // Milliseconds: the stored stamp may carry microseconds (defaultNow),
      // and the Date the caller read it into does not.
      const won = await tx
        .update(schema.burnerProfiles)
        .set({
          version: input.version,
          responses: input.responses,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.burnerProfiles.userId, input.userId),
            isNotNull(schema.burnerProfiles.completedAt),
            sql`date_trunc('milliseconds', ${schema.burnerProfiles.updatedAt}) = ${input.expectUpdatedAt.toISOString()}::timestamp`,
          ),
        )
        .returning({ userId: schema.burnerProfiles.userId });
      if (won.length === 0) return false;
    } else {
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
    }
    if (input.idColumns) {
      await setIdDocumentColumns(input.userId, input.idColumns, tx);
    }
    await setEmergencyContactsColumn(input.userId, input.emergencyContacts, tx);
    if (input.telegramHandle !== undefined) {
      await setTelegramHandleColumn(input.userId, input.telegramHandle, tx);
    }
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
    return true;
  });
}
