import { and, eq, isNull, or, sql, gt } from "drizzle-orm";
import { createHttpDb } from "./index";
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
        eq(schema.inviteCodes.code, code),
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
        eq(schema.inviteCodes.code, code),
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
}): Promise<InviteCodeRow> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.inviteCodes)
    .values({
      code: input.code,
      createdByUserId: input.createdByUserId,
      note: input.note ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt: input.expiresAt ?? null,
      assignedRank: input.assignedRank ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to insert invite code");
  return row;
}
