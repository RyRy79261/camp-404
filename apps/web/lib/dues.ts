import "server-only";

import * as db from "@camp404/db/dues";
import type {
  DuesAccountRow,
  DuesChargeRow,
  DuesPaymentRow,
  DuesRefundRow,
  DuesYear,
  FeeTier,
  MemberDues,
  MoneyResult,
  RefundProposal,
  SettleUpCandidate,
} from "@camp404/db/dues";
import { duesTestStore } from "./test-store-dues";
import { usesTestStore } from "./test-mode";

// Dues (#240), from the database or, under E2E, the test store's twin. The
// rules live in @camp404/db/dues and the twin repeats them. Every Finance
// write re-checks the actor itself (a captain or a Finance lead), so a caller
// passes only who is acting, never a rank or a team list.

export type {
  DuesAccountRow,
  DuesChargeRow,
  DuesPaymentRow,
  DuesRefundRow,
  DuesYear,
  FeeTier,
  MemberDues,
  MoneyResult,
  RefundProposal,
  SettleUpCandidate,
};

type In<F extends (...args: never[]) => unknown> = Parameters<F>[0];

const store = () => (usesTestStore() ? duesTestStore : null);

// --- Reads --------------------------------------------------------------------

export async function getDuesYear(cycle: number): Promise<DuesYear> {
  return store()?.getDuesYear(cycle) ?? db.getDuesYear(cycle);
}

export async function listFeeTiers(
  cycle: number,
  options: { includeArchived?: boolean } = {},
): Promise<FeeTier[]> {
  return (
    store()?.listFeeTiers(cycle, options) ?? db.listFeeTiers(cycle, options)
  );
}

export async function getMemberDues(
  userId: string,
  cycle: number,
  options: { forFinance: boolean; today?: string },
): Promise<MemberDues | null> {
  const s = store();
  return s
    ? s.getMemberDues(userId, cycle, options)
    : db.getMemberDues(userId, cycle, options);
}

export async function listDuesAccounts(
  cycle: number,
  today: string,
): Promise<DuesAccountRow[]> {
  return (
    store()?.listDuesAccounts(cycle, today) ?? db.listDuesAccounts(cycle, today)
  );
}

export async function settleUpCandidates(
  cycle: number,
): Promise<SettleUpCandidate[]> {
  return store()?.settleUpCandidates(cycle) ?? db.settleUpCandidates(cycle);
}

export async function getPaymentProof(
  paymentId: string,
): Promise<Awaited<ReturnType<typeof db.getPaymentProof>>> {
  const s = store();
  return s ? s.getPaymentProof(paymentId) : db.getPaymentProof(paymentId);
}

export async function statementContext(
  cycle: number,
): Promise<Awaited<ReturnType<typeof db.statementContext>>> {
  return store()?.statementContext(cycle) ?? db.statementContext(cycle);
}

// --- Writes -------------------------------------------------------------------

export async function saveDuesYear(
  input: In<typeof db.saveDuesYear>,
): Promise<MoneyResult<{ version: number }>> {
  return store()?.saveDuesYear(input) ?? db.saveDuesYear(input);
}

export async function addFeeTier(
  input: In<typeof db.addFeeTier>,
): Promise<MoneyResult<{ id: string }>> {
  return store()?.addFeeTier(input) ?? db.addFeeTier(input);
}

export async function editFeeTier(
  input: In<typeof db.editFeeTier>,
): Promise<MoneyResult> {
  return store()?.editFeeTier(input) ?? db.editFeeTier(input);
}

export async function archiveFeeTier(
  input: In<typeof db.archiveFeeTier>,
): Promise<MoneyResult> {
  return store()?.archiveFeeTier(input) ?? db.archiveFeeTier(input);
}

export async function savePledge(
  input: In<typeof db.savePledge>,
): Promise<MoneyResult<{ charged: boolean }>> {
  return store()?.savePledge(input) ?? db.savePledge(input);
}

export async function setFee(
  input: In<typeof db.setFee>,
): Promise<MoneyResult<{ id: string }>> {
  return store()?.setFee(input) ?? db.setFee(input);
}

export async function addCharge(
  input: In<typeof db.addCharge>,
): Promise<MoneyResult<{ id: string }>> {
  return store()?.addCharge(input) ?? db.addCharge(input);
}

export async function cancelCharge(
  input: In<typeof db.cancelCharge>,
): Promise<MoneyResult> {
  return store()?.cancelCharge(input) ?? db.cancelCharge(input);
}

export async function setPaymentPlan(
  input: In<typeof db.setPaymentPlan>,
): Promise<MoneyResult<{ version: number }>> {
  return store()?.setPaymentPlan(input) ?? db.setPaymentPlan(input);
}

export async function publishSettleUp(
  input: In<typeof db.publishSettleUp>,
): Promise<MoneyResult<{ id: string; members: number }>> {
  return store()?.publishSettleUp(input) ?? db.publishSettleUp(input);
}

export async function requestRefund(
  input: In<typeof db.requestRefund>,
): Promise<MoneyResult<{ id: string }>> {
  return store()?.requestRefund(input) ?? db.requestRefund(input);
}

export async function decideRefund(
  input: In<typeof db.decideRefund>,
): Promise<MoneyResult> {
  return store()?.decideRefund(input) ?? db.decideRefund(input);
}
