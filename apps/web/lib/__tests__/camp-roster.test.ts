import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import {
  deriveRosterStats,
  matchesChip,
  matchesRosterQuery,
  matchesTeam,
  rankLabel,
  toRosterRow,
} from "@/lib/camp-roster";

function member(
  overrides: Partial<CampManagementMember> = {},
): CampManagementMember {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Dusty Boot",
    handle: null,
    rank: "member",
    approvalStatus: "approved",
    isLead: false,
    teams: [],
    duesPaid: false,
    membershipTier: "full",
    onboardingComplete: true,
    pendingRequiredActions: 0,
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("rankLabel", () => {
  it("captain outranks lead", () => {
    expect(rankLabel("captain", true)).toBe("Captain");
    expect(rankLabel("captain", false)).toBe("Captain");
  });

  it("lead outranks plain member", () => {
    expect(rankLabel("member", true)).toBe("Team Lead");
    expect(rankLabel("member", false)).toBe("Member");
  });
});

describe("toRosterRow status", () => {
  it("is 'onboarding' when the burner profile isn't done", () => {
    const row = toRosterRow(
      member({ onboardingComplete: false, pendingRequiredActions: 2 }),
    );
    expect(row.status).toBe("onboarding");
    expect(row.statusLabel).toBe("Onboarding");
  });

  it("is 'pending' when onboarded but actions outstanding", () => {
    const row = toRosterRow(
      member({ onboardingComplete: true, pendingRequiredActions: 1 }),
    );
    expect(row.status).toBe("pending");
    expect(row.requiredComplete).toBe(false);
  });

  it("is 'ready' when onboarded and nothing pending", () => {
    const row = toRosterRow(
      member({ onboardingComplete: true, pendingRequiredActions: 0 }),
    );
    expect(row.status).toBe("ready");
    expect(row.requiredComplete).toBe(true);
  });

  it("is 'awaiting_approval' when onboarded but not yet vetted", () => {
    const row = toRosterRow(
      member({ onboardingComplete: true, approvalStatus: "pending" }),
    );
    expect(row.status).toBe("awaiting_approval");
    expect(row.awaitingApproval).toBe(true);
  });

  it("approval outranks outstanding actions in the status pill", () => {
    const row = toRosterRow(
      member({
        onboardingComplete: true,
        approvalStatus: "pending",
        pendingRequiredActions: 3,
      }),
    );
    expect(row.status).toBe("awaiting_approval");
  });

  it("is 'rejected' when a captain has denied the applicant", () => {
    const row = toRosterRow(
      member({ onboardingComplete: true, approvalStatus: "rejected" }),
    );
    expect(row.status).toBe("rejected");
    expect(row.awaitingApproval).toBe(false);
  });

  it("still shows 'onboarding' before the profile is done, even if pending", () => {
    const row = toRosterRow(
      member({ onboardingComplete: false, approvalStatus: "pending" }),
    );
    expect(row.status).toBe("onboarding");
  });
});

describe("toRosterRow derivations", () => {
  it("flags South Africa from the ZA country code and resolves the name", () => {
    expect(toRosterRow(member({ country: "ZA" })).inSouthAfrica).toBe(true);
    expect(toRosterRow(member({ country: "ZA" })).country).toBe("South Africa");
  });

  it("treats any other country as not in South Africa", () => {
    const row = toRosterRow(member({ country: "GB" }));
    expect(row.inSouthAfrica).toBe(false);
    expect(row.country).toBe("United Kingdom");
  });

  it("tolerates an unanswered country", () => {
    const row = toRosterRow(member({ country: null }));
    expect(row.inSouthAfrica).toBe(false);
    expect(row.country).toBeNull();
  });

  it("surfaces driver intent", () => {
    expect(toRosterRow(member({ intendsToDrive: true })).isDriver).toBe(true);
    expect(toRosterRow(member({ intendsToDrive: false })).isDriver).toBe(false);
  });

  it("falls back to a placeholder name when unnamed", () => {
    expect(toRosterRow(member({ displayName: null })).displayName).toBe(
      "Unnamed burner",
    );
    expect(toRosterRow(member({ displayName: "   " })).displayName).toBe(
      "Unnamed burner",
    );
  });
});

describe("matchesChip", () => {
  const captain = toRosterRow(member({ rank: "captain" }));
  const awaiting = toRosterRow(
    member({ onboardingComplete: true, approvalStatus: "pending" }),
  );
  const outstanding = toRosterRow(
    member({ onboardingComplete: true, pendingRequiredActions: 2 }),
  );
  const ready = toRosterRow(member({ onboardingComplete: true }));

  it("'all' matches everyone", () => {
    for (const row of [captain, awaiting, outstanding, ready]) {
      expect(matchesChip(row, "all")).toBe(true);
    }
  });

  it("'pending' matches only rows awaiting a vetting decision", () => {
    expect(matchesChip(awaiting, "pending")).toBe(true);
    expect(matchesChip(ready, "pending")).toBe(false);
  });

  it("'captains' matches only captains", () => {
    expect(matchesChip(captain, "captains")).toBe(true);
    expect(matchesChip(ready, "captains")).toBe(false);
  });

  it("'outstanding' matches only rows with blocking actions left", () => {
    expect(matchesChip(outstanding, "outstanding")).toBe(true);
    expect(matchesChip(ready, "outstanding")).toBe(false);
  });
});

describe("matchesTeam", () => {
  const row = toRosterRow(member({ teams: ["kitchen", "structures"] }));

  it("matches a team the member belongs to", () => {
    expect(matchesTeam(row, "kitchen")).toBe(true);
    expect(matchesTeam(row, "structures")).toBe(true);
  });

  it("does not match a team the member isn't on", () => {
    expect(matchesTeam(row, "sanitation_and_water")).toBe(false);
    expect(matchesTeam(toRosterRow(member({ teams: [] })), "kitchen")).toBe(
      false,
    );
  });
});

describe("matchesRosterQuery", () => {
  const row = toRosterRow(
    member({
      displayName: "Dusty Boot",
      handle: "dustyb",
      country: "GB",
      teams: ["kitchen"],
    }),
  );

  it("matches everything for an empty/whitespace query", () => {
    expect(matchesRosterQuery(row, "")).toBe(true);
    expect(matchesRosterQuery(row, "   ")).toBe(true);
  });

  it("matches on name, handle, country, and team value (case-insensitive)", () => {
    expect(matchesRosterQuery(row, "dusty")).toBe(true);
    expect(matchesRosterQuery(row, "DUSTYB")).toBe(true);
    expect(matchesRosterQuery(row, "united kingdom")).toBe(true);
    expect(matchesRosterQuery(row, "kitchen")).toBe(true);
  });

  it("matches on rank label", () => {
    expect(matchesRosterQuery(toRosterRow(member({ rank: "captain" })), "captain")).toBe(
      true,
    );
  });

  it("tolerates a null handle / null country", () => {
    const bare = toRosterRow(
      member({ displayName: "Nmeb", handle: null, country: null, teams: [] }),
    );
    expect(matchesRosterQuery(bare, "nmeb")).toBe(true);
    expect(matchesRosterQuery(bare, "kitchen")).toBe(false);
  });

  it("returns false when nothing matches", () => {
    expect(matchesRosterQuery(row, "zzz-nope")).toBe(false);
  });
});

describe("deriveRosterStats", () => {
  it("derives all six counts in one reconciling pass", () => {
    const rows = [
      // approved captain, all done
      toRosterRow(
        member({ rank: "captain", approvalStatus: "approved" }),
      ),
      // approved member with a blocking action left (incomplete/outstanding)
      toRosterRow(
        member({ approvalStatus: "approved", pendingRequiredActions: 2 }),
      ),
      // awaiting a vetting decision (pending)
      toRosterRow(
        member({ approvalStatus: "pending", onboardingComplete: true }),
      ),
    ];
    expect(deriveRosterStats(rows)).toEqual({
      members: 3,
      approved: 2,
      incomplete: 1,
      pending: 1,
      captains: 1,
      outstanding: 1, // same predicate as incomplete (OQ#5)
    });
  });

  it("is all-zero for an empty roster", () => {
    expect(deriveRosterStats([])).toEqual({
      members: 0,
      approved: 0,
      incomplete: 0,
      pending: 0,
      captains: 0,
      outstanding: 0,
    });
  });
});
