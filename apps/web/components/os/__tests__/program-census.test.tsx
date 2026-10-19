import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import { buildProgramManifest, type ProgramFacts } from "@/lib/programs";
import {
  PROGRAM_ROUTES,
  PROGRAM_TITLES,
  matchProgram,
  type ProgramId,
} from "@/lib/program-routes";
import { pageSize } from "../desktop-controller";
import { iconFor } from "../program-icons";

// The census of every program as a member meets it: the manifest each kind of
// member gets (icons, folders, team folders, Start menu, search, version), and
// for each program its title, the window a URL opens, its drawing and its
// opening size. A refactor of where these are written down must leave every
// line of the snapshot as it was; a real change to what members see updates
// it on purpose.

function facts(over: Partial<ProgramFacts>): ProgramFacts {
  return {
    mode: "full",
    approved: true,
    rank: ViewerRank.enum.camp_member,
    memberships: [],
    teams: DEFAULT_TEAMS,
    hasLift: false,
    inbox: 0,
    healthWarnings: 0,
    ...over,
  };
}

const MEMBERS: Record<string, ProgramFacts> = {
  captain: facts({
    rank: ViewerRank.enum.captain,
    memberships: [{ team: Team.enum.structures, isLead: false }],
  }),
  financeLead: facts({
    rank: ViewerRank.enum.team_lead,
    memberships: [{ team: Team.enum.finance, isLead: true }],
  }),
  kitchenLead: facts({
    rank: ViewerRank.enum.team_lead,
    memberships: [
      { team: Team.enum.kitchen, isLead: true },
      { team: Team.enum.power_and_lighting, isLead: false },
    ],
  }),
  member: facts({
    memberships: [{ team: Team.enum.transport_and_logistics, isLead: false }],
    hasLift: true,
  }),
  applicant: facts({ mode: "restricted", approved: false }),
  held: facts({ mode: "held" }),
};

const sample = (pattern: string) =>
  pattern.replace(/\[([^\]]+)\]/g, (_m, name: string) => `sample-${name}`);

const lineOf = (key: string) =>
  (iconFor(key)("c") as ReactElement<{ name: string }>).props.name;

describe("program census", () => {
  for (const [who, f] of Object.entries(MEMBERS)) {
    it(`gives the ${who} the same manifest`, () => {
      expect(buildProgramManifest(f)).toMatchSnapshot();
    });
  }

  it("gives every program the same title, drawing and opening size", () => {
    const census = Object.fromEntries(
      (Object.keys(PROGRAM_TITLES) as ProgramId[]).sort().map((id) => [
        id,
        {
          title: PROGRAM_TITLES[id],
          line: lineOf(id),
          small: pageSize(id, { width: 1280, height: 720 }),
          wide: pageSize(id, { width: 1920, height: 1080 }),
        },
      ]),
    );
    expect(census).toMatchSnapshot();
    expect(
      Object.fromEntries(
        ["folder", "member-folder", "kitchen", "team", "nope"].map((k) => [
          k,
          lineOf(k),
        ]),
      ),
    ).toMatchSnapshot();
  });

  it("opens the same window for every console page", () => {
    const routes = PROGRAM_ROUTES.map((r) => r.pattern)
      .sort()
      .map((pattern) => [pattern, matchProgram(sample(pattern))]);
    expect(routes).toMatchSnapshot();
  });
});
