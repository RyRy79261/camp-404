import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import { rankLabel, toRosterRow } from "@/lib/camp-roster";

function member(
  overrides: Partial<CampManagementMember> = {},
): CampManagementMember {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Dusty Boot",
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
