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
import { twin } from "./twin";

// Dues (#240), from the database or, under E2E, the test store's twin. The
// rules both sides apply (the pledge, the fee's standard, the settle-up split,
// the refund amount) are one set of functions in @camp404/core/dues;
// lib/__tests__/dues-agreement.test.ts holds the rest equal. Every Finance
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

const dues = twin(db, duesTestStore, [
  "getDuesYear",
  "listFeeTiers",
  "getMemberDues",
  "listDuesAccounts",
  "settleUpCandidates",
  "getPaymentProof",
  "statementContext",
  "saveDuesYear",
  "addFeeTier",
  "editFeeTier",
  "archiveFeeTier",
  "savePledge",
  "setFee",
  "addCharge",
  "cancelCharge",
  "setPaymentPlan",
  "publishSettleUp",
  "requestRefund",
  "decideRefund",
]);

// --- Reads --------------------------------------------------------------------

export const getDuesYear = dues.getDuesYear;
export const listFeeTiers = dues.listFeeTiers;
export const getMemberDues = dues.getMemberDues;
export const listDuesAccounts = dues.listDuesAccounts;
export const settleUpCandidates = dues.settleUpCandidates;
export const getPaymentProof = dues.getPaymentProof;
export const statementContext = dues.statementContext;

// --- Writes -------------------------------------------------------------------

export const saveDuesYear = dues.saveDuesYear;
export const addFeeTier = dues.addFeeTier;
export const editFeeTier = dues.editFeeTier;
export const archiveFeeTier = dues.archiveFeeTier;
export const savePledge = dues.savePledge;
export const setFee = dues.setFee;
export const addCharge = dues.addCharge;
export const cancelCharge = dues.cancelCharge;
export const setPaymentPlan = dues.setPaymentPlan;
export const publishSettleUp = dues.publishSettleUp;
export const requestRefund = dues.requestRefund;
export const decideRefund = dues.decideRefund;
