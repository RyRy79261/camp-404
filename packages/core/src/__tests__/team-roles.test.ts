import { describe, expect, it } from "vitest";
import { MAX_TEAM_ROLES, Team } from "@camp404/types";
import {
  KEEN_FULL,
  KEEN_HELD,
  LEAD_PLACES_BELOW,
  ROLE_CHANGED,
  ROLE_FULL,
  ROLE_GONE,
  ROLE_HAS_PEOPLE,
  ROLE_PLACES_BELOW,
  TOO_MANY_ROLES,
  keenProblem,
  leadPlacesProblem,
  newRoleProblem,
  roleChangeProblem,
  roleFullProblem,
  roleRemoveProblem,
  canManageTeamRoles,
  canPickTeamLead,
  helpWantedSummary,
  matchesHelpWantedFilter,
  orderHelpWanted,
  pickerGroups,
  roleAction,
  rolesOpenText,
  teamPlacesFilled,
  teamsNeedLeadText,
  type HelpWantedTeamShape,
} from "../team-roles";

// Help wanted (owner's pick A, 2026-10-09). A captain, or a lead OF THAT TEAM,
// runs a team's roles; only a captain gives the Lead role (it is the lead
// flag). Both fail closed.

describe("canManageTeamRoles", () => {
  it("lets a captain run every team's roles", () => {
    for (const team of Team.options) {
      expect(canManageTeamRoles("captain", [], team)).toBe(true);
    }
  });

  it("lets a lead run only the teams they lead", () => {
    expect(canManageTeamRoles("team_lead", ["kitchen"], "kitchen")).toBe(true);
    expect(canManageTeamRoles("team_lead", ["kitchen"], "structures")).toBe(
      false,
    );
    expect(canManageTeamRoles("team_lead", [], "kitchen")).toBe(false);
  });

  it("refuses a member, even one who names the team", () => {
    expect(canManageTeamRoles("camp_member", ["kitchen"], "kitchen")).toBe(
      false,
    );
  });

  it("fails closed on a rank or a team it does not know", () => {
    expect(canManageTeamRoles("member", ["kitchen"], "kitchen")).toBe(false);
    expect(canManageTeamRoles("", [], "kitchen")).toBe(false);
    expect(canManageTeamRoles("captain", [], "not_a_team")).toBe(false);
    expect(canManageTeamRoles("team_lead", ["nope"], "nope")).toBe(false);
  });
});

describe("canPickTeamLead", () => {
  it("is a captain's alone", () => {
    expect(canPickTeamLead("captain")).toBe(true);
    expect(canPickTeamLead("team_lead")).toBe(false);
    expect(canPickTeamLead("camp_member")).toBe(false);
    expect(canPickTeamLead("")).toBe(false);
  });
});

const team = (
  leads: number,
  roles: [number, number][],
  mine = false,
): HelpWantedTeamShape => ({
  lead: { filled: leads, places: 1 },
  roles: roles.map(([filled, places]) => ({ filled, places })),
  mine,
});

describe("the board's counts", () => {
  const teams = [
    team(1, [
      [2, 2],
      [1, 2],
    ]),
    team(0, [[0, 1]], true),
    team(0, []),
    team(2, [[3, 3]], true),
  ];

  it("counts teams with no lead and open roles, Lead aside", () => {
    const s = helpWantedSummary(teams);
    expect(s.teamsNeedingLead).toBe(2);
    expect(s.rolesOpen).toBe(2);
    expect(s.counts).toEqual({ all: 4, lead: 2, open: 2, mine: 2 });
  });

  it("filters by chip", () => {
    expect(teams.filter((t) => matchesHelpWantedFilter(t, "mine"))).toEqual([
      teams[1],
      teams[3],
    ]);
    expect(teams.filter((t) => matchesHelpWantedFilter(t, "open"))).toEqual([
      teams[0],
      teams[1],
    ]);
  });

  it("puts the teams that need a lead first, keeping their order", () => {
    expect(orderHelpWanted(teams)).toEqual([
      teams[1],
      teams[2],
      teams[0],
      teams[3],
    ]);
  });

  it("caps an over-filled role at its places", () => {
    expect(
      teamPlacesFilled(
        team(1, [
          [3, 2],
          [0, 4],
        ]),
      ),
    ).toEqual({
      filled: 2,
      places: 6,
    });
  });

  it("says it in plain words", () => {
    expect(teamsNeedLeadText(1)).toBe("1 team needs a lead");
    expect(teamsNeedLeadText(4)).toBe("4 teams need a lead");
    expect(rolesOpenText(1)).toBe("1 role open");
    expect(rolesOpenText(0)).toBe("0 roles open");
  });
});

describe("roleAction", () => {
  const base = {
    open: true,
    isLead: false,
    manages: false,
    picksLead: false,
    holds: false,
    keen: false,
  };

  it("gives a member I'm keen, Undo, Yours or Full", () => {
    expect(roleAction(base)).toBe("keen");
    expect(roleAction({ ...base, keen: true })).toBe("unkeen");
    expect(roleAction({ ...base, holds: true })).toBe("yours");
    expect(roleAction({ ...base, open: false })).toBe("full");
    expect(roleAction({ ...base, open: false, keen: true })).toBe("full");
  });

  it("gives a captain Pick someone on every open role, Lead included", () => {
    const cap = { ...base, manages: true, picksLead: true };
    expect(roleAction(cap)).toBe("pick");
    expect(roleAction({ ...cap, isLead: true })).toBe("pick");
    expect(roleAction({ ...cap, open: false })).toBe("full");
  });

  it("never gives a team's lead a Pick on Lead", () => {
    const lead = { ...base, manages: true };
    expect(roleAction(lead)).toBe("pick");
    expect(roleAction({ ...lead, isLead: true })).toBe("captain_picks");
    expect(roleAction({ ...lead, isLead: true, holds: true })).toBe("yours");
  });
});

describe("pickerGroups", () => {
  it("lists keen people first, then the team, then everyone else, without who fills it", () => {
    expect(
      pickerGroups({
        keen: ["kim", "yusuf", "ruan"],
        team: ["thandi", "yusuf", "ruan", "jas"],
        everyone: ["ann", "jas", "kim", "ruan", "thandi", "yusuf", "zed"],
        taken: ["ruan"],
      }),
    ).toEqual({
      keen: ["kim", "yusuf"],
      team: ["thandi", "jas"],
      rest: ["ann", "zed"],
    });
  });

  it("leaves out anyone who is not on the list of people who may be picked", () => {
    expect(
      pickerGroups({ keen: ["gone"], team: ["left"], everyone: [], taken: [] }),
    ).toEqual({ keen: [], team: [], rest: [] });
  });
});

describe("the writes' checks", () => {
  it("lets a team have up to the most roles, and no more", () => {
    expect(newRoleProblem(MAX_TEAM_ROLES - 1)).toBeNull();
    expect(newRoleProblem(MAX_TEAM_ROLES)).toBe(TOO_MANY_ROLES);
  });

  it("refuses a role change in the database's order", () => {
    const change = {
      team: "kitchen",
      askedTeam: "kitchen",
      version: 2,
      expectedVersion: 2,
      places: 2,
      filled: 2,
    };
    expect(roleChangeProblem(change)).toBeNull();
    expect(
      roleChangeProblem({
        ...change,
        askedTeam: "structures",
        expectedVersion: 1,
        places: 1,
      }),
    ).toBe(ROLE_GONE);
    expect(
      roleChangeProblem({ ...change, expectedVersion: 1, places: 1 }),
    ).toBe(ROLE_CHANGED);
    expect(roleChangeProblem({ ...change, places: 1 })).toBe(ROLE_PLACES_BELOW);
  });

  it("removes only a role nobody fills, at the version seen", () => {
    const ask = { version: 1, expectedVersion: 1, filled: 0 };
    expect(roleRemoveProblem(ask)).toBeNull();
    expect(roleRemoveProblem({ ...ask, expectedVersion: 2, filled: 1 })).toBe(
      ROLE_CHANGED,
    );
    expect(roleRemoveProblem({ ...ask, filled: 1 })).toBe(ROLE_HAS_PEOPLE);
  });

  it("never wants fewer leads than lead the team", () => {
    expect(leadPlacesProblem(2, 2)).toBeNull();
    expect(leadPlacesProblem(1, 2)).toBe(LEAD_PLACES_BELOW);
  });

  it("gives a role only while a place is open", () => {
    expect(roleFullProblem({ filled: 1, places: 2 })).toBeNull();
    expect(roleFullProblem({ filled: 2, places: 2 })).toBe(ROLE_FULL);
  });

  it("refuses I'm keen on a role the member fills, then on a full one", () => {
    expect(keenProblem({ filled: 0, places: 1, holds: false })).toBeNull();
    expect(keenProblem({ filled: 1, places: 1, holds: true })).toBe(KEEN_HELD);
    expect(keenProblem({ filled: 1, places: 1, holds: false })).toBe(KEEN_FULL);
  });
});
