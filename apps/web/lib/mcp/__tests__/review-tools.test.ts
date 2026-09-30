import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Claims and team budgets over MCP (#242): who may list which claims, whose
// bank details come back, and that every move and budget write goes to the
// database as the caller, which checks the rule again in its transaction.

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
  payClaim: vi.fn(async () => ({ ok: true })),
  reconcileClaim: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/db/team-budgets", () => ({
  getTeamBudget: vi.fn(async () => ({ amountCents: 400000 })),
  listBudgetTotals: vi.fn(async () => ({})),
  setTeamBudget: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/db/cycles", () => ({
  currentCycleNumber: vi.fn(async () => 2027),
}));

import { encrypt } from "@camp404/db/crypto";
import {
  decideClaim,
  listMyClaims,
  listReimbursementsForReview,
  payClaim,
  type ReimbursementReviewRow,
} from "@camp404/db/reimbursements";
import { setTeamBudget } from "@camp404/db/team-budgets";
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
  vi.mocked(listReimbursementsForReview).mockResolvedValue([]);
});

describe("list_reimbursements", () => {
  it("refuses a member who leads nothing", async () => {
    expect(await call("list_reimbursements", {}, MEMBER)).toEqual({
      error: "Only a captain or a team lead can review claims.",
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

  it("shows bank details to the Finance team only, and only with consent", async () => {
    vi.mocked(listReimbursementsForReview).mockResolvedValue([
      claim(),
      claim({ id: "no-consent", submitterAiDataConsent: false }),
    ]);
    for (const who of [CAPTAIN, FINANCE]) {
      const rows = (await call("list_reimbursements", {}, who)).data.rows;
      expect(rows[0]).toMatchObject({
        accountDetails: "FNB 123456",
        accountDetailsWithheld: false,
      });
      expect(rows[1]).toMatchObject({
        accountDetails: null,
        accountDetailsWithheld: true,
      });
      expect(rows[0].accountDetailsEncrypted).toBeUndefined();
    }
    // The lead who approves it never gets them.
    const lead = (await call("list_reimbursements", {}, LEAD)).data;
    expect(lead.rows[0]).toMatchObject({
      accountDetails: null,
      accountDetailsWithheld: true,
    });
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
    await call("mark_reimbursement_paid", { id: CLAIM }, FINANCE);
    expect(payClaim).toHaveBeenCalledWith({
      claimId: CLAIM,
      decision: "paid",
      actorId: FINANCE,
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

describe("set_team_budget", () => {
  it("passes a budget in cents to the database, with the amount it saw", async () => {
    const result = await call(
      "set_team_budget",
      { team: "kitchen", amount: "5000.50" },
      FINANCE,
    );
    expect(result.data).toEqual({
      team: "kitchen",
      cycle: 2027,
      amountCents: 500050,
    });
    expect(setTeamBudget).toHaveBeenCalledWith({
      team: "kitchen",
      cycle: 2027,
      amountCents: 500050,
      expectedCents: 400000,
      actorId: FINANCE,
    });
  });

  it("words the database's refusal for anyone but captains and Finance leads", async () => {
    vi.mocked(setTeamBudget).mockResolvedValueOnce({
      ok: false,
      error: "Only captains and Finance leads can set budgets.",
    });
    expect(
      await call("set_team_budget", { team: "kitchen", amount: "1" }, LEAD),
    ).toEqual({ error: "Only captains and Finance leads can set budgets." });
  });
});
