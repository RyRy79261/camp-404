import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import {
  MEMBERS_SEE_REJECTED,
  derivePublicRosterStats,
  matchesPublicChip,
  membersVisibleTo,
  rosterForViewer,
  toPublicRosterRow,
  toRosterRow,
  visibleToMembers,
  type PublicRosterRow,
} from "@/lib/camp-roster";

const PRIVATE_KEYS = [
  "email",
  "status",
  "statusLabel",
  "approvalStatus",
  "awaitingApproval",
  "onboardingComplete",
  "pendingRequiredActions",
  "requiredComplete",
  "isDriver",
  "driverProfileComplete",
  "duesPaid",
] as const;

// Every key the PUBLIC row is allowed to carry. The privacy test below compares
// against this set rather than a hand-written deny list, so WIDENING the
// projection later — adding a field to `toPublicRosterRow` without adding it
// here — turns the suite red instead of shipping quietly.
const PUBLIC_KEYS = [
  "id",
  "displayName",
  "handle",
  "rankLabel",
  "rank",
  "isLead",
  "teams",
  "country",
  "inSouthAfrica",
  "standing",
] as const;

// The member-facing roster projection. The privacy-critical invariant: the
// PUBLIC row carries identity, team context and the applicant STANDING
// (owner's ruling, 2026-09-22) — never the rest of the approval lifecycle, and
// never the onboarding / driver / dues facets a captain triages by.

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
  it("carries only the public identity + team fields, plus the standing", () => {
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
      standing: "pending",
    });
  });

  it("carries NOTHING beyond the allowed public keys (widening tripwire)", () => {
    const row = toPublicRosterRow(member()) as unknown as Record<
      string,
      unknown
    >;
    expect(Object.keys(row).sort()).toEqual([...PUBLIC_KEYS].sort());
  });

  it("keeps an applicant's standing, and gives a camp member none", () => {
    expect(
      toPublicRosterRow(member({ approvalStatus: "pending" })).standing,
    ).toBe("pending");
    expect(
      toPublicRosterRow(member({ approvalStatus: "approved" })).standing,
    ).toBeNull();
    expect(
      toPublicRosterRow(member({ approvalStatus: "rejected" })).standing,
    ).toBe("rejected");
  });

  it("never leaks the rest of the approval lifecycle, or any onboarding / driver / dues facet", () => {
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
      standing: full.standing,
    });
  });

  it("falls back to a placeholder display name", () => {
    expect(toPublicRosterRow(member({ displayName: "   " })).displayName).toBe(
      "Unnamed burner",
    );
  });
});

describe("derivePublicRosterStats", () => {
  it("counts members, captains and applicants — and nothing else", () => {
    const rows = [
      toPublicRosterRow(
        member({ id: "a", rank: "member", approvalStatus: "approved" }),
      ),
      toPublicRosterRow(
        member({ id: "b", rank: "captain", approvalStatus: "approved" }),
      ),
      toPublicRosterRow(
        member({ id: "c", rank: "captain", approvalStatus: "approved" }),
      ),
      toPublicRosterRow(
        member({ id: "d", rank: "member", approvalStatus: "pending" }),
      ),
    ];
    const stats = derivePublicRosterStats(rows);
    expect(stats).toEqual({ members: 4, captains: 2, pending: 1 });
    expect(Object.keys(stats).sort()).toEqual([
      "captains",
      "members",
      "pending",
    ]);
  });

  it("is zero on an empty roster", () => {
    expect(derivePublicRosterStats([])).toEqual({
      members: 0,
      captains: 0,
      pending: 0,
    });
  });

  it("reconciles: the Pending badge equals what the Pending chip shows", () => {
    const rows = rosterForViewer(
      [
        member({ id: "a", approvalStatus: "approved" }),
        member({ id: "b", approvalStatus: "pending" }),
        member({ id: "c", approvalStatus: "pending" }),
        member({ id: "d", approvalStatus: "rejected" }),
      ],
      false,
    ).rows;
    expect(derivePublicRosterStats(rows).pending).toBe(
      rows.filter((r) => matchesPublicChip(r, "pending")).length,
    );
    expect(derivePublicRosterStats(rows).members).toBe(
      rows.filter((r) => matchesPublicChip(r, "all")).length,
    );
  });
});

describe("MEMBERS_SEE_REJECTED (the owner's one-line flip)", () => {
  it("defaults to keeping declined sign-ups off a member's roster", () => {
    expect(MEMBERS_SEE_REJECTED).toBe(false);
    expect(visibleToMembers({ approvalStatus: "rejected" })).toBe(false);
    expect(visibleToMembers({ approvalStatus: "pending" })).toBe(true);
    expect(visibleToMembers({ approvalStatus: "approved" })).toBe(true);
  });

  it("shows them to everyone once the flip is on", () => {
    expect(visibleToMembers({ approvalStatus: "rejected" }, true)).toBe(true);
    const rejected = member({ id: "r", approvalStatus: "rejected" });
    expect(membersVisibleTo([rejected], false)).toEqual([]);
    expect(membersVisibleTo([rejected], false, true)).toEqual([rejected]);
  });

  // The flip is only worth one line if that line actually reaches the page.
  // Drive it through the REAL fork, both ways, so nobody can hardcode the
  // exclusion inside `rosterForViewer` and leave the constant a decoration.
  it("is honoured by the page fork itself, not just by the predicate", () => {
    const roster = [
      member({ id: "ok", approvalStatus: "approved" }),
      member({ id: "no", approvalStatus: "rejected" }),
    ];
    expect(rosterForViewer(roster, false, false).rows.map((r) => r.id)).toEqual(
      ["ok"],
    );
    const flipped = rosterForViewer(roster, false, true);
    expect(flipped.rows.map((r) => r.id)).toEqual(["ok", "no"]);
    // …and the declined row then wears its standing, nothing more.
    const row = flipped.rows[1] as PublicRosterRow;
    expect(row.standing).toBe("rejected");
    expect(Object.keys(row).sort()).toEqual([...PUBLIC_KEYS].sort());
  });

  it("never hides anyone from a captain", () => {
    const all = [
      member({ id: "a", approvalStatus: "approved" }),
      member({ id: "b", approvalStatus: "pending" }),
      member({ id: "c", approvalStatus: "rejected" }),
    ];
    expect(membersVisibleTo(all, true)).toHaveLength(3);
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
      // The tripwire again, at the fork: not one key beyond the allowed set
      // reaches a non-captain, whatever a future projection adds.
      expect(Object.keys(row).sort()).toEqual([...PUBLIC_KEYS].sort());
    }
  });

  it("keeps a pending applicant, with their standing, on a member's roster", () => {
    const out = rosterForViewer(
      [member({ id: "p", approvalStatus: "pending" })],
      false,
    );
    expect(out.rows.map((r) => r.id)).toEqual(["p"]);
    expect((out.rows[0] as PublicRosterRow).standing).toBe("pending");
  });

  it("does NOT hand a member a declined sign-up at all", () => {
    const out = rosterForViewer(
      [
        member({ id: "ok", approvalStatus: "approved" }),
        member({ id: "no", approvalStatus: "rejected" }),
      ],
      false,
    );
    expect(out.rows.map((r) => r.id)).toEqual(["ok"]);
    // …while the captain still triages them.
    expect(
      rosterForViewer(
        [
          member({ id: "ok", approvalStatus: "approved" }),
          member({ id: "no", approvalStatus: "rejected" }),
        ],
        true,
      ).rows.map((r) => r.id),
    ).toEqual(["ok", "no"]);
  });
});
