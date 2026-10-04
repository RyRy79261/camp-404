import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Claims and team budgets over MCP (#242): who may list which claims, that a
// list never carries bank details, that one claim's bank details come back
// only on the Finance tools' rule with the website's audit row, that every
// decision goes to the database as the caller (which checks the rule again in
// its transaction), and that moving money is not a tool at all.

process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

const CAPTAIN = "00000000-0000-4000-8000-0000000000aa";
const LEAD = "00000000-0000-4000-8000-0000000000bb";
const MEMBER = "00000000-0000-4000-8000-0000000000cc";
const FINANCE = "00000000-0000-4000-8000-0000000000ee";
const CLAIM = "00000000-0000-4000-8000-0000000000dd";

const callers: Record<string, { rank: "captain" | "member"; leads: string[] }> =
  {
    [CAPTAIN]: { rank: "captain", leads: [] },
    [LEAD]: { rank: "member", leads: ["kitchen"] },
    [MEMBER]: { rank: "member", leads: [] },
    [FINANCE]: { rank: "member", leads: ["finance"] },
  };

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(async (id: string) => ({
    user: { id, rank: callers[id]!.rank, aiDataConsent: false },
    teamMemberships: callers[id]!.leads.map((team) => ({ team, isLead: true })),
    driverIntent: false,
  })),
  appendMcpAuditLog: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/reimbursements", () => ({
  listReimbursementsForReview: vi.fn(async () => []),
  listMyClaims: vi.fn(async () => []),
  decideClaim: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/db/team-budgets", () => ({
  listBudgetTotals: vi.fn(async () => ({})),
}));
vi.mock("@/lib/claims", () => ({ readClaimAccount: vi.fn(async () => null) }));
const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => afterTasks.push(task),
}));
vi.mock("@camp404/db/audit", () => ({ appendAuditEvent: vi.fn() }));
vi.mock("@camp404/db/cycles", () => ({
  currentCycleNumber: vi.fn(async () => 2027),
}));

import { appendAuditEvent } from "@camp404/db/audit";
import { encrypt } from "@camp404/db/crypto";
import {
  decideClaim,
  listMyClaims,
  listReimbursementsForReview,
  type ReimbursementReviewRow,
} from "@camp404/db/reimbursements";
import { readClaimAccount } from "@/lib/claims";
import { registerReimbursementTools } from "../tools/reimbursements";
import { registerTeamTools } from "../tools/teams";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
const server = {
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer;
registerReimbursementTools(server);
registerTeamTools(server);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

function claim(
  overrides: Partial<ReimbursementReviewRow> = {},
): ReimbursementReviewRow {
  return {
    id: CLAIM,
    cycle: 2027,
    submitterId: MEMBER,
    submitterName: "Member",
    submitterAiDataConsent: true,
    team: "kitchen",
    amountCents: 1234,
    spentOn: "2027-03-02",
    accountType: "sa",
    accountDetailsEncrypted: encrypt("FNB 123456"),
    description: "Gas",
    status: "submitted",
    decisionNote: null,
    approverId: null,
    approvedAt: null,
    paidAt: null,
    reconciledAt: null,
    receiptCount: 1,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  vi.mocked(listReimbursementsForReview).mockResolvedValue([]);
});

/** Run what the tool left for after the response, as next/server would. */
async function flushAfter() {
  for (const task of afterTasks.splice(0)) await task();
}

describe("list_reimbursements", () => {
  it("refuses a member who leads nothing", async () => {
    expect(await call("list_reimbursements", {}, MEMBER)).toEqual({
      error:
        "Only a team lead or a captain can do this. Leading any team this year counts.",
    });
  });

  it("limits a lead to the teams they lead, and never to general claims", async () => {
    await call("list_reimbursements", {}, LEAD);
    expect(listReimbursementsForReview).toHaveBeenLastCalledWith({
      status: undefined,
      teams: ["kitchen"],
      generalOnly: false,
    });
    expect(
      await call("list_reimbursements", { team: "structures" }, LEAD),
    ).toEqual({ error: "You don't lead that team this year." });
    expect(
      await call("list_reimbursements", { team: "general" }, LEAD),
    ).toEqual({ error: "Claims under no team are a captain's to review." });
  });

  it("gives a Finance lead every team's claims", async () => {
    await call("list_reimbursements", {}, FINANCE);
    expect(listReimbursementsForReview).toHaveBeenLastCalledWith({
      status: undefined,
      teams: undefined,
      generalOnly: false,
    });
  });

  it("never puts bank details in a list, for anyone", async () => {
    vi.mocked(listReimbursementsForReview).mockResolvedValue([claim()]);
    for (const who of [CAPTAIN, FINANCE, LEAD]) {
      const [row] = (await call("list_reimbursements", {}, who)).data.rows;
      expect(row).not.toHaveProperty("accountDetails");
      expect(row).not.toHaveProperty("accountDetailsEncrypted");
      expect(JSON.stringify(row)).not.toContain("FNB");
    }
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});

describe("get_claim_bank_details", () => {
  const account = {
    submitterId: MEMBER,
    team: "kitchen" as const,
    accountType: "sa" as const,
    details: { state: "ok" as const, value: "FNB 123456" },
  };

  it("gives the Finance team one claim's details, with the website's audit row after the response", async () => {
    vi.mocked(readClaimAccount).mockResolvedValue(account);
    vi.mocked(listReimbursementsForReview).mockResolvedValue([claim()]);
    const { data } = await call(
      "get_claim_bank_details",
      { claimId: CLAIM },
      FINANCE,
    );
    expect(data).toEqual({
      claimId: CLAIM,
      accountType: "sa",
      details: "FNB 123456",
    });
    expect(appendAuditEvent).not.toHaveBeenCalled();
    await flushAfter();
    expect(appendAuditEvent).toHaveBeenCalledTimes(1);
    expect(appendAuditEvent).toHaveBeenCalledWith({
      actorId: FINANCE,
      action: "reimbursement.account_viewed",
      target: MEMBER,
      metadata: { reimbursementId: CLAIM, team: "kitchen", via: "mcp" },
    });
  });

  it("records nothing when the details can't be shown", async () => {
    vi.mocked(readClaimAccount).mockResolvedValue({
      ...account,
      details: { state: "unreadable" as const },
    } as never);
    vi.mocked(listReimbursementsForReview).mockResolvedValue([claim()]);
    const result = await call(
      "get_claim_bank_details",
      { claimId: CLAIM },
      FINANCE,
    );
    expect(result.error).toMatch(/can't be read/);
    await flushAfter();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses anyone but captains and Finance leads, reading nothing", async () => {
    for (const who of [LEAD, MEMBER]) {
      expect(
        await call("get_claim_bank_details", { claimId: CLAIM }, who),
      ).toEqual({ error: "Only a captain or a Finance lead can do this." });
    }
    expect(readClaimAccount).not.toHaveBeenCalled();
  });

  it("sends the Finance team to the website when the member has not allowed it, and records nothing", async () => {
    vi.mocked(readClaimAccount).mockResolvedValue(account);
    vi.mocked(listReimbursementsForReview).mockResolvedValue([
      claim({ submitterAiDataConsent: false }),
    ]);
    const result = await call(
      "get_claim_bank_details",
      { claimId: CLAIM },
      CAPTAIN,
    );
    expect(result.error).toMatch(/hasn't allowed/);
    expect(result.error).toMatch(/\/captains\/payments\/claims$/);
    await flushAfter();
    expect(appendAuditEvent).not.toHaveBeenCalled();
  });
});

describe("moving a claim", () => {
  it("passes the move to the database as the caller, which checks it again", async () => {
    expect(
      (await call("approve_reimbursement", { id: CLAIM }, LEAD)).data,
    ).toEqual({ id: CLAIM, status: "approved" });
    expect(decideClaim).toHaveBeenCalledWith({
      claimId: CLAIM,
      decision: "approved",
      actorId: LEAD,
    });
  });

  it("words the database's refusal", async () => {
    vi.mocked(decideClaim).mockResolvedValueOnce({
      ok: false,
      error: "Only a lead of this claim's team, or a captain, can decide it.",
    });
    expect(await call("reject_reimbursement", { id: CLAIM }, LEAD)).toEqual({
      error: "Only a lead of this claim's team, or a captain, can decide it.",
    });
  });
});

describe("list_my_reimbursements", () => {
  it("lists only the caller's own claims, with a count of receipts and no file addresses", async () => {
    vi.mocked(listMyClaims).mockResolvedValue([
      {
        id: CLAIM,
        cycle: 2027,
        team: "kitchen",
        description: "Gas",
        amountCents: 1234,
        spentOn: "2027-03-02",
        status: "submitted",
        decisionNote: null,
        createdAt: new Date("2026-09-01T00:00:00Z"),
        approvedAt: null,
        paidAt: null,
        files: [{ id: "f1", contentType: "application/pdf" }],
      },
    ]);
    const { data } = await call("list_my_reimbursements", {}, MEMBER);
    expect(listMyClaims).toHaveBeenCalledWith(MEMBER);
    expect(data.rows[0]).toMatchObject({ id: CLAIM, receiptCount: 1 });
    expect(data.rows[0].files).toBeUndefined();
  });

  it("has no tool to make a claim: a claim needs its receipts, in the app", () => {
    expect(tools.has("submit_reimbursement")).toBe(false);
  });
});

describe("moving money is website-only", () => {
  it("has no tool to pay, reconcile or budget", () => {
    for (const name of [
      "mark_reimbursement_paid",
      "mark_reimbursement_reconciled",
      "set_team_budget",
    ]) {
      expect(tools.has(name)).toBe(false);
    }
  });
});
