import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The captain-tier admin tools: each refuses a non-captain before any write,
// calls the app's own db helper with the caller as the actor, and turns a
// refusal into a sentence rather than "Internal error".

const CAPTAIN = "00000000-0000-4000-8000-0000000000aa";
const MEMBER = "00000000-0000-4000-8000-0000000000bb";
const SUBJECT = "00000000-0000-4000-8000-0000000000cc";

const rank = { current: "captain" as "captain" | "member" };
const memberExists = { current: true };

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(async (id: string) => ({
    user: { id, rank: rank.current, aiDataConsent: false },
    teamMemberships: [],
    driverIntent: false,
  })),
  appendMcpAuditLog: vi.fn(async () => {}),
}));
vi.mock("@camp404/db", () => ({
  createHttpDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (memberExists.current ? [{ id: SUBJECT }] : []),
        }),
      }),
    }),
  }),
}));
vi.mock("@camp404/db/team-memberships", () => ({
  assignTeam: vi.fn(async () => ({ created: true, cycle: 2027 })),
  removeTeam: vi.fn(async () => ({ removed: true, cycle: 2027 })),
  setLead: vi.fn(async () => ({ ok: true, changed: true })),
  getTeamMemberships: vi.fn(async () => [
    { team: "kitchen", isLead: false, cycle: 2027 },
  ]),
}));
vi.mock("@camp404/db/invite-codes", () => ({
  listInviteCodes: vi.fn(async () => []),
  revokeInviteCode: vi.fn(async () => false),
  findInviteCodeByCode: vi.fn(async () => null),
}));
vi.mock("@camp404/db/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@camp404/db/audit")>()),
  listAuditLog: vi.fn(async () => ({ rows: [], nextCursor: null })),
}));
vi.mock("@/lib/camp-config", () => {
  const config = {
    teams: [
      { key: "kitchen", label: "Kitchen", archived: false },
      { key: "structures", label: "Structures", archived: true },
    ],
  };
  return {
    getTeamsConfig: async () => config,
    activeTeams: (c: typeof config) => c.teams.filter((t) => !t.archived),
    teamLabelMap: (c: typeof config) =>
      Object.fromEntries(c.teams.map((t) => [t.key, t.label])),
  };
});

import { listAuditLog } from "@camp404/db/audit";
import {
  findInviteCodeByCode,
  listInviteCodes,
  revokeInviteCode,
} from "@camp404/db/invite-codes";
import { assignTeam, removeTeam, setLead } from "@camp404/db/team-memberships";
import { registerAdminTools } from "../tools/admin";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerAdminTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as = CAPTAIN) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  rank.current = "captain";
  memberExists.current = true;
});

describe("team membership tools", () => {
  it("refuses a member before any write", async () => {
    rank.current = "member";
    for (const name of [
      "assign_team_membership",
      "remove_team_membership",
      "set_team_lead",
    ]) {
      const result = await call(
        name,
        { userId: SUBJECT, team: "kitchen", isLead: true },
        MEMBER,
      );
      expect(result).toEqual({ error: "Only a captain can do this." });
    }
    expect(assignTeam).not.toHaveBeenCalled();
    expect(removeTeam).not.toHaveBeenCalled();
    expect(setLead).not.toHaveBeenCalled();
  });

  it("assigns with the captain as the actor, on an active team only", async () => {
    const result = await call("assign_team_membership", {
      userId: SUBJECT,
      team: "kitchen",
    });
    expect(result.data).toMatchObject({ created: true });
    expect(assignTeam).toHaveBeenCalledWith({
      userId: SUBJECT,
      team: "kitchen",
      actorId: CAPTAIN,
    });

    expect(
      await call("assign_team_membership", {
        userId: SUBJECT,
        team: "structures",
      }),
    ).toEqual({ error: "That team isn't active." });
  });

  it("removes from an archived team, but not an unknown one", async () => {
    expect(
      (
        await call("remove_team_membership", {
          userId: SUBJECT,
          team: "structures",
        })
      ).data,
    ).toMatchObject({ removed: true });
    expect(
      await call("remove_team_membership", { userId: SUBJECT, team: "bogus" }),
    ).toEqual({ error: "Unknown team." });
  });

  it("says so when the member does not exist or is not on the team", async () => {
    memberExists.current = false;
    expect(
      await call("assign_team_membership", {
        userId: SUBJECT,
        team: "kitchen",
      }),
    ).toEqual({ error: "No member with that id." });
    memberExists.current = true;
    vi.mocked(setLead).mockResolvedValueOnce({
      ok: false,
      reason: "not_a_member",
    });
    expect(
      await call("set_team_lead", {
        userId: SUBJECT,
        team: "kitchen",
        isLead: true,
      }),
    ).toEqual({ error: "Add them to the team first." });
  });
});

describe("invite code tools", () => {
  it("lists every code for a captain and only their own for a member", async () => {
    await call("list_invite_codes", {});
    expect(listInviteCodes).toHaveBeenLastCalledWith({});
    rank.current = "member";
    await call("list_invite_codes", {}, MEMBER);
    expect(listInviteCodes).toHaveBeenLastCalledWith({
      createdByUserId: MEMBER,
    });
  });

  it("scopes a member's revoke to their own codes and says why it failed", async () => {
    rank.current = "member";
    vi.mocked(findInviteCodeByCode).mockResolvedValueOnce({
      code: "amber-fox-7",
      revokedAt: null,
    } as never);
    const result = await call(
      "revoke_invite_code",
      { code: "Amber-Fox-7" },
      MEMBER,
    );
    expect(revokeInviteCode).toHaveBeenCalledWith({
      code: "amber-fox-7",
      actorUserId: MEMBER,
      createdByUserId: MEMBER,
    });
    expect(result).toEqual({
      error: "Only the person who made this code, or a captain, can revoke it.",
    });
  });

  it("lets a captain revoke any code", async () => {
    vi.mocked(revokeInviteCode).mockResolvedValueOnce(true);
    expect(
      (await call("revoke_invite_code", { code: "amber-fox-7" })).data,
    ).toEqual({ revoked: true });
    expect(revokeInviteCode).toHaveBeenCalledWith({
      code: "amber-fox-7",
      actorUserId: CAPTAIN,
      createdByUserId: undefined,
    });
  });
});

describe("list_audit_log", () => {
  it("is captain only", async () => {
    rank.current = "member";
    expect(await call("list_audit_log", {}, MEMBER)).toEqual({
      error: "Only a captain can do this.",
    });
    expect(listAuditLog).not.toHaveBeenCalled();
  });

  it("refuses a cursor it did not make, and words each entry", async () => {
    expect(await call("list_audit_log", { before: "nope" })).toEqual({
      error: "That cursor isn't one this tool returned.",
    });
    vi.mocked(listAuditLog).mockResolvedValueOnce({
      rows: [
        {
          id: "r1",
          action: "member.team_lead_set",
          actorId: CAPTAIN,
          actorName: "Cap",
          target: SUBJECT,
          targetName: "Sub",
          metadata: { team: "kitchen", isLead: true },
          createdAt: new Date("2026-09-16T10:00:00Z"),
        },
      ],
      nextCursor: null,
    });
    const { data } = await call("list_audit_log", {});
    expect(data.entries[0]).toMatchObject({
      label: "Changed a team lead",
      actorName: "Cap",
      about: "Sub",
      detail: "Now leads Kitchen",
      at: "2026-09-16T10:00:00.000Z",
    });
  });
});
