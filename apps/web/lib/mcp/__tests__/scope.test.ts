import { describe, expect, it } from "vitest";
import type { McpScopeRows } from "@camp404/db/mcp";
import {
  canAdmin,
  canApproveCrossTeam,
  canReadTeamOps,
  canWriteTeam,
  resolveMcpScope,
} from "@/lib/mcp/scope";

function buildRows(
  overrides: Partial<McpScopeRows> & {
    rank?: "captain" | "member";
    aiDataConsent?: boolean;
  } = {},
): McpScopeRows {
  const { rank = "member", aiDataConsent = false, ...rest } = overrides;
  return {
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      rank,
      aiDataConsent,
      ...(rest.user ?? {}),
    },
    teamMemberships: rest.teamMemberships ?? [],
    driverIntent: rest.driverIntent ?? false,
  };
}

describe("resolveMcpScope", () => {
  it("maps captain rank into isCaptain=true", () => {
    const scope = resolveMcpScope(buildRows({ rank: "captain" }));
    expect(scope.isCaptain).toBe(true);
    expect(scope.rank).toBe("captain");
  });

  it("splits team memberships into memberTeams + leadTeams", () => {
    const scope = resolveMcpScope(
      buildRows({
        teamMemberships: [
          { team: "kitchen", isLead: true },
          { team: "ministry_of_vibes", isLead: false },
        ],
      }),
    );
    expect(scope.memberTeams).toEqual(["kitchen", "ministry_of_vibes"]);
    expect(scope.leadTeams).toEqual(["kitchen"]);
  });

  it("propagates driver intent", () => {
    const scope = resolveMcpScope(buildRows({ driverIntent: true }));
    expect(scope.isDriver).toBe(true);
  });

  it("carries the subject's own ai-data consent", () => {
    const scope = resolveMcpScope(buildRows({ aiDataConsent: true }));
    expect(scope.aiDataConsent).toBe(true);
  });
});

describe("canReadTeamOps", () => {
  it("captain can read any team", () => {
    const scope = resolveMcpScope(buildRows({ rank: "captain" }));
    expect(canReadTeamOps(scope, "kitchen")).toBe(true);
    expect(canReadTeamOps(scope, "structures")).toBe(true);
  });

  it("member can read their own team but not others", () => {
    const scope = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "kitchen", isLead: false }] }),
    );
    expect(canReadTeamOps(scope, "kitchen")).toBe(true);
    expect(canReadTeamOps(scope, "structures")).toBe(false);
  });
});

describe("canWriteTeam", () => {
  it("captain can write any team", () => {
    const scope = resolveMcpScope(buildRows({ rank: "captain" }));
    expect(canWriteTeam(scope, "kitchen")).toBe(true);
  });

  it("lead can write their own team", () => {
    const scope = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "kitchen", isLead: true }] }),
    );
    expect(canWriteTeam(scope, "kitchen")).toBe(true);
    expect(canWriteTeam(scope, "structures")).toBe(false);
  });

  it("non-lead member cannot write their team", () => {
    const scope = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "kitchen", isLead: false }] }),
    );
    expect(canWriteTeam(scope, "kitchen")).toBe(false);
  });
});

describe("canApproveCrossTeam", () => {
  it("any lead of any team can approve", () => {
    const scope = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "kitchen", isLead: true }] }),
    );
    expect(canApproveCrossTeam(scope)).toBe(true);
  });

  it("captain can approve", () => {
    const scope = resolveMcpScope(buildRows({ rank: "captain" }));
    expect(canApproveCrossTeam(scope)).toBe(true);
  });

  it("plain member cannot approve", () => {
    const scope = resolveMcpScope(buildRows());
    expect(canApproveCrossTeam(scope)).toBe(false);
  });
});

describe("canAdmin", () => {
  it("only captains pass", () => {
    expect(canAdmin(resolveMcpScope(buildRows({ rank: "captain" })))).toBe(true);
    expect(canAdmin(resolveMcpScope(buildRows()))).toBe(false);
  });
});
