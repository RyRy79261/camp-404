import { and, desc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { canApproveClaim, CLAIM_MOVES } from "@camp404/core";
import {
  CLAIM_MAX_FILES,
  type ClaimAccountType,
  type ClaimStatus,
  type Team,
} from "@camp404/types";
import { writeAuditEvent } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { lockMoneyKeeper, MoneyRefused, type MoneyResult } from "./dues";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// Claims (#242): a member's claim for money they spent for a team, and its
// two steps.
//
//  - A member lodges a claim for a team, in whole rand cents, with the day
//    they paid, their bank account (encrypted by the caller: plaintext never
//    reaches this module) and ONE OR MORE receipt files (refused with none).
//  - A lead OF THAT TEAM, or a captain, says yes or no (canApproveClaim), at
//    any amount (owner, 2026-09-30: no limit that needs a second yes).
//  - The Finance team (captains and Finance leads, canManageMoney) marks an
//    approved claim paid, or turns it down after all (a receipt that does not
//    match). Paid claims may later be marked reconciled against the bank.
//
// Every move re-reads the actor's rank and led teams INSIDE its own
// transaction (lockSenderReach, lockMoneyKeeper), so a demotion that
// committed first is seen. Every move is a compare-and-set on the status the
// actor saw, and leaves its audit row in the same transaction. Nobody decides
// or pays their own claim.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type ReimbursementStatus = ClaimStatus;
export type ReimbursementTeam = Team;
export type ClaimResult<T = object> = MoneyResult<T>;

export const CLAIM_NEEDS_A_RECEIPT =
  "Add at least one receipt: a photo or a PDF.";
export const CLAIM_TOO_MANY_FILES = `Add at most ${CLAIM_MAX_FILES} files to one claim.`;
export const CLAIM_BAD_AMOUNT = "The amount must be more than R0.";
export const CLAIM_NO_SUCH_MEMBER = "That member isn't in the camp.";
export const CLAIM_NOT_FOUND =
  "That claim isn't there any more. Reload the page.";
export const CLAIM_CHANGED =
  "Someone else changed this claim first. Reload the page.";
export const NOT_THE_CLAIMS_TEAM =
  "Only a lead of this claim's team, or a captain, can decide it.";
export const CLAIM_NOT_FINANCE =
  "Only captains and Finance leads can pay claims.";
export const OWN_CLAIM_DECISION = "Someone else has to decide your own claim.";
export const OWN_CLAIM_PAYMENT =
  "Someone else in the Finance team has to pay your own claim.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(sentence: string): never {
  throw new MoneyRefused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<ClaimResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof MoneyRefused) {
      return { ok: false, error: error.sentence };
    }
    throw error;
  }
}

// --- Shapes ---------------------------------------------------------------------

/** A receipt file, as a screen links to it: never its stored address. */
export interface ClaimFileRef {
  id: string;
  contentType: string;
}

/** One of a member's own claims. */
export interface MyClaim {
  id: string;
  cycle: number;
  team: Team | null;
  description: string;
  amountCents: number;
  spentOn: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  paidAt: Date | null;
  files: ClaimFileRef[];
}

/**
 * A claim waiting for its team's yes, as a lead of that team reads it: who,
 * how much, when and what for. No receipt and no bank details: those are the
 * Finance team's and the member's only.
 */
export interface ClaimForApproval {
  id: string;
  team: Team | null;
  submitterId: string | null;
  submitterName: string | null;
  description: string;
  amountCents: number;
  spentOn: string | null;
  createdAt: Date;
}

/** A claim as the Finance team reads it. The bank details open on request. */
export interface ClaimForFinance extends ClaimForApproval {
  status: ClaimStatus;
  accountType: ClaimAccountType;
  decisionNote: string | null;
  approverName: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  files: ClaimFileRef[];
}

async function filesFor(
  claimIds: readonly string[],
): Promise<Map<string, ClaimFileRef[]>> {
  const byClaim = new Map<string, ClaimFileRef[]>();
  if (claimIds.length === 0) return byClaim;
  const rows = await createHttpDb()
    .select({
      id: schema.reimbursementFiles.id,
      claimId: schema.reimbursementFiles.reimbursementId,
      contentType: schema.reimbursementFiles.contentType,
    })
    .from(schema.reimbursementFiles)
    .where(inArray(schema.reimbursementFiles.reimbursementId, [...claimIds]))
    .orderBy(schema.reimbursementFiles.position);
  for (const row of rows) {
    const list = byClaim.get(row.claimId) ?? [];
    list.push({ id: row.id, contentType: row.contentType });
    byClaim.set(row.claimId, list);
  }
  return byClaim;
}

// --- Reads ----------------------------------------------------------------------

/** A member's own claims, every year, newest first. */
export async function listMyClaims(userId: string): Promise<MyClaim[]> {
  if (!UUID.test(userId)) return [];
  const r = schema.reimbursements;
  const rows = await createHttpDb()
    .select({
      id: r.id,
      cycle: r.cycle,
      team: r.team,
      description: r.description,
      amountCents: r.amountCents,
      spentOn: r.spentOn,
      status: r.status,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      paidAt: r.paidAt,
    })
    .from(r)
    .where(eq(r.submitterId, userId))
    .orderBy(desc(r.createdAt), desc(r.id));
  const files = await filesFor(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, files: files.get(row.id) ?? [] }));
}

/**
 * The year's claims waiting for a team's yes, oldest first. `teams` limits
 * the read to those teams (a lead's view); "all" reads every team's and the
 * claims under no team (a captain's). An empty list reads nothing.
 */
export async function listClaimsForApproval(input: {
  cycle: number;
  teams: readonly Team[] | "all";
}): Promise<ClaimForApproval[]> {
  if (input.teams !== "all" && input.teams.length === 0) return [];
  const r = schema.reimbursements;
  const submitter = alias(schema.users, "submitter");
  const conditions: SQL[] = [
    eq(r.cycle, input.cycle),
    eq(r.status, "submitted"),
  ];
  if (input.teams !== "all") conditions.push(inArray(r.team, [...input.teams]));
  return createHttpDb()
    .select({
      id: r.id,
      team: r.team,
      submitterId: r.submitterId,
      submitterName: submitter.displayName,
      description: r.description,
      amountCents: r.amountCents,
      spentOn: r.spentOn,
      createdAt: r.createdAt,
    })
    .from(r)
    .leftJoin(submitter, eq(submitter.id, r.submitterId))
    .where(and(...conditions))
    .orderBy(r.createdAt, r.id);
}

/** Every claim of the year, for the Finance team, newest first. */
export async function listClaimsForFinance(
  cycle: number,
): Promise<ClaimForFinance[]> {
  const r = schema.reimbursements;
  const submitter = alias(schema.users, "submitter");
  const approver = alias(schema.users, "approver");
  const rows = await createHttpDb()
    .select({
      id: r.id,
      team: r.team,
      submitterId: r.submitterId,
      submitterName: submitter.displayName,
      description: r.description,
      amountCents: r.amountCents,
      spentOn: r.spentOn,
      createdAt: r.createdAt,
      status: r.status,
      accountType: r.accountType,
      decisionNote: r.decisionNote,
      approverName: approver.displayName,
      approvedAt: r.approvedAt,
      paidAt: r.paidAt,
    })
    .from(r)
    .leftJoin(submitter, eq(submitter.id, r.submitterId))
    .leftJoin(approver, eq(approver.id, r.approverId))
    .where(eq(r.cycle, cycle))
    .orderBy(desc(r.createdAt), desc(r.id));
  const files = await filesFor(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, files: files.get(row.id) ?? [] }));
}

/** Every claim's team, status and amount in one year, for the budget totals. */
export async function listClaimAmounts(
  cycle: number,
): Promise<{ team: Team | null; status: ClaimStatus; amountCents: number }[]> {
  const r = schema.reimbursements;
  return createHttpDb()
    .select({ team: r.team, status: r.status, amountCents: r.amountCents })
    .from(r)
    .where(eq(r.cycle, cycle));
}

/** One receipt file and whose claim it is, for the read route. */
export async function getClaimFile(fileId: string): Promise<{
  pathname: string;
  contentType: string;
  claimId: string;
  submitterId: string | null;
  team: Team | null;
} | null> {
  if (!UUID.test(fileId)) return null;
  const f = schema.reimbursementFiles;
  const r = schema.reimbursements;
  const [row] = await createHttpDb()
    .select({
      pathname: f.pathname,
      contentType: f.contentType,
      claimId: f.reimbursementId,
      submitterId: r.submitterId,
      team: r.team,
    })
    .from(f)
    .innerJoin(r, eq(r.id, f.reimbursementId))
    .where(eq(f.id, fileId))
    .limit(1);
  return row ?? null;
}

/**
 * A claim's encrypted bank details and whose they are. The caller decides
 * who may read them (the member, or the Finance team, audited) and decrypts.
 */
export async function getClaimAccount(claimId: string): Promise<{
  submitterId: string | null;
  team: Team | null;
  accountType: ClaimAccountType;
  accountDetailsEncrypted: string;
} | null> {
  if (!UUID.test(claimId)) return null;
  const r = schema.reimbursements;
  const [row] = await createHttpDb()
    .select({
      submitterId: r.submitterId,
      team: r.team,
      accountType: r.accountType,
      accountDetailsEncrypted: r.accountDetailsEncrypted,
    })
    .from(r)
    .where(eq(r.id, claimId))
    .limit(1);
  return row ?? null;
}

// --- Writes ---------------------------------------------------------------------

export interface SubmitClaimInput {
  submitterId: string;
  cycle: number;
  team: Team;
  description: string;
  amountCents: number;
  spentOn: string;
  accountType: ClaimAccountType;
  /** Already encrypted by the caller: plaintext never reaches this module. */
  accountDetailsEncrypted: string;
  /** The stored receipt files: at least one. */
  files: readonly { pathname: string; contentType: string }[];
}

/** Lodge a member's claim with its receipts, in rands. */
export async function submitClaim(
  input: SubmitClaimInput,
): Promise<ClaimResult<{ id: string }>> {
  if (input.files.length === 0)
    return { ok: false, error: CLAIM_NEEDS_A_RECEIPT };
  if (input.files.length > CLAIM_MAX_FILES) {
    return { ok: false, error: CLAIM_TOO_MANY_FILES };
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: CLAIM_BAD_AMOUNT };
  }
  if (!UUID.test(input.submitterId)) {
    return { ok: false, error: CLAIM_NO_SUCH_MEMBER };
  }
  return write(async (tx) => {
    const [member] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, input.submitterId),
          eq(schema.users.isSystem, false),
          eq(schema.users.sanitised, false),
        ),
      )
      .limit(1);
    if (!member) refuse(CLAIM_NO_SUCH_MEMBER);
    const [claim] = await tx
      .insert(schema.reimbursements)
      .values({
        submitterId: input.submitterId,
        cycle: input.cycle,
        team: input.team,
        amountCents: input.amountCents,
        currency: "ZAR",
        spentOn: input.spentOn,
        accountType: input.accountType,
        accountDetailsEncrypted: input.accountDetailsEncrypted,
        description: input.description,
      })
      .returning({ id: schema.reimbursements.id });
    await tx.insert(schema.reimbursementFiles).values(
      input.files.map((file, position) => ({
        reimbursementId: claim!.id,
        position,
        pathname: file.pathname,
        contentType: file.contentType,
      })),
    );
    return { id: claim!.id };
  });
}

/** The claim row a move reads, locked for the move. */
async function lockClaim(tx: Tx, claimId: string) {
  if (!UUID.test(claimId)) refuse(CLAIM_NOT_FOUND);
  const [claim] = await tx
    .select({
      id: schema.reimbursements.id,
      submitterId: schema.reimbursements.submitterId,
      team: schema.reimbursements.team,
      status: schema.reimbursements.status,
      amountCents: schema.reimbursements.amountCents,
    })
    .from(schema.reimbursements)
    .where(eq(schema.reimbursements.id, claimId))
    .for("update");
  if (!claim) refuse(CLAIM_NOT_FOUND);
  return claim;
}

/** Move a locked claim from `from` to `to`, stamp it, and audit it. */
async function move(
  tx: Tx,
  input: {
    claim: Awaited<ReturnType<typeof lockClaim>>;
    from: ClaimStatus;
    to: ClaimStatus;
    actorId: string;
    note?: string | null;
  },
): Promise<void> {
  const { claim } = input;
  if (
    claim.status !== input.from ||
    !CLAIM_MOVES[input.from].includes(input.to)
  ) {
    refuse(CLAIM_CHANGED);
  }
  const now = new Date();
  const stamp =
    input.from === "submitted"
      ? {
          approverId: input.actorId,
          approvedAt: now,
          decisionNote: input.note ?? null,
        }
      : input.to === "paid"
        ? { paidById: input.actorId, paidAt: now }
        : input.to === "rejected"
          ? { decisionNote: input.note ?? null }
          : { reconciledAt: now };
  const rows = await tx
    .update(schema.reimbursements)
    .set({ status: input.to, updatedAt: now, ...stamp })
    .where(
      and(
        eq(schema.reimbursements.id, claim.id),
        eq(schema.reimbursements.status, input.from),
      ),
    )
    .returning({ id: schema.reimbursements.id });
  if (rows.length === 0) refuse(CLAIM_CHANGED);
  await writeAuditEvent(tx, {
    actorId: input.actorId,
    action: "reimbursement.status_changed",
    target: claim.submitterId,
    metadata: {
      reimbursementId: claim.id,
      from: input.from,
      to: input.to,
      team: claim.team,
      amountCents: claim.amountCents,
      currency: "ZAR",
    },
  });
}

/**
 * A team's yes or no on a claim waiting for it: a lead of that team, or a
 * captain, never on their own claim. A no may carry a note for the member.
 */
export async function decideClaim(input: {
  claimId: string;
  decision: "approved" | "rejected";
  note?: string | null;
  actorId: string;
}): Promise<ClaimResult> {
  return write(async (tx) => {
    if (!UUID.test(input.actorId)) refuse(NOT_THE_CLAIMS_TEAM);
    const reach = await lockSenderReach(tx, input.actorId);
    const claim = await lockClaim(tx, input.claimId);
    if (!canApproveClaim(reachRank(reach), reach ?? [], claim.team)) {
      refuse(NOT_THE_CLAIMS_TEAM);
    }
    if (claim.submitterId === input.actorId) refuse(OWN_CLAIM_DECISION);
    await move(tx, {
      claim,
      from: "submitted",
      to: input.decision,
      actorId: input.actorId,
      note: input.decision === "rejected" ? input.note : null,
    });
    return {};
  });
}

/**
 * The Finance team marks an approved claim paid, or turns it down after all
 * (with a note for the member). Never on their own claim.
 */
export async function payClaim(input: {
  claimId: string;
  decision: "paid" | "rejected";
  note?: string | null;
  actorId: string;
}): Promise<ClaimResult> {
  return write(async (tx) => {
    if (!(await lockMoneyKeeper(tx, input.actorId))) refuse(CLAIM_NOT_FINANCE);
    const claim = await lockClaim(tx, input.claimId);
    if (claim.submitterId === input.actorId) refuse(OWN_CLAIM_PAYMENT);
    await move(tx, {
      claim,
      from: "approved",
      to: input.decision,
      actorId: input.actorId,
      note: input.decision === "rejected" ? input.note : null,
    });
    return {};
  });
}

/** The Finance team matches a paid claim to the bank statement. */
export async function reconcileClaim(input: {
  claimId: string;
  actorId: string;
}): Promise<ClaimResult> {
  return write(async (tx) => {
    if (!(await lockMoneyKeeper(tx, input.actorId))) refuse(CLAIM_NOT_FINANCE);
    const claim = await lockClaim(tx, input.claimId);
    if (claim.submitterId === input.actorId) refuse(OWN_CLAIM_PAYMENT);
    await move(tx, {
      claim,
      from: "paid",
      to: "reconciled",
      actorId: input.actorId,
    });
    return {};
  });
}

// --- The Claude connector's review list ------------------------------------------

export interface ReimbursementReviewRow extends ClaimForApproval {
  /** The submitter's AI data consent: gates a decrypted account for anyone else. */
  submitterAiDataConsent: boolean;
  cycle: number;
  status: ClaimStatus;
  accountType: ClaimAccountType;
  accountDetailsEncrypted: string;
  decisionNote: string | null;
  approverId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  reconciledAt: Date | null;
  receiptCount: number;
}

/**
 * Claims for the connector's review tools, newest first. `teams` limits the
 * read to those teams (a team lead's view); leave it out for every claim,
 * "general" ones (no team) included. An empty `teams` reads nothing.
 */
export async function listReimbursementsForReview(
  options: {
    status?: ClaimStatus;
    teams?: readonly Team[];
    /** Only claims lodged under no team. Ignored when `teams` is given. */
    generalOnly?: boolean;
    id?: string;
  } = {},
): Promise<ReimbursementReviewRow[]> {
  if (options.teams && options.teams.length === 0) return [];
  if (options.id !== undefined && !UUID.test(options.id)) return [];
  const r = schema.reimbursements;
  const submitter = alias(schema.users, "submitter");
  const conditions: (SQL | undefined)[] = [
    options.status ? eq(r.status, options.status) : undefined,
    options.id ? eq(r.id, options.id) : undefined,
  ];
  if (options.teams) {
    conditions.push(inArray(r.team, [...options.teams]));
  } else if (options.generalOnly) {
    conditions.push(isNull(r.team));
  }
  const rows = await createHttpDb()
    .select({
      id: r.id,
      cycle: r.cycle,
      team: r.team,
      submitterId: r.submitterId,
      submitterName: submitter.displayName,
      submitterAiDataConsent: submitter.aiDataConsent,
      description: r.description,
      amountCents: r.amountCents,
      spentOn: r.spentOn,
      createdAt: r.createdAt,
      status: r.status,
      accountType: r.accountType,
      accountDetailsEncrypted: r.accountDetailsEncrypted,
      decisionNote: r.decisionNote,
      approverId: r.approverId,
      approvedAt: r.approvedAt,
      paidAt: r.paidAt,
      reconciledAt: r.reconciledAt,
    })
    .from(r)
    .leftJoin(submitter, eq(submitter.id, r.submitterId))
    .where(and(...conditions))
    .orderBy(desc(r.createdAt));
  const files = await filesFor(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    submitterAiDataConsent: row.submitterAiDataConsent ?? false,
    receiptCount: files.get(row.id)?.length ?? 0,
  }));
}

/** One claim for the connector's review tools, or null. */
export async function getReimbursementForReview(
  id: string,
): Promise<ReimbursementReviewRow | null> {
  const [row] = await listReimbursementsForReview({ id });
  return row ?? null;
}
