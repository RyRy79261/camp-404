import { and, eq, isNull, or, sql, gt } from "drizzle-orm";
import { normalizeInviteCode } from "@camp404/core";
import { writeAuditEvent } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

export type AssignedRank = "captain" | "member";

export interface InviteCodeRow {
  code: string;
  createdByUserId: string | null;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  assignedRank: AssignedRank | null;
  invitedEmail: string | null;
  requiresApproval: boolean;
  createdAt: Date;
}

/**
 * Look up an invite code that is currently usable (not revoked, not
 * expired, and still has uses remaining if a cap is set). Returns null
 * for any state that means "not redeemable right now".
 */
export async function findUsableInviteCode(
  code: string,
): Promise<InviteCodeRow | null> {
  const db = createHttpDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.inviteCodes)
    .where(
      and(
        eq(schema.inviteCodes.code, normalizeInviteCode(code)),
        isNull(schema.inviteCodes.revokedAt),
        or(
          isNull(schema.inviteCodes.expiresAt),
          gt(schema.inviteCodes.expiresAt, now),
        ),
        or(
          isNull(schema.inviteCodes.maxUses),
          gt(schema.inviteCodes.maxUses, schema.inviteCodes.useCount),
        ),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Atomically increment use_count when the code is still redeemable.
 * Returns the updated row, or null if the code became unusable in the
 * meantime (race between redemption attempts).
 */
export async function consumeInviteCode(
  code: string,
): Promise<InviteCodeRow | null> {
  const db = createHttpDb();
  const now = new Date();
  const rows = await db
    .update(schema.inviteCodes)
    .set({ useCount: sql`${schema.inviteCodes.useCount} + 1` })
    .where(
      and(
        eq(schema.inviteCodes.code, normalizeInviteCode(code)),
        isNull(schema.inviteCodes.revokedAt),
        or(
          isNull(schema.inviteCodes.expiresAt),
          gt(schema.inviteCodes.expiresAt, now),
        ),
        or(
          isNull(schema.inviteCodes.maxUses),
          gt(schema.inviteCodes.maxUses, schema.inviteCodes.useCount),
        ),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function createInviteCode(input: {
  code: string;
  createdByUserId: string | null;
  note?: string | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
  assignedRank?: AssignedRank | null;
  invitedEmail?: string | null;
  requiresApproval?: boolean;
}): Promise<InviteCodeRow> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.inviteCodes)
    .values({
      code: normalizeInviteCode(input.code),
      createdByUserId: input.createdByUserId,
      note: input.note ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
      assignedRank: input.assignedRank ?? null,
      invitedEmail: input.invitedEmail?.toLowerCase() ?? null,
      requiresApproval: input.requiresApproval ?? false,
    })
    .returning();
  if (!row) throw new Error("Failed to insert invite code");
  return row;
}

/**
 * Existence check — used for GitHub-style "is this code name taken?"
 * availability hints on /tools/invite. Returns the row regardless of
 * revoked / expired / exhausted state, because we don't want to let two
 * people pick the same name even if the first one is dead — codes are
 * forever-unique by primary key anyway, this just gives the UI an early
 * heads-up before the insert fails.
 */
export async function findInviteCodeByCode(
  code: string,
): Promise<InviteCodeRow | null> {
  const db = createHttpDb();
  const rows = await db
    .select()
    .from(schema.inviteCodes)
    .where(eq(schema.inviteCodes.code, normalizeInviteCode(code)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Revoke an invite code, so nobody can redeem it again. Members who already
 * joined with it keep their place. Writes an `invite.revoked` audit row in the
 * same transaction. Returns false when there is no such code, or it was
 * already revoked.
 */
export async function revokeInviteCode(input: {
  code: string;
  actorUserId: string | null;
}): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const rows = await tx
      .update(schema.inviteCodes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.inviteCodes.code, normalizeInviteCode(input.code)),
          isNull(schema.inviteCodes.revokedAt),
        ),
      )
      .returning({ useCount: schema.inviteCodes.useCount });
    if (rows.length === 0) return false;
    await writeAuditEvent(tx, {
      actorId: input.actorUserId,
      action: "invite.revoked",
      target: input.code,
      metadata: { useCount: rows[0]!.useCount },
    });
    return true;
  });
}
