import { describe, expect, it } from "vitest";
import type { McpScopeRows } from "@camp404/db/mcp";
import { resolveMcpScope } from "@/lib/mcp/scope";

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

describe("the rung on the website's ladder", () => {
  it("makes a lead of ANY team a team lead, the global-lead ruling", () => {
    const lead = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "kitchen", isLead: true }] }),
    );
    expect(lead.viewerRank).toBe("team_lead");
    // Team clearance is global: the same rung whatever team they lead.
    const otherLead = resolveMcpScope(
      buildRows({ teamMemberships: [{ team: "structures", isLead: true }] }),
    );
    expect(otherLead.viewerRank).toBe(lead.viewerRank);
  });

  it("keeps a plain team member a member, and a captain a captain", () => {
    expect(
      resolveMcpScope(
        buildRows({ teamMemberships: [{ team: "kitchen", isLead: false }] }),
      ).viewerRank,
    ).toBe("camp_member");
    expect(
      resolveMcpScope(
        buildRows({
          rank: "captain",
          teamMemberships: [{ team: "kitchen", isLead: true }],
        }),
      ).viewerRank,
    ).toBe("captain");
  });
});
