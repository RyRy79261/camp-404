import "server-only";

import {
  budgetsUnspentCents,
  campDayKey,
  campForecast,
  feeTotals,
  nearestScaleName,
  recommendedPledgeCents,
  type CampForecast,
  type FeeMember,
  type FeeTotals,
  type NextFeePayment,
} from "@camp404/core";
import * as db from "@camp404/db/camp-money";
import type {
  CampBalanceRow,
  CampBankDetailsRow,
  CampBillRow,
} from "@camp404/db/camp-money";
import type {
  CampBankDetails,
  FeeTiming,
  JoinSiteContent,
} from "@camp404/types";
import { listBudgetTotals } from "./claims";
import {
  getDuesYear,
  getMemberDues,
  listDuesAccounts,
  type DuesAccountRow,
  type DuesYear,
} from "./dues";
import { getFeeScale } from "./join-site";
import { ledgerCycle } from "./payments";
import type { PayGuideData } from "./pledge-view";
import { campMoneyTestStore } from "./test-store-camp-money";
import { twin } from "./twin";

// Camp fees (the camp fees sprint, owner 2026-10-27): the camp's own money,
// from the database or, under E2E, the test store's twin, and the three reads
// the screens draw from (Who owes what, Camp money, a member's own next
// payment). The writes re-check the actor themselves (MONEY_KEEPER), so a
// caller passes only who is acting. The sums are @camp404/core's (feeTotals,
// campForecast); lib/__tests__/camp-money-agreement.test.ts holds the two
// sides equal.

export type { CampBalanceRow, CampBankDetailsRow, CampBillRow };

const money = twin(db, campMoneyTestStore, [
  "getCampBankDetails",
  "saveCampBankDetails",
  "listCampBalances",
  "recordCampBalance",
  "listCampBills",
  "addCampBill",
  "updateCampBill",
  "markCampBillPaid",
  "removeCampBill",
]);

// --- Reads and writes, as they are -------------------------------------------

export const getCampBankDetails = money.getCampBankDetails;
export const saveCampBankDetails = money.saveCampBankDetails;
export const listCampBalances = money.listCampBalances;
export const recordCampBalance = money.recordCampBalance;
export const listCampBills = money.listCampBills;
export const addCampBill = money.addCampBill;
export const updateCampBill = money.updateCampBill;
export const markCampBillPaid = money.markCampBillPaid;
export const removeCampBill = money.removeCampBill;

/** A Who owes what row as the forecast and the totals read it. */
export function feeMemberOf(row: DuesAccountRow): FeeMember {
  return {
    userId: row.userId,
    name: row.name,
    participation: row.participation,
    subsidy: row.subsidy,
    totalCents: row.feeTotalCents,
    paidCents: row.balance.paidCents,
    payBy: row.payBy,
    plan: row.plan,
  };
}

// --- Who owes what (Finance) ---------------------------------------------------

export interface FeeOverviewRow extends DuesAccountRow {
  /** The scale's name nearest their pledge ("Ideal", or near it). */
  scaleName: { name: string; exact: boolean } | null;
}

export interface FeeOverview {
  /** The year's dues settings, with the Collecting fees switch. */
  year: DuesYear;
  /** The Join site's scale (names, amounts, the dollar rate). */
  scale: JoinSiteContent["fee"];
  /** The Recommended point, about US$450 at the typed rate. */
  recommendedCents: number;
  rows: FeeOverviewRow[];
  totals: FeeTotals;
}

/**
 * Every approved member's pledge, when they can pay, what they paid, what
 * they still owe and their next instalment, with the totals. For the Finance
 * team only: the caller gates the page (MONEY_KEEPER).
 */
export async function getFeeOverview(
  cycle: number,
  today: string,
): Promise<FeeOverview> {
  const [year, scale, accounts] = await Promise.all([
    getDuesYear(cycle),
    getFeeScale(cycle),
    listDuesAccounts(cycle, today),
  ]);
  return {
    year,
    scale,
    recommendedCents: recommendedPledgeCents(scale),
    rows: accounts.map((row) => ({
      ...row,
      scaleName:
        row.pledgeCents === null
          ? null
          : nearestScaleName(row.pledgeCents, scale),
    })),
    totals: feeTotals(accounts.map(feeMemberOf), cycle, today),
  };
}

// --- Camp money (Finance) --------------------------------------------------------

export interface CampMoney {
  /** Every bank balance typed in, the latest first. */
  balances: CampBalanceRow[];
  bills: CampBillRow[];
  forecast: CampForecast;
}

/**
 * The Camp money tab: the bank balances, the bills and the forecast (the
 * latest balance, plus fees still to come, less bills still due and the
 * teams' budgets not spent). For the Finance team only: the caller gates it.
 */
export async function getCampMoney(
  cycle: number,
  today: string,
): Promise<CampMoney> {
  const [balances, bills, accounts, budgets] = await Promise.all([
    listCampBalances(),
    listCampBills(),
    listDuesAccounts(cycle, today),
    listBudgetTotals(cycle),
  ]);
  const latest = balances[0];
  return {
    balances,
    bills,
    forecast: campForecast({
      balance: latest
        ? { amountCents: latest.amountCents, asOf: latest.asOf }
        : null,
      members: accounts.map(feeMemberOf),
      bills,
      budgetsUnspentCents: budgetsUnspentCents(Object.values(budgets)),
      burnYear: cycle,
    }),
  };
}

// --- A member's own next payment --------------------------------------------------

export interface MyFeePayment {
  /** The year's Collecting fees switch. */
  collecting: boolean;
  /** Their payment reference, like C404-M017. */
  refCode: string | null;
  feeTotalCents: number;
  paidCents: number;
  owingCents: number;
  payBy: FeeTiming | null;
  subsidy: boolean;
  next: NextFeePayment;
  /** Where to pay: South Africa and abroad. */
  bank: CampBankDetails;
  /**
   * Whether the pay guide shows: collecting is on, they owe money and did not
   * ask for a subsidy. The blocking layer and the held desktop never show it
   * (the caller's rule).
   */
  showPayGuide: boolean;
}

/** The signed-in member's own next fee payment, or null with no account. */
export async function getMyFeePayment(
  userId: string,
  cycle: number,
  today: string,
): Promise<MyFeePayment | null> {
  const [dues, year, bank] = await Promise.all([
    getMemberDues(userId, cycle, { forFinance: false, today }),
    getDuesYear(cycle),
    getCampBankDetails(),
  ]);
  if (!dues) return null;
  return {
    collecting: year.collectingFees,
    refCode: dues.refCode,
    feeTotalCents: dues.feeTotalCents,
    paidCents: dues.balance.paidCents,
    owingCents: dues.feeOwingCents,
    payBy: dues.payBy,
    subsidy: dues.subsidy,
    next: dues.feeNext,
    bank: bank.details,
    showPayGuide:
      year.collectingFees && dues.feeOwingCents > 0 && !dues.subsidy,
  };
}

/**
 * The pay guide's figures for the signed-in member, or null when it does not
 * show: the year is not collecting fees, they owe nothing, or they asked for
 * a subsidy. The console layout reads it for a full desktop only (never the
 * held one); the caller gates nothing else, and the bank details are the
 * camp's own.
 */
export async function getMyPayGuide(
  userId: string,
): Promise<PayGuideData | null> {
  const cycle = await ledgerCycle();
  // Most of the year nothing is collected: one small read, then stop.
  if (!(await getDuesYear(cycle)).collectingFees) return null;
  const mine = await getMyFeePayment(userId, cycle, campDayKey(new Date()));
  if (!mine?.showPayGuide) return null;
  return {
    refCode: mine.refCode,
    feeTotalCents: mine.feeTotalCents,
    paidCents: mine.paidCents,
    next: mine.next,
    bank: mine.bank,
  };
}
