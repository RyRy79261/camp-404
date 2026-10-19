import "server-only";

import {
  budgetAmountProblem,
  budgetTotals,
  canApproveClaim,
  canManageMoney,
  claimInputProblem,
  claimMayMove,
  claimMoveStamp,
  type BudgetTotals,
} from "@camp404/core";
import type { DecryptedField } from "@camp404/db/crypto";
import {
  CLAIM_CHANGED,
  CLAIM_NEEDS_A_REASON,
  CLAIM_NO_SUCH_MEMBER,
  CLAIM_NOT_FINANCE,
  CLAIM_NOT_FOUND,
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
import { BUDGET_CHANGED, BUDGET_NOT_FINANCE } from "@camp404/db/team-budgets";
import {
  Team as TeamKeys,
  type ClaimAccountType,
  type ClaimStatus,
  type Team,
} from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/reimbursements and team-budgets (#242),
// for E2E_TEST_MODE. The same rules, sentences and results over the store's
// own rows (the input checks, the move and its stamp are the same functions,
// in @camp404/core; the rest is held equal by
// lib/__tests__/claims-agreement.test.ts): a lead of the claim's team or a captain says yes (canApproveClaim,
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

/**
 * Account erasure's part (@camp404/db/account sanitiseAccount): a claim stays
 * for the books, without its bank details, its note or its receipt files.
 */
export function eraseClaimsOf(userId: string): void {
  for (const claim of state().claims) {
    if (claim.submitterId !== userId) continue;
    claim.accountDetails = "";
    claim.decisionNote = null;
    claim.files = [];
  }
}

const budgetKey = (team: Team, cycle: number) => `${team}:${cycle}`;

function nameOf(userId: string | null): string | null {
  return userId ? (testStore.findUserById(userId)?.displayName ?? null) : null;
}

/** The actor's rank and led teams, read now (lockActor's twin). */
function reachOf(actorId: string): { rank: string; led: readonly string[] } {
  const actor = testStore.actorInStore(actorId);
  if (!actor) return { rank: "none", led: [] };
  return { rank: actor.rank, led: actor.ledTeams };
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
  if (!claimMayMove(c.status, from, to)) return CLAIM_CHANGED;
  Object.assign(
    c,
    claimMoveStamp({ from, to, actorId, note, now: new Date() }),
  );
  c.status = to;
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
    const problem = claimInputProblem(input);
    if (problem) return { ok: false, error: problem };
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
    if (input.decision === "rejected" && !input.note?.trim()) {
      return { ok: false, error: CLAIM_NEEDS_A_REASON };
    }
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
    const problem = budgetAmountProblem(input.amountCents);
    if (problem) return { ok: false, error: problem };
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
