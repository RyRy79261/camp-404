import { describe, expect, it } from "vitest";
import type { Team } from "@camp404/types";
import {
  CAPTAIN_ONLY,
  NOBODY,
  captainOrLeadOf,
  toActor,
  type Actor,
  type Rule,
} from "../actor";
import { LAYOUT_EDITOR, LAYOUT_SHARER } from "../camp-layout";
import { MONEY_KEEPER } from "../dues";
import {
  ATTENDANCE_ASKER,
  DEADLINE_KEEPER,
  LOGISTICS_EDITOR,
} from "../logistics";
import { LOUNGE_RUNNER } from "../lounge";
import { POWER_EDITOR } from "../power";
import { KITCHEN_REVIEWER } from "../recipes";
import { RENTAL_MANAGER } from "../rental";
import { SHIFT_ASKER } from "../shifts";
import { LEAD_PICKER } from "../team-roles";
import { TRANSPORT_EDITOR } from "../transport";

// Every named rule against the same five actors. A captain-or-lead rule names
// its team; a captain-only rule has none.

const RULES: readonly { name: string; rule: Rule; team: Team | null }[] = [
  { name: "MONEY_KEEPER", rule: MONEY_KEEPER, team: "finance" },
  { name: "POWER_EDITOR", rule: POWER_EDITOR, team: "power_and_lighting" },
  {
    name: "TRANSPORT_EDITOR",
    rule: TRANSPORT_EDITOR,
    team: "transport_and_logistics",
  },
  {
    name: "LOGISTICS_EDITOR",
    rule: LOGISTICS_EDITOR,
    team: "transport_and_logistics",
  },
  { name: "LOUNGE_RUNNER", rule: LOUNGE_RUNNER, team: "ministry_of_vibes" },
  { name: "LAYOUT_EDITOR", rule: LAYOUT_EDITOR, team: "structures" },
  { name: "KITCHEN_REVIEWER", rule: KITCHEN_REVIEWER, team: "kitchen" },
  { name: "RENTAL_MANAGER", rule: RENTAL_MANAGER, team: null },
  { name: "LAYOUT_SHARER", rule: LAYOUT_SHARER, team: null },
  { name: "ATTENDANCE_ASKER", rule: ATTENDANCE_ASKER, team: null },
  { name: "DEADLINE_KEEPER", rule: DEADLINE_KEEPER, team: null },
  { name: "SHIFT_ASKER", rule: SHIFT_ASKER, team: null },
  { name: "LEAD_PICKER", rule: LEAD_PICKER, team: null },
  { name: "CAPTAIN_ONLY", rule: CAPTAIN_ONLY, team: null },
];

/** A team that is never the rule's own. */
function otherTeam(team: Team | null): Team {
  return team === "finance" ? "kitchen" : "finance";
}

describe.each(RULES)("$name", ({ rule, team }) => {
  const own = team ?? "finance";
  const cases: [string, Actor | null | undefined, boolean][] = [
    ["a captain", { rank: "captain", ledTeams: [] }, true],
    ["a lead of the team", { rank: "team_lead", ledTeams: [own] }, !!team],
    [
      "a lead of another team",
      { rank: "team_lead", ledTeams: [otherTeam(team)] },
      false,
    ],
    ["a member", { rank: "camp_member", ledTeams: [] }, false],
    [
      "a member with a lead row",
      { rank: "camp_member", ledTeams: [own] },
      false,
    ],
    ["an unknown rank", toActor("god", [own]), false],
    ["a forged rank", { rank: "god" as Actor["rank"], ledTeams: [own] }, false],
    ["nobody", null, false],
  ];
  it.each(cases)("%s: %s", (_label, actor, expected) => {
    expect(rule.allows(actor)).toBe(expected);
  });
});

describe("captainOrLeadOf", () => {
  it("allows nobody, a captain included, for a key that is not a team", () => {
    const rule = captainOrLeadOf("not_a_team");
    expect(rule.allows({ rank: "captain", ledTeams: [] })).toBe(false);
    expect(rule).toBe(NOBODY);
  });
});

describe("toActor", () => {
  it("fails closed on a rank it does not know", () => {
    expect(toActor("admin", ["finance"])).toBeNull();
  });

  it("drops a key that is not a team", () => {
    expect(toActor("team_lead", ["finance", "nope"])).toEqual({
      rank: "team_lead",
      ledTeams: ["finance"],
    });
  });
});
