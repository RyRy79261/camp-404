import { describe, expect, it } from "vitest";
import type { CampManagementMember } from "@camp404/db/roster";
import {
  deriveRosterStats,
  matchesChip,
  matchesRosterQuery,
  deriveThisYear,
  matchesTeam,
  matchesThisYear,
  rankLabel,
  sortRosterRows,
  toPublicRosterRow,
  toRosterRow,
  type ThisYearFilter,
} from "@/lib/camp-roster";
import type { ParticipationStatus } from "@camp404/types";

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
    pendingRequiredActionItems: [],
    intendsToDrive: false,
    driverProfileComplete: false,
    country: "ZA",
    participation: null,
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

  it("names what the member still owes on the captain row, in order", () => {
    const owing = member({
      pendingRequiredActions: 2,
      pendingRequiredActionItems: [
        { key: "burner_profile", title: "Complete your burner profile" },
        { key: "def_dietary", title: "Dietary questionnaire" },
      ],
    });
    expect(toRosterRow(owing).outstanding).toEqual([
      "Burner profile",
      "Dietary questionnaire",
    ]);
    expect(toRosterRow(member()).outstanding).toEqual([]);
    // The member's view of the same person carries none of it.
    const pub = toPublicRosterRow(owing) as unknown as Record<string, unknown>;
    expect(pub.outstanding).toBeUndefined();
    expect(JSON.stringify(pub)).not.toMatch(/burner.profile|dietary/i);
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

describe("toRosterRow thisYear", () => {
  it("carries this year's status on a captain's row, and null when unanswered", () => {
    expect(toRosterRow(member({ participation: "maybe" })).thisYear).toBe(
      "maybe",
    );
    const unanswered = toRosterRow(member({ participation: null }));
    expect("thisYear" in unanswered).toBe(true);
    expect(unanswered.thisYear).toBeNull();
  });
});

describe("matchesThisYear", () => {
  const STATUSES: (ParticipationStatus | null)[] = [
    "applied",
    "maybe",
    "accepted",
    "waitlisted",
    "not_attending",
    null,
  ];
  const rows = STATUSES.map((participation) =>
    toRosterRow(member({ participation })),
  );
  const shown = (filter: ThisYearFilter) =>
    rows.filter((r) => matchesThisYear(r, filter)).map((r) => r.thisYear);

  it("lets every row through under Any", () => {
    expect(shown("any")).toEqual(STATUSES);
  });

  it("keeps exactly one status under each status option", () => {
    for (const status of STATUSES.filter((s) => s !== null)) {
      expect(shown(status)).toEqual([status]);
    }
  });

  it("keeps only the unanswered under Not answered", () => {
    expect(shown("none")).toEqual([null]);
  });

  it("treats a row without the key as not answered", () => {
    const pub = toPublicRosterRow(member({ participation: "accepted" }));
    expect(matchesThisYear(pub, "none")).toBe(true);
    expect(matchesThisYear(pub, "accepted")).toBe(false);
  });
});

describe("deriveThisYear", () => {
  it("counts each status once, over approved members only", () => {
    const rows = [
      member({ id: "a", participation: "applied" }),
      member({ id: "b", participation: "applied" }),
      member({ id: "c", participation: "maybe" }),
      member({ id: "d", participation: "accepted" }),
      member({ id: "e", participation: "waitlisted" }),
      member({ id: "f", participation: "not_attending" }),
      member({ id: "g", participation: null }),
      // Not in camp, whatever they answered: pending and declined sign-ups.
      member({ id: "p", approvalStatus: "pending", participation: "applied" }),
      member({ id: "q", approvalStatus: "pending", participation: null }),
      member({ id: "r", approvalStatus: "rejected", participation: "maybe" }),
    ].map(toRosterRow);

    expect(deriveThisYear(rows)).toEqual({
      coming: 2,
      maybe: 1,
      accepted: 1,
      waitlisted: 1,
      notComing: 1,
      notAnswered: 1,
      total: 7,
    });
  });

  it("is all zeros with nobody approved", () => {
    expect(
      deriveThisYear([
        toRosterRow(
          member({ approvalStatus: "pending", participation: "applied" }),
        ),
      ]),
    ).toEqual({
      coming: 0,
      maybe: 0,
      accepted: 0,
      waitlisted: 0,
      notComing: 0,
      notAnswered: 0,
      total: 0,
    });
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
    expect(
      matchesRosterQuery(toRosterRow(member({ rank: "captain" })), "captain"),
    ).toBe(true);
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

  it("matches a team by its configured label", () => {
    expect(matchesRosterQuery(row, "cuisine", { kitchen: "Cuisine" })).toBe(
      true,
    );
    expect(matchesRosterQuery(row, "cuisine")).toBe(false);
  });

  it("matches a captain's row by email", () => {
    const withEmail = toRosterRow(member({ email: "Dusty@Example.com" }));
    expect(matchesRosterQuery(withEmail, "dusty@example")).toBe(true);
    // A row built without an email (the member view) cannot match on one.
    expect(matchesRosterQuery(row, "@example")).toBe(false);
  });
});

describe("deriveRosterStats", () => {
  it("derives all six counts in one reconciling pass", () => {
    const rows = [
      // approved captain, all done
      toRosterRow(member({ rank: "captain", approvalStatus: "approved" })),
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

describe("sortRosterRows", () => {
  const rows = [
    toRosterRow(
      member({ id: "a", displayName: "zed", handle: "z", country: "ZA" }),
    ),
    toRosterRow(
      member({
        id: "b",
        displayName: "Amy",
        handle: null,
        country: null,
        rank: "captain",
      }),
    ),
    toRosterRow(
      member({
        id: "c",
        displayName: "mo",
        handle: "m",
        country: "BE",
        approvalStatus: "pending",
        isLead: true,
      }),
    ),
  ];
  const names = (sorted: typeof rows) => sorted.map((r) => r.displayName);

  it("sorts names without caring about case, both ways", () => {
    expect(
      names(sortRosterRows(rows, { key: "name", direction: "asc" })),
    ).toEqual(["Amy", "mo", "zed"]);
    expect(
      names(sortRosterRows(rows, { key: "name", direction: "desc" })),
    ).toEqual(["zed", "mo", "Amy"]);
  });

  it("keeps a missing value last in either direction", () => {
    expect(
      names(sortRosterRows(rows, { key: "handle", direction: "asc" })),
    ).toEqual(["mo", "zed", "Amy"]);
    expect(
      names(sortRosterRows(rows, { key: "country", direction: "desc" })),
    ).toEqual(["zed", "mo", "Amy"]);
  });

  it("puts captains, then leads, first by role, and a pending decision first by status", () => {
    expect(
      names(sortRosterRows(rows, { key: "role", direction: "asc" })),
    ).toEqual(["Amy", "mo", "zed"]);
    expect(
      names(sortRosterRows(rows, { key: "status", direction: "asc" }))[0],
    ).toBe("mo");
  });

  it("does not change the rows it was given", () => {
    const before = names(rows);
    sortRosterRows(rows, { key: "name", direction: "desc" });
    expect(names(rows)).toEqual(before);
  });
});
