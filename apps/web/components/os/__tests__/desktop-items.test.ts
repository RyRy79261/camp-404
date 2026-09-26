import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { findFullPrefetches } from "@camp404/os/prefetch-guard";
import { Team, ViewerRank } from "@camp404/types";
import {
  PROGRAM_REGISTRY,
  buildProgramManifest,
  type ProgramFacts,
} from "@/lib/programs";
import { PROGRAM_TITLES } from "@/lib/program-routes";
import {
  allowedWindowPrograms,
  desktopEntries,
  desktopSpec,
  windowProgram,
} from "../desktop-items";

// What the desktop draws from a member's manifest and saved layout. Team keys
// and ranks come from the enums the code uses (AGENTS.md, "Verification").

const KITCHEN = Team.enum.kitchen;
const POWER = Team.enum.power_and_lighting;

function facts(over: Partial<ProgramFacts> = {}): ProgramFacts {
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

const EMPTY = { cells: {}, items: [] };

describe("desktopSpec", () => {
  it("lays the groups out as columns and the team folders down the right, led first", () => {
    const m = buildProgramManifest(
      facts({
        rank: ViewerRank.enum.team_lead,
        memberships: [
          { team: POWER, isLead: false },
          { team: KITCHEN, isLead: true },
        ],
      }),
    );
    const spec = desktopSpec(m, EMPTY);
    const [me, camp, captains] = spec.columns;
    // The approved prototype's columns: Tasks and Calendar with Me.
    expect(me).toEqual(expect.arrayContaining(["inbox", "tasks", "calendar"]));
    expect(camp).not.toContain("tasks");
    expect(camp).toEqual(
      expect.arrayContaining(["roster", "folder:teams", "folder:kitchen"]),
    );
    // The Terminal ends the Captains column, after the folder.
    expect(captains).toEqual(["folder:captains", "terminal"]);
    expect(spec.right).toEqual([
      `team-folder:${KITCHEN}`,
      `team-folder:${POWER}`,
    ]);
  });

  it("gives a plain member no Captains column: the Terminal ends Camp", () => {
    const spec = desktopSpec(buildProgramManifest(facts()), EMPTY);
    expect(spec.columns[2]).toEqual([]);
    expect(spec.columns[1]?.at(-1)).toBe("terminal");
  });
});

describe("desktopEntries", () => {
  it("draws the member's shortcuts and folders only from programs they have", () => {
    const m = buildProgramManifest(facts());
    const entries = desktopEntries(m, {
      cells: {},
      items: [
        { kind: "shortcut", id: "sc-1", target: "roster" },
        // A captain program a plain member does not have.
        { kind: "shortcut", id: "sc-2", target: "audit" },
        { kind: "folder", id: "uf-1", name: "Mine", items: ["tasks", "audit"] },
      ],
    });
    const mine = entries.filter(
      (e) => e.key === "sc-1" || e.key === "sc-2" || e.key === "uf-1",
    );
    expect(mine.map((e) => e.key)).toEqual(["sc-1", "uf-1"]);
    const folder = mine[1];
    expect(
      folder?.kind === "member-folder" && folder.programs.map((p) => p.id),
    ).toEqual(["tasks"]);
  });

  it("gives a member held before approval nothing but the wallpaper", () => {
    const m = buildProgramManifest(facts({ mode: "held", approved: false }));
    expect(desktopEntries(m, EMPTY)).toEqual([]);
  });
});

describe("allowedWindowPrograms", () => {
  it("allows the children a rank may open, and drops the rest", () => {
    const member = allowedWindowPrograms(buildProgramManifest(facts()), EMPTY);
    expect(member.has("meeting")).toBe(true);
    expect(member.has("results")).toBe(false);
    const captain = allowedWindowPrograms(
      buildProgramManifest(facts({ rank: ViewerRank.enum.captain })),
      EMPTY,
    );
    expect(captain.has("results")).toBe(true);
    expect(captain.has("folder:captains")).toBe(true);
  });

  it("prunes a team's page by its own id", () => {
    expect(windowProgram("team", `team:${KITCHEN}`)).toBe(`team:${KITCHEN}`);
    expect(windowProgram("meeting", "meeting:m-1")).toBe("meeting");
  });
});

describe("PROGRAM_TITLES (the browser's copy of the plain names)", () => {
  it("says what the registry says, for every program", () => {
    for (const entry of PROGRAM_REGISTRY) {
      if (entry.perTeam) continue;
      expect([entry.id, PROGRAM_TITLES[entry.id]]).toEqual([
        entry.id,
        entry.label,
      ]);
    }
  });
});

describe("no full prefetch of a program URL", () => {
  it("is never asked for anywhere in components/os", () => {
    const dir = path.resolve(__dirname, "..");
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !f.includes("__tests__"),
    );
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const found = findFullPrefetches(
        readFileSync(path.join(dir, file), "utf8"),
      );
      expect([file, found]).toEqual([file, []]);
    }
  });
});
