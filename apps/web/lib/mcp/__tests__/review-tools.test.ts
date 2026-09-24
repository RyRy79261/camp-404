import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Reimbursement review and team budget writes over MCP: who may see and move
// which claim, whose account details come back, and who may set a budget.

process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

const CAPTAIN = "00000000-0000-4000-8000-0000000000aa";
const LEAD = "00000000-0000-4000-8000-0000000000bb";
const MEMBER = "00000000-0000-4000-8000-0000000000cc";
const CLAIM = "00000000-0000-4000-8000-0000000000dd";

const callers: Record<string, { rank: "captain" | "member"; leads: string[] }> =
  {
    [CAPTAIN]: { rank: "captain", leads: [] },
    [LEAD]: { rank: "member", leads: ["kitchen"] },
    [MEMBER]: { rank: "member", leads: [] },
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
  getReimbursementForReview: vi.fn(async () => null),
  moveReimbursement: vi.fn(async () => ({ ok: true })),
  submitReimbursement: vi.fn(async () => ({
    id: CLAIM,
    status: "submitted",
  })),
}));
vi.mock("@camp404/db/team-budgets", () => ({
  getTeamBudget: vi.fn(async () => null),
  listTeamBudgets: vi.fn(async () => []),
  setTeamBudget: vi.fn(async (input: { team: string }) => ({
    team: input.team,
    cycle: 2027,
  })),
}));

import { encrypt } from "@camp404/db/crypto";
import {
  getReimbursementForReview,
  listReimbursementsForReview,
  moveReimbursement,
  submitReimbursement,
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
    submitterId: MEMBER,
    submitterName: "Member",
    submitterAiDataConsent: true,
    team: "kitchen",
    amount: "120.50",
    currency: "ZAR",
    accountType: "sa",
    accountDetailsEncrypted: encrypt("FNB 123456"),
    description: "Gas",
    receiptBlobUrl: null,
    itemPhotoBlobUrl: null,
    voiceMemoBlobUrl: null,
    status: "submitted",
    approverId: null,
    approvedAt: null,
    paidAt: null,
    reconciledAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getReimbursementForReview).mockResolvedValue(null);
  vi.mocked(listReimbursementsForReview).mockResolvedValue([]);
});

describe("list_reimbursements", () => {
  it("refuses a member who leads nothing", async () => {
    expect(await call("list_reimbursements", {}, MEMBER)).toEqual({
      error: "Only a captain or a team lead can review reimbursements.",
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

  it("shows account details to a captain only, and only with consent", async () => {
    vi.mocked(listReimbursementsForReview).mockResolvedValue([
      claim(),
      claim({ id: "no-consent", submitterAiDataConsent: false }),
    ]);
    const captain = (await call("list_reimbursements", {}, CAPTAIN)).data;
    expect(captain.rows[0]).toMatchObject({
      accountDetails: "FNB 123456",
      accountDetailsWithheld: false,
    });
    expect(captain.rows[1]).toMatchObject({
      accountDetails: null,
      accountDetailsWithheld: true,
    });
    expect(captain.rows[0].accountDetailsEncrypted).toBeUndefined();

    const lead = (await call("list_reimbursements", {}, LEAD)).data;
    expect(lead.rows[0]).toMatchObject({
      accountDetails: null,
      accountDetailsWithheld: true,
    });
  });
});

describe("moving a claim", () => {
  it("lets the lead of the claim's team approve it, as the actor", async () => {
    vi.mocked(getReimbursementForReview).mockResolvedValue(claim());
    expect(
      (await call("approve_reimbursement", { id: CLAIM }, LEAD)).data,
    ).toEqual({ id: CLAIM, status: "approved" });
    expect(moveReimbursement).toHaveBeenCalledWith({
      id: CLAIM,
      from: "submitted",
      to: "approved",
      actorId: LEAD,
    });
  });

  it("refuses a lead of another team, a general claim, and paying", async () => {
    vi.mocked(getReimbursementForReview).mockResolvedValue(
      claim({ team: "structures" }),
    );
    expect(await call("reject_reimbursement", { id: CLAIM }, LEAD)).toEqual({
      error: "Only a captain or the lead of this claim's team can decide it.",
    });
    vi.mocked(getReimbursementForReview).mockResolvedValue(
      claim({ team: null }),
    );
    expect(
      await call("approve_reimbursement", { id: CLAIM }, LEAD),
    ).toMatchObject({ error: expect.stringContaining("captain") });
    vi.mocked(getReimbursementForReview).mockResolvedValue(
      claim({ status: "approved" }),
    );
    expect(await call("mark_reimbursement_paid", { id: CLAIM }, LEAD)).toEqual({
      error: "Only a captain can do this.",
    });
    expect(moveReimbursement).not.toHaveBeenCalled();
  });

  it("refuses your own claim, a claim in the wrong status, and a lost race", async () => {
    vi.mocked(getReimbursementForReview).mockResolvedValue(
      claim({ submitterId: CAPTAIN }),
    );
    expect(await call("approve_reimbursement", { id: CLAIM }, CAPTAIN)).toEqual(
      {
        error: "Someone else has to review your own claim.",
      },
    );
    vi.mocked(getReimbursementForReview).mockResolvedValue(
      claim({ status: "paid" }),
    );
    expect(await call("approve_reimbursement", { id: CLAIM }, CAPTAIN)).toEqual(
      {
        error: "This claim is paid, so it can't be marked approved.",
      },
    );
    vi.mocked(getReimbursementForReview).mockResolvedValue(claim());
    vi.mocked(moveReimbursement).mockResolvedValueOnce({
      ok: false,
      reason: "stale",
    });
    expect(await call("approve_reimbursement", { id: CLAIM }, CAPTAIN)).toEqual(
      {
        error: "Someone else changed this claim just now. Read it again.",
      },
    );
  });

  it("says when there is no such claim", async () => {
    expect(
      await call("mark_reimbursement_reconciled", { id: CLAIM }, CAPTAIN),
    ).toEqual({
      error: "No reimbursement with that id.",
    });
  });
});

describe("submit_reimbursement", () => {
  const CLAIM_ARGS = {
    team: "kitchen",
    amount: "12.34",
    currency: "EUR",
    accountType: "international",
    accountDetails: "IBAN 0000",
    description: "Tape",
    receiptBlobUrl: "https://example.com/receipt.jpg",
  };

  it("lets any member lodge a claim, with the account encrypted", async () => {
    expect(await call("submit_reimbursement", CLAIM_ARGS, MEMBER)).toEqual({
      data: { id: CLAIM, status: "submitted" },
    });
    const input = vi.mocked(submitReimbursement).mock.calls[0]![0];
    expect(input).toMatchObject({
      submitterId: MEMBER,
      team: "kitchen",
      amount: "12.34",
      currency: "EUR",
    });
    expect(input.accountDetailsEncrypted).not.toContain("IBAN 0000");
  });

  it("refuses a currency the camp does not take, and writes nothing", async () => {
    for (const currency of ["GBP", "eur"]) {
      expect(
        await call("submit_reimbursement", { ...CLAIM_ARGS, currency }, MEMBER),
      ).toEqual({ error: "Currency must be ZAR, USD or EUR." });
    }
    expect(submitReimbursement).not.toHaveBeenCalled();
  });
});

describe("set_team_budget", () => {
  it("lets a lead set their team's budget and nobody else's", async () => {
    const result = await call(
      "set_team_budget",
      { team: "kitchen", assignedAmount: "5000" },
      LEAD,
    );
    expect(result.data).toEqual({ team: "kitchen", cycle: 2027 });
    expect(setTeamBudget).toHaveBeenCalledWith({
      team: "kitchen",
      change: { assignedAmount: "5000" },
      actorId: LEAD,
    });
    expect(
      await call("set_team_budget", { team: "structures", notes: "x" }, LEAD),
    ).toEqual({
      error: "Only a captain or the lead of this team can set its budget.",
    });
  });

  it("refuses a currency the camp does not take, and sets nothing", async () => {
    for (const currency of ["GBP", "usd"]) {
      expect(
        await call("set_team_budget", { team: "kitchen", currency }, CAPTAIN),
      ).toEqual({ error: "Currency must be ZAR, USD or EUR." });
    }
    expect(setTeamBudget).not.toHaveBeenCalled();
    await call(
      "set_team_budget",
      { team: "kitchen", currency: "USD" },
      CAPTAIN,
    );
    expect(setTeamBudget).toHaveBeenCalledWith({
      team: "kitchen",
      change: { currency: "USD" },
      actorId: CAPTAIN,
    });
  });

  it("needs at least one field", async () => {
    expect(await call("set_team_budget", { team: "kitchen" }, CAPTAIN)).toEqual(
      {
        error: "Say at least one field to set.",
      },
    );
  });
});
