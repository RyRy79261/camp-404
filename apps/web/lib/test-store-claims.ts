import "server-only";

import {
  budgetTotals,
  canApproveClaim,
  canManageMoney,
  CLAIM_MOVES,
  type BudgetTotals,
} from "@camp404/core";
import type { DecryptedField } from "@camp404/db/crypto";
import { reachRank } from "@camp404/db/power";
import {
  CLAIM_BAD_AMOUNT,
  CLAIM_CHANGED,
  CLAIM_NEEDS_A_RECEIPT,
  CLAIM_NO_SUCH_MEMBER,
  CLAIM_NOT_FINANCE,
  CLAIM_NOT_FOUND,
  CLAIM_TOO_MANY_FILES,
  NOT_THE_CLAIMS_TEAM,
  OWN_CLAIM_DECISION,
  OWN_CLAIM_PAYMENT,
  type ClaimFileRef,
  type ClaimForApproval,
  type ClaimForFinance,
  type ClaimResult,
  type MyClaim,
  type SubmitClaimInput,
} from "@camp404/db/reimbursements";
import {
  BUDGET_BAD_AMOUNT,
  BUDGET_CHANGED,
  BUDGET_NOT_FINANCE,
} from "@camp404/db/team-budgets";
import {
  CLAIM_MAX_FILES,
  Team as TeamKeys,
  type ClaimAccountType,
  type ClaimStatus,
  type Team,
} from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/reimbursements and team-budgets (#242),
// for E2E_TEST_MODE. The same rules, sentences and results over the store's
// own rows: a lead of the claim's team or a captain says yes (canApproveClaim,
// with the store's lead flags read at the moment of the write), the Finance
// team pays (canManageMoney), nobody decides or pays their own claim, and each
// move is a compare-and-set on the status the actor saw. The store keeps no
// audit log and is one synchronous process, so there is nothing to lock. It
// never encrypts: the bank details are kept as typed.

interface FileRow extends ClaimFileRef {
  pathname: string;
}

interface ClaimRow {
  id: string;
  submitterId: string;
  cycle: number;
  team: Team;
  description: string;
  amountCents: number;
  spentOn: string;
  accountType: ClaimAccountType;
  accountDetails: string;
  status: ClaimStatus;
  decisionNote: string | null;
  approverId: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  files: FileRow[];
}

interface ClaimsState {
  claims: ClaimRow[];
  budgets: Map<string, number | null>;
  serial: number;
}

const KEY = "__camp404ClaimsTestStore__";

function state(): ClaimsState {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= {
    claims: [],
    budgets: new Map(),
    serial: 0,
  } satisfies ClaimsState;
  return g[KEY] as ClaimsState;
}

/** Clear every claim and budget (testStore.reset calls this). */
export function resetClaimsStore(): void {
  const s = state();
  s.claims.length = 0;
  s.budgets.clear();
  s.serial = 0;
}

const budgetKey = (team: Team, cycle: number) => `${team}:${cycle}`;

function nameOf(userId: string | null): string | null {
  return userId ? (testStore.findUserById(userId)?.displayName ?? null) : null;
}

/** The actor's rank and led teams, read now (lockSenderReach's twin). */
function reachOf(actorId: string): { rank: string; led: readonly string[] } {
  if (!testStore.findUserById(actorId)) return { rank: "none", led: [] };
  const reach = testStore.senderReach(actorId);
  return { rank: reachRank(reach), led: reach ?? [] };
}

function isMoneyKeeper(actorId: string): boolean {
  const { rank, led } = reachOf(actorId);
  return canManageMoney(rank, led);
}

function forApproval(c: ClaimRow): ClaimForApproval {
  return {
    id: c.id,
    team: c.team,
    submitterId: c.submitterId,
    submitterName: nameOf(c.submitterId),
    description: c.description,
    amountCents: c.amountCents,
    spentOn: c.spentOn,
    createdAt: c.createdAt,
  };
}

function refs(c: ClaimRow): ClaimFileRef[] {
  return c.files.map(({ id, contentType }) => ({ id, contentType }));
}

function move(
  c: ClaimRow | undefined,
  from: ClaimStatus,
  to: ClaimStatus,
  actorId: string,
  note: string | null,
): string | null {
  if (!c) return CLAIM_NOT_FOUND;
  if (c.status !== from || !CLAIM_MOVES[from].includes(to))
    return CLAIM_CHANGED;
  const now = new Date();
  c.status = to;
  if (from === "submitted") {
    c.approverId = actorId;
    c.approvedAt = now;
    c.decisionNote = note;
  } else if (to === "paid") {
    c.paidAt = now;
  } else if (to === "rejected") {
    c.decisionNote = note;
  }
  return null;
}

export const claimsTestStore = {
  listMyClaims(userId: string): MyClaim[] {
    return state()
      .claims.filter((c) => c.submitterId === userId)
      .reverse()
      .map((c) => ({
        id: c.id,
        cycle: c.cycle,
        team: c.team,
        description: c.description,
        amountCents: c.amountCents,
        spentOn: c.spentOn,
        status: c.status,
        decisionNote: c.decisionNote,
        createdAt: c.createdAt,
        approvedAt: c.approvedAt,
        paidAt: c.paidAt,
        files: refs(c),
      }));
  },

  listClaimsForApproval(input: {
    cycle: number;
    teams: readonly Team[] | "all";
  }): ClaimForApproval[] {
    if (input.teams !== "all" && input.teams.length === 0) return [];
    return state()
      .claims.filter(
        (c) =>
          c.cycle === input.cycle &&
          c.status === "submitted" &&
          (input.teams === "all" || input.teams.includes(c.team)),
      )
      .map(forApproval);
  },

  listClaimsForFinance(cycle: number): ClaimForFinance[] {
    return state()
      .claims.filter((c) => c.cycle === cycle)
      .reverse()
      .map((c) => ({
        ...forApproval(c),
        status: c.status,
        accountType: c.accountType,
        decisionNote: c.decisionNote,
        approverName: nameOf(c.approverId),
        approvedAt: c.approvedAt,
        paidAt: c.paidAt,
        files: refs(c),
      }));
  },

  listBudgetTotals(cycle: number): Record<Team, BudgetTotals> {
    const s = state();
    return Object.fromEntries(
      TeamKeys.options.map((team) => [
        team,
        budgetTotals(
          s.budgets.get(budgetKey(team, cycle)) ?? null,
          s.claims.filter((c) => c.cycle === cycle && c.team === team),
        ),
      ]),
    ) as Record<Team, BudgetTotals>;
  },

  getClaimFile(fileId: string): {
    pathname: string;
    contentType: string;
    claimId: string;
    submitterId: string | null;
    team: Team | null;
  } | null {
    for (const c of state().claims) {
      const file = c.files.find((f) => f.id === fileId);
      if (file) {
        return {
          pathname: file.pathname,
          contentType: file.contentType,
          claimId: c.id,
          submitterId: c.submitterId,
          team: c.team,
        };
      }
    }
    return null;
  },

  readClaimAccount(claimId: string): {
    submitterId: string | null;
    team: Team | null;
    accountType: ClaimAccountType;
    details: DecryptedField;
  } | null {
    const c = state().claims.find((row) => row.id === claimId);
    if (!c) return null;
    return {
      submitterId: c.submitterId,
      team: c.team,
      accountType: c.accountType,
      details: { state: "ok", value: c.accountDetails },
    };
  },

  submitClaim(
    input: Omit<SubmitClaimInput, "accountDetailsEncrypted"> & {
      accountDetails: string;
    },
  ): ClaimResult<{ id: string }> {
    if (input.files.length === 0)
      return { ok: false, error: CLAIM_NEEDS_A_RECEIPT };
    if (input.files.length > CLAIM_MAX_FILES) {
      return { ok: false, error: CLAIM_TOO_MANY_FILES };
    }
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      return { ok: false, error: CLAIM_BAD_AMOUNT };
    }
    if (!testStore.findUserById(input.submitterId)) {
      return { ok: false, error: CLAIM_NO_SUCH_MEMBER };
    }
    const s = state();
    const id = `claim-${++s.serial}`;
    s.claims.push({
      id,
      submitterId: input.submitterId,
      cycle: input.cycle,
      team: input.team,
      description: input.description,
      amountCents: input.amountCents,
      spentOn: input.spentOn,
      accountType: input.accountType,
      accountDetails: input.accountDetails,
      status: "submitted",
      decisionNote: null,
      approverId: null,
      approvedAt: null,
      paidAt: null,
      createdAt: new Date(),
      files: input.files.map((file, i) => ({
        id: `${id}-file-${i + 1}`,
        pathname: file.pathname,
        contentType: file.contentType,
      })),
    });
    return { ok: true, id };
  },

  decideClaim(input: {
    claimId: string;
    decision: "approved" | "rejected";
    note?: string | null;
    actorId: string;
  }): ClaimResult {
    const { rank, led } = reachOf(input.actorId);
    const c = state().claims.find((row) => row.id === input.claimId);
    if (!c) return { ok: false, error: CLAIM_NOT_FOUND };
    if (!canApproveClaim(rank, led, c.team)) {
      return { ok: false, error: NOT_THE_CLAIMS_TEAM };
    }
    if (c.submitterId === input.actorId) {
      return { ok: false, error: OWN_CLAIM_DECISION };
    }
    const error = move(
      c,
      "submitted",
      input.decision,
      input.actorId,
      input.decision === "rejected" ? (input.note ?? null) : null,
    );
    return error ? { ok: false, error } : { ok: true };
  },

  payClaim(input: {
    claimId: string;
    decision: "paid" | "rejected";
    note?: string | null;
    actorId: string;
  }): ClaimResult {
    if (!isMoneyKeeper(input.actorId))
      return { ok: false, error: CLAIM_NOT_FINANCE };
    const c = state().claims.find((row) => row.id === input.claimId);
    if (!c) return { ok: false, error: CLAIM_NOT_FOUND };
    if (c.submitterId === input.actorId) {
      return { ok: false, error: OWN_CLAIM_PAYMENT };
    }
    const error = move(
      c,
      "approved",
      input.decision,
      input.actorId,
      input.decision === "rejected" ? (input.note ?? null) : null,
    );
    return error ? { ok: false, error } : { ok: true };
  },

  setTeamBudget(input: {
    team: Team;
    cycle: number;
    amountCents: number | null;
    expectedCents: number | null;
    actorId: string;
  }): ClaimResult {
    if (
      input.amountCents !== null &&
      (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0)
    ) {
      return { ok: false, error: BUDGET_BAD_AMOUNT };
    }
    if (!isMoneyKeeper(input.actorId)) {
      return { ok: false, error: BUDGET_NOT_FINANCE };
    }
    const s = state();
    const key = budgetKey(input.team, input.cycle);
    const current = s.budgets.get(key) ?? null;
    if (current !== input.expectedCents)
      return { ok: false, error: BUDGET_CHANGED };
    s.budgets.set(key, input.amountCents);
    return { ok: true };
  },
};
