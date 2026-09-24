import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNull, ne, or, sql, gt } from "drizzle-orm";
import { FOUNDER_CODE, normalizeInviteCode } from "@camp404/core";
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
 * The root code is single-use (owner, 2026-09-24): it is a fixed word in a
 * public repo, and only the founder should get in with it. Enforced here, on
 * every read and redeem, whatever cap its stored row still carries from before
 * (setup minted it with 100 uses).
 */
const rootCodeUnused = or(
  ne(schema.inviteCodes.code, FOUNDER_CODE),
  eq(schema.inviteCodes.useCount, 0),
);

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
        rootCodeUnused,
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
        rootCodeUnused,
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

export interface ListedInviteCode extends InviteCodeRow {
  /** Who made it; null for the root code and CLI-minted codes. */
  createdByName: string | null;
}

/**
 * Invite codes, newest first: every code for a captain, or only the ones a
 * member made (pass `createdByUserId`, served by invite_codes_created_by_idx).
 */
export async function listInviteCodes(
  options: { createdByUserId?: string } = {},
): Promise<ListedInviteCode[]> {
  const db = createHttpDb();
  const creator = alias(schema.users, "creator");
  return db
    .select({
      code: schema.inviteCodes.code,
      createdByUserId: schema.inviteCodes.createdByUserId,
      createdByName: creator.displayName,
      note: schema.inviteCodes.note,
      maxUses: schema.inviteCodes.maxUses,
      useCount: schema.inviteCodes.useCount,
      expiresAt: schema.inviteCodes.expiresAt,
      revokedAt: schema.inviteCodes.revokedAt,
      assignedRank: schema.inviteCodes.assignedRank,
      invitedEmail: schema.inviteCodes.invitedEmail,
      requiresApproval: schema.inviteCodes.requiresApproval,
      createdAt: schema.inviteCodes.createdAt,
    })
    .from(schema.inviteCodes)
    .leftJoin(creator, eq(creator.id, schema.inviteCodes.createdByUserId))
    .where(
      options.createdByUserId
        ? eq(schema.inviteCodes.createdByUserId, options.createdByUserId)
        : undefined,
    )
    .orderBy(desc(schema.inviteCodes.createdAt));
}

/**
 * Revoke an invite code, so nobody can redeem it again. Members who already
 * joined with it keep their place. Writes an `invite.revoked` audit row in the
 * same transaction. Returns false when there is no such code, it was already
 * revoked, or `createdByUserId` is given and the code is someone else's.
 *
 * A member may revoke only codes they made (pass their id); a captain, or the
 * admin CLI, may revoke any code (leave it out).
 */
export async function revokeInviteCode(input: {
  code: string;
  actorUserId: string | null;
  createdByUserId?: string;
}): Promise<boolean> {
  return await withTransaction(async (tx) => {
    const rows = await tx
      .update(schema.inviteCodes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.inviteCodes.code, normalizeInviteCode(input.code)),
          isNull(schema.inviteCodes.revokedAt),
          input.createdByUserId
            ? eq(schema.inviteCodes.createdByUserId, input.createdByUserId)
            : undefined,
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
