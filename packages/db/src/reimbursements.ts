import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAuditEvent } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Reimbursement review: the moves a claim may make after a member submits it,
// each one a compare-and-set on the status it was read in, with its audit row
// in the same transaction. Who may make which move is the caller's check (the
// MCP captain tools); this module only refuses a move the status does not
// allow, or one another reviewer already made.

export type ReimbursementStatus =
  (typeof schema.reimbursementStatusEnum.enumValues)[number];
export type ReimbursementTeam = (typeof schema.teamEnum.enumValues)[number];

/** The only moves a claim can make. Rejected and reconciled are final. */
export const REIMBURSEMENT_MOVES: Readonly<
  Record<ReimbursementStatus, readonly ReimbursementStatus[]>
> = {
  submitted: ["approved", "rejected"],
  approved: ["paid"],
  paid: ["reconciled"],
  reconciled: [],
  rejected: [],
};

export interface ReimbursementReviewRow {
  id: string;
  submitterId: string | null;
  submitterName: string | null;
  /** The submitter's AI data consent: gates a decrypted account for anyone else. */
  submitterAiDataConsent: boolean;
  team: ReimbursementTeam | null;
  amount: string;
  currency: string;
  accountType: (typeof schema.reimbursementAccountTypeEnum.enumValues)[number];
  accountDetailsEncrypted: string;
  description: string;
  receiptBlobUrl: string | null;
  itemPhotoBlobUrl: string | null;
  voiceMemoBlobUrl: string | null;
  status: ReimbursementStatus;
  approverId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  reconciledAt: Date | null;
  createdAt: Date;
}

/** The submitter alias and the columns every review read selects. */
function reviewSelect() {
  const submitter = alias(schema.users, "submitter");
  return {
    submitter,
    columns: {
      id: schema.reimbursements.id,
      submitterId: schema.reimbursements.submitterId,
      submitterName: submitter.displayName,
      submitterAiDataConsent: submitter.aiDataConsent,
      team: schema.reimbursements.team,
      amount: schema.reimbursements.amount,
      currency: schema.reimbursements.currency,
      accountType: schema.reimbursements.accountType,
      accountDetailsEncrypted: schema.reimbursements.accountDetailsEncrypted,
      description: schema.reimbursements.description,
      receiptBlobUrl: schema.reimbursements.receiptBlobUrl,
      itemPhotoBlobUrl: schema.reimbursements.itemPhotoBlobUrl,
      voiceMemoBlobUrl: schema.reimbursements.voiceMemoBlobUrl,
      status: schema.reimbursements.status,
      approverId: schema.reimbursements.approverId,
      approvedAt: schema.reimbursements.approvedAt,
      paidAt: schema.reimbursements.paidAt,
      reconciledAt: schema.reimbursements.reconciledAt,
      createdAt: schema.reimbursements.createdAt,
    },
  };
}

/**
 * Claims for review, newest first. `teams` limits the read to those teams
 * (a team lead's view); leave it out for every claim, "general" ones (no team)
 * included. An empty `teams` reads nothing.
 */
export async function listReimbursementsForReview(
  options: {
    status?: ReimbursementStatus;
    teams?: readonly ReimbursementTeam[];
    /** Only claims lodged under no team. Ignored when `teams` is given. */
    generalOnly?: boolean;
  } = {},
): Promise<ReimbursementReviewRow[]> {
  if (options.teams && options.teams.length === 0) return [];
  const { submitter, columns } = reviewSelect();
  const conditions: (SQL | undefined)[] = [
    options.status
      ? eq(schema.reimbursements.status, options.status)
      : undefined,
  ];
  if (options.teams) {
    conditions.push(inArray(schema.reimbursements.team, [...options.teams]));
  } else if (options.generalOnly) {
    conditions.push(isNull(schema.reimbursements.team));
  }
  const rows = await createHttpDb()
    .select(columns)
    .from(schema.reimbursements)
    .leftJoin(submitter, eq(submitter.id, schema.reimbursements.submitterId))
    .where(and(...conditions))
    .orderBy(desc(schema.reimbursements.createdAt));
  return rows.map((row) => ({
    ...row,
    submitterAiDataConsent: row.submitterAiDataConsent ?? false,
  }));
}

/** One claim for review, or null. */
export async function getReimbursementForReview(
  id: string,
): Promise<ReimbursementReviewRow | null> {
  const { submitter, columns } = reviewSelect();
  const [row] = await createHttpDb()
    .select(columns)
    .from(schema.reimbursements)
    .leftJoin(submitter, eq(submitter.id, schema.reimbursements.submitterId))
    .where(eq(schema.reimbursements.id, id))
    .limit(1);
  return row
    ? { ...row, submitterAiDataConsent: row.submitterAiDataConsent ?? false }
    : null;
}

export type MoveReimbursementResult =
  | { ok: true }
  | { ok: false; reason: "not_allowed" | "stale" };

/**
 * Move a claim from the status the caller read to the next one. Refuses a
 * move REIMBURSEMENT_MOVES does not list, and a claim whose status changed
 * since the caller read it (another reviewer got there first).
 */
export async function moveReimbursement(input: {
  id: string;
  from: ReimbursementStatus;
  to: ReimbursementStatus;
  actorId: string;
}): Promise<MoveReimbursementResult> {
  if (!REIMBURSEMENT_MOVES[input.from].includes(input.to)) {
    return { ok: false, reason: "not_allowed" };
  }
  const now = new Date();
  const stamp =
    input.to === "approved" || input.to === "rejected"
      ? { approverId: input.actorId, approvedAt: now }
      : input.to === "paid"
        ? { paidAt: now }
        : { reconciledAt: now };
  return await withTransaction(async (tx) => {
    const [row] = await tx
      .update(schema.reimbursements)
      .set({ status: input.to, updatedAt: now, ...stamp })
      .where(
        and(
          eq(schema.reimbursements.id, input.id),
          eq(schema.reimbursements.status, input.from),
        ),
      )
      .returning({
        submitterId: schema.reimbursements.submitterId,
        team: schema.reimbursements.team,
        amount: schema.reimbursements.amount,
        currency: schema.reimbursements.currency,
      });
    if (!row) return { ok: false as const, reason: "stale" as const };
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "reimbursement.status_changed",
      target: row.submitterId,
      metadata: {
        reimbursementId: input.id,
        from: input.from,
        to: input.to,
        team: row.team,
        amount: row.amount,
        currency: row.currency,
      },
    });
    return { ok: true as const };
  });
}
