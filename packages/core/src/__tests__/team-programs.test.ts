import { describe, expect, it } from "vitest";
import { Team } from "@camp404/types";
import { canEditTeamProgram } from "../team-programs";

// Owner's ruling 1 (2026-09-27): only a captain, or a lead OF THAT TEAM, may
// change things in a team's program. Everyone else reads.

describe("canEditTeamProgram", () => {
  it("lets a captain change any team's program", () => {
    for (const team of Team.options) {
      expect(canEditTeamProgram("captain", [], team)).toBe(true);
    }
  });

  it("lets a lead change only the teams they lead", () => {
    expect(
      canEditTeamProgram(
        "team_lead",
        ["power_and_lighting"],
        "power_and_lighting",
      ),
    ).toBe(true);
    expect(canEditTeamProgram("team_lead", ["kitchen", "water"], "water")).toBe(
      true,
    );
    expect(
      canEditTeamProgram("team_lead", ["kitchen"], "power_and_lighting"),
    ).toBe(false);
    expect(canEditTeamProgram("team_lead", [], "kitchen")).toBe(false);
  });

  it("refuses a plain member, even one who names the team", () => {
    expect(canEditTeamProgram("camp_member", [], "water")).toBe(false);
    // A member is never a lead, whatever list reaches here.
    expect(canEditTeamProgram("camp_member", ["water"], "water")).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    // The stored rank is not a viewer rank: "member" must not pass for one.
    expect(canEditTeamProgram("member", ["water"], "water")).toBe(false);
    expect(canEditTeamProgram("founder", ["water"], "water")).toBe(false);
    expect(canEditTeamProgram("", [], "water")).toBe(false);
  });

  it("fails closed on a key that is not a team, a captain's included", () => {
    expect(canEditTeamProgram("captain", [], "moon")).toBe(false);
    expect(canEditTeamProgram("team_lead", ["moon"], "moon")).toBe(false);
    expect(canEditTeamProgram("captain", [], "")).toBe(false);
  });
});
