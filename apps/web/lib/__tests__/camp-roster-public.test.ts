import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import {
  derivePublicRosterStats,
  rosterForViewer,
  toPublicRosterRow,
  toRosterRow,
  type PublicRosterRow,
} from "@/lib/camp-roster";

const PRIVATE_KEYS = [
  "status",
  "statusLabel",
  "approvalStatus",
  "awaitingApproval",
  "onboardingComplete",
  "pendingRequiredActions",
  "requiredComplete",
  "isDriver",
  "driverProfileComplete",
] as const;

// The member-facing roster projection. The privacy-critical invariant: the
// PUBLIC row carries identity + team context ONLY — never the approval /
// onboarding / driver facets a captain triages by.

function member(
  overrides: Partial<CampManagementMember> = {},
): CampManagementMember {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Dusty Boot",
    handle: "dusty",
    rank: "member",
    approvalStatus: "pending",
    isLead: false,
    teams: ["kitchen"],
    duesPaid: false,
    membershipTier: "full",
    onboardingComplete: false,
    pendingRequiredActions: 3,
    intendsToDrive: true,
    driverProfileComplete: false,
    country: "ZA",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("toPublicRosterRow", () => {
  it("carries only the public identity + team fields", () => {
    const row = toPublicRosterRow(member());
    expect(row).toEqual<PublicRosterRow>({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "Dusty Boot",
      handle: "dusty",
      rankLabel: "Member",
      rank: "member",
      isLead: false,
      teams: ["kitchen"],
      country: "South Africa",
      inSouthAfrica: true,
    });
  });

  it("never leaks any approval / onboarding / driver facet", () => {
    const row = toPublicRosterRow(
      member({
        approvalStatus: "pending",
        onboardingComplete: false,
        pendingRequiredActions: 5,
        intendsToDrive: true,
      }),
    ) as unknown as Record<string, unknown>;
    for (const leaked of PRIVATE_KEYS) {
      expect(row[leaked]).toBeUndefined();
    }
  });

  it("matches the captain row on the shared public fields (single-sourced)", () => {
    const m = member({ rank: "captain", isLead: true, handle: null });
    const pub = toPublicRosterRow(m);
    const full = toRosterRow(m);
    expect(pub).toEqual({
      id: full.id,
      displayName: full.displayName,
      handle: full.handle,
      rankLabel: full.rankLabel,
      rank: full.rank,
      isLead: full.isLead,
      teams: full.teams,
      country: full.country,
      inSouthAfrica: full.inSouthAfrica,
    });
  });

  it("falls back to a placeholder display name", () => {
    expect(toPublicRosterRow(member({ displayName: "   " })).displayName).toBe(
      "Unnamed burner",
    );
  });
});

describe("derivePublicRosterStats", () => {
  it("counts members + captains only (no approval-derived counts)", () => {
    const rows = [
      toPublicRosterRow(member({ id: "a", rank: "member" })),
      toPublicRosterRow(member({ id: "b", rank: "captain" })),
      toPublicRosterRow(member({ id: "c", rank: "captain" })),
    ];
    const stats = derivePublicRosterStats(rows);
    expect(stats).toEqual({ members: 3, captains: 2 });
    expect(Object.keys(stats).sort()).toEqual(["captains", "members"]);
  });

  it("is zero on an empty roster", () => {
    expect(derivePublicRosterStats([])).toEqual({ members: 0, captains: 0 });
  });
});

describe("rosterForViewer (the page fork — the leak boundary)", () => {
  const members = [
    member({ id: "a", rank: "member" }),
    member({ id: "b", rank: "captain" }),
  ];

  it("hands captains the full triage rows", () => {
    const out = rosterForViewer(members, true);
    expect(out.isCaptain).toBe(true);
    expect(out.rows).toHaveLength(2);
    const row = out.rows[0] as unknown as Record<string, unknown>;
    expect(row.approvalStatus).toBeDefined();
    expect(row.status).toBeDefined();
  });

  it("hands members redacted public rows — no private facet on ANY row", () => {
    const out = rosterForViewer(members, false);
    expect(out.isCaptain).toBe(false);
    expect(out.rows).toHaveLength(2);
    for (const row of out.rows as unknown as Record<string, unknown>[]) {
      for (const leaked of PRIVATE_KEYS) {
        expect(row[leaked]).toBeUndefined();
      }
    }
  });
});
