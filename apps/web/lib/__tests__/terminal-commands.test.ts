import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { Team, ViewerRank } from "@camp404/types";
import { buildProgramManifest, type ProgramFacts } from "../programs";
import {
  INKBLOT_HREF,
  INKBLOT_ID,
  runConsoleCommand,
  terminalContext,
  terminalHref,
} from "../terminal-commands";

// The console's Terminal over one member's manifest. Ranks and team keys come
// from the enums the code uses (AGENTS.md, "Verification").

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

const member = terminalContext(buildProgramManifest(facts()), {
  name: "Ada",
  rank: "Member",
});
const captain = terminalContext(
  buildProgramManifest(facts({ rank: ViewerRank.enum.captain })),
  { name: "Jo", rank: "Captain" },
);

const text = (input: string, ctx = member) =>
  runConsoleCommand(input, ctx)
    .lines.map((l) => l.text)
    .join("\n");

describe("open", () => {
  it("opens a program the member has, by its plain name, id or file name", () => {
    for (const typed of ["roster", "Roster", "ROSTER.DB", "roster.db"]) {
      const r = runConsoleCommand(`open ${typed}`, member);
      expect([typed, r.open]).toEqual([typed, "roster"]);
    }
    expect(terminalHref("roster", member)).toBe("/captains/camp-management");
    expect(runConsoleCommand("open meal plan", member).open).toBe("meal-plan");
  });

  it("opens a team's page by the team's name", () => {
    const r = runConsoleCommand("open kitchen", member);
    expect(r.open).toBe(`team:${Team.enum.kitchen}`);
    expect(terminalHref(r.open!, member)).toBe(`/teams/${Team.enum.kitchen}`);
  });

  it("answers a captain program as not found for a member, the same as nothing", () => {
    const audit = runConsoleCommand("open audit", member);
    const nothing = runConsoleCommand("open zzz", member);
    expect(audit.open).toBeUndefined();
    expect(audit.lines[0]!.text.replace("audit", "X")).toBe(
      nothing.lines[0]!.text.replace("zzz", "X"),
    );
    expect(text("open audit")).toMatch(/not found/);
    // A captain has it.
    expect(runConsoleCommand("open audit", captain).open).toBe("audit");
    expect(terminalHref("audit", member)).toBeUndefined();
  });
});

describe("ls", () => {
  it("lists the member's groups and programs, and no captain program", () => {
    const listed = text("ls");
    expect(listed).toMatch(/^ME$/m);
    expect(listed).toContain("Roster");
    expect(listed).toContain("Kitchen/");
    expect(listed).not.toMatch(/^CAPTAINS$/m);
    expect(listed).not.toContain("Audit log");
    expect(text("ls", captain)).toMatch(/^CAPTAINS$/m);
    expect(text("ls", captain)).toContain("Captains/");
  });

  it("lists a folder, and a folder they do not have reads as missing", () => {
    expect(text("ls kitchen")).toContain("Recipes");
    expect(text("ls captains")).toMatch(/No such folder/);
    expect(text("ls captains", captain)).toContain("Audit log");
  });
});

describe("the rest", () => {
  it("says who is signed in, as the Start menu does", () => {
    expect(text("whoami")).toBe("Ada (Member)");
  });

  it("plays INKBLOT, in its own window", () => {
    const r = runConsoleCommand("play inkblot", member);
    expect(r.open).toBe(INKBLOT_ID);
    expect(terminalHref(INKBLOT_ID, member)).toBe(INKBLOT_HREF);
    expect(runConsoleCommand("play chess", member).open).toBeUndefined();
  });

  it("never points at a cat or a game in help", () => {
    const help = text("help");
    expect(help).toContain("open <program>");
    expect(help.toLowerCase()).not.toMatch(/inkblot|cat|jinn|prince|meow|play/);
  });

  it("keeps its cat lines to the two real cats", () => {
    expect(text("cat jinn")).toContain("Jinn is best.");
    expect(text("cat prince")).toContain("Prince");
    expect(text("cat garfield")).toMatch(/No such file/);
  });

  it("clears and exits through the shell", () => {
    expect(runConsoleCommand("clear", member).clear).toBe(true);
    expect(runConsoleCommand("exit", member).exit).toBe(true);
    expect(text("frobnicate")).toMatch(/command not found/);
  });
});
