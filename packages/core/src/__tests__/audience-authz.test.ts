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
