import { describe, expect, it } from "vitest";

import { canSendToAudience, type AudienceActor } from "../audience-authz";

const captain: AudienceActor = { rank: "captain", leadTeams: [] };
const kitchenLead: AudienceActor = {
  rank: "team_lead",
  leadTeams: ["kitchen"],
};
const member: AudienceActor = { rank: "camp_member", leadTeams: [] };

describe("canSendToAudience — captains", () => {
  it("allows every scope, including ones they have no membership for", () => {
    for (const scope of [
      "everyone",
      "team",
      "team_leads",
      "drivers",
      "individual",
      "opt_in",
    ] as const) {
      expect(canSendToAudience(captain, { scope, team: "kitchen" })).toBe(true);
    }
  });

  it("does not need the team to be one they lead", () => {
    expect(
      canSendToAudience(captain, { scope: "team", team: "structures" }),
    ).toBe(true);
  });
});

describe("canSendToAudience — team leads", () => {
  it("lets a lead of several teams address each of them, one at a time, and no other", () => {
    const twoTeamLead: AudienceActor = {
      rank: "team_lead",
      leadTeams: ["kitchen", "structures"],
    };
    for (const team of ["kitchen", "structures"] as const) {
      expect(canSendToAudience(twoTeamLead, { scope: "team", team })).toBe(
        true,
      );
    }
    expect(
      canSendToAudience(twoTeamLead, {
        scope: "team",
        team: "ministry_of_vibes",
      }),
    ).toBe(false);
    expect(canSendToAudience(twoTeamLead, { scope: "everyone" })).toBe(false);
    expect(canSendToAudience(twoTeamLead, { scope: "team_leads" })).toBe(false);
  });

  it("allows a send to a team they lead", () => {
    expect(
      canSendToAudience(kitchenLead, { scope: "team", team: "kitchen" }),
    ).toBe(true);
  });

  it("refuses a send to a team they do not lead", () => {
    expect(
      canSendToAudience(kitchenLead, { scope: "team", team: "structures" }),
    ).toBe(false);
  });

  it("refuses every scope wider than their own team", () => {
    // `individual` is refused too: an arbitrary member list is a way to reach
    // the whole camp one id at a time.
    for (const scope of [
      "everyone",
      "team_leads",
      "drivers",
      "individual",
      "opt_in",
    ] as const) {
      expect(canSendToAudience(kitchenLead, { scope, team: "kitchen" })).toBe(
        false,
      );
    }
  });

  it("fails closed on a team scope with no team chosen", () => {
    expect(canSendToAudience(kitchenLead, { scope: "team" })).toBe(false);
    expect(canSendToAudience(kitchenLead, { scope: "team", team: null })).toBe(
      false,
    );
    expect(canSendToAudience(kitchenLead, { scope: "team", team: "" })).toBe(
      false,
    );
  });

  it("refuses a lead whose leadTeams is empty — the pre-WP6 state", () => {
    expect(
      canSendToAudience(
        { rank: "team_lead", leadTeams: [] },
        { scope: "team", team: "kitchen" },
      ),
    ).toBe(false);
  });
});

describe("canSendToAudience — plain members", () => {
  it("refuses everything, their own team included", () => {
    expect(canSendToAudience(member, { scope: "team", team: "kitchen" })).toBe(
      false,
    );
    expect(canSendToAudience(member, { scope: "everyone" })).toBe(false);
  });
});

// Pinning an announcement asks this same function, against the broadcast's own
// stored audience — the owner's ruling (2026-09-22): "If I am allowed to post
// to everyone, then that means I'm also allowed to pin something that is posted
// to everyone." These cases say that out loud, so the rule cannot drift into a
// second, pin-shaped copy at a call site.
describe("canSendToAudience — pinning follows posting", () => {
  it("lets a captain pin anything they could have posted", () => {
    expect(canSendToAudience(captain, { scope: "everyone" })).toBe(true);
    expect(
      canSendToAudience(captain, { scope: "team", team: "structures" }),
    ).toBe(true);
  });

  it("lets a lead pin their own team's announcement and no other", () => {
    expect(
      canSendToAudience(kitchenLead, { scope: "team", team: "kitchen" }),
    ).toBe(true);
    expect(
      canSendToAudience(kitchenLead, { scope: "team", team: "structures" }),
    ).toBe(false);
    // The camp-wide pin is the one that matters: a lead who could pin it would
    // be one tap away from the whole camp's screen.
    expect(canSendToAudience(kitchenLead, { scope: "everyone" })).toBe(false);
  });

  it("refuses a plain member every pin", () => {
    expect(canSendToAudience(member, { scope: "everyone" })).toBe(false);
    expect(canSendToAudience(member, { scope: "team", team: "kitchen" })).toBe(
      false,
    );
  });
});

// The car (#270): the riders of ONE car, addressed only by its own driver
// while they drive this year. Rank buys nothing here, a captain's included.
describe("canSendToAudience — the car", () => {
  const ADA = "00000000-0000-4000-8000-00000000000a";
  const CAI = "00000000-0000-4000-8000-00000000000c";
  const driverAda: AudienceActor = {
    rank: "camp_member",
    leadTeams: [],
    userId: ADA,
    drivesCar: true,
  };

  it("lets a driver write to their own car", () => {
    expect(
      canSendToAudience(driverAda, { scope: "car", driverUserId: ADA }),
    ).toBe(true);
  });

  it("refuses a driver naming another driver's car", () => {
    expect(
      canSendToAudience(driverAda, { scope: "car", driverUserId: CAI }),
    ).toBe(false);
  });

  it("refuses a rider, who is not driving, even naming their driver's car", () => {
    const rider: AudienceActor = {
      rank: "camp_member",
      leadTeams: [],
      userId: CAI,
      drivesCar: false,
    };
    expect(canSendToAudience(rider, { scope: "car", driverUserId: ADA })).toBe(
      false,
    );
    expect(canSendToAudience(rider, { scope: "car", driverUserId: CAI })).toBe(
      false,
    );
  });

  it("refuses a captain or a lead who is not driving, for any car", () => {
    for (const actor of [
      { ...captain, userId: ADA },
      { ...kitchenLead, userId: ADA },
    ]) {
      expect(
        canSendToAudience(actor, { scope: "car", driverUserId: ADA }),
      ).toBe(false);
      expect(
        canSendToAudience(actor, { scope: "car", driverUserId: CAI }),
      ).toBe(false);
    }
  });

  it("lets a captain who drives write to their own car only", () => {
    const drivingCaptain: AudienceActor = {
      ...captain,
      userId: ADA,
      drivesCar: true,
    };
    expect(
      canSendToAudience(drivingCaptain, { scope: "car", driverUserId: ADA }),
    ).toBe(true);
    expect(
      canSendToAudience(drivingCaptain, { scope: "car", driverUserId: CAI }),
    ).toBe(false);
  });

  it("fails closed on a missing car, a missing id, or an unknown rank", () => {
    expect(canSendToAudience(driverAda, { scope: "car" })).toBe(false);
    expect(
      canSendToAudience(driverAda, { scope: "car", driverUserId: null }),
    ).toBe(false);
    expect(
      canSendToAudience(
        { ...driverAda, userId: undefined },
        { scope: "car", driverUserId: ADA },
      ),
    ).toBe(false);
    expect(
      canSendToAudience(
        { ...driverAda, userId: "" },
        { scope: "car", driverUserId: "" },
      ),
    ).toBe(false);
    expect(
      canSendToAudience(
        { ...driverAda, rank: "owner" as never },
        { scope: "car", driverUserId: ADA },
      ),
    ).toBe(false);
  });

  it("does not widen any other scope for a plain member who drives", () => {
    for (const scope of [
      "everyone",
      "team",
      "team_leads",
      "drivers",
      "individual",
      "opt_in",
    ] as const) {
      expect(
        canSendToAudience(driverAda, {
          scope,
          team: "kitchen",
          driverUserId: ADA,
        }),
      ).toBe(false);
    }
  });
});
