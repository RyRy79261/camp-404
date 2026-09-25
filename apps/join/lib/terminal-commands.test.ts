import { describe, expect, it } from "vitest";
import { SIGNUP_URL } from "./content";
import { DEFAULT_JOIN_DATA, type JoinData } from "./join-data";
import { runCommand as run } from "./terminal-commands";

const TEAMS = DEFAULT_JOIN_DATA.teams;
const runCommand = (input: string, data: JoinData = DEFAULT_JOIN_DATA) =>
  run(input, data);

const text = (input: string) =>
  runCommand(input)
    .lines.map((l) => l.text)
    .join("\n");

describe("runCommand", () => {
  it("lists every command in help", () => {
    for (const c of ["whoami", "ls", "cat", "fee", "apply"]) {
      expect(text("help")).toContain(c);
    }
  });

  it("lists the teams folder, one file per team", () => {
    expect(runCommand("ls teams").lines).toHaveLength(TEAMS.length);
    expect(runCommand("ls TEAMS/").lines).toHaveLength(TEAMS.length);
  });

  it("reads the mission and a team file, ignoring case", () => {
    expect(text("cat mission")).toContain("place for the lost");
    expect(text("cat kitchen.exe")).toContain("cooking shifts");
  });

  it("apply prints the sign-up link and opens APPLY.EXE", () => {
    const r = runCommand("apply");
    expect(r.open).toBe("apply");
    expect(text("apply")).toContain(SIGNUP_URL);
  });

  it("fee shows the sliding scale in rands with dollar labels", () => {
    const r = runCommand("fee");
    expect(r.open).toBe("fee");
    expect(text("fee")).toMatch(/Ideal\s+R8,000\s+≈ \$500/);
    expect(text("fee")).toContain("Perfect World");
  });

  it("opens a program by its desktop name", () => {
    expect(runCommand("open MAP.GPS").open).toBe("map");
    expect(runCommand("open teams/").open).toBe("teams");
    expect(runCommand("open nowhere").open).toBeUndefined();
  });

  it("keeps its easter eggs", () => {
    expect(text("sudo coup chef")).toContain("You are the chef now");
    expect(text("walk duck")).toContain("quack");
    expect(text("sudo rm -rf /")).toContain("Chief Cat Herder");
  });

  it("keeps the rest of its answers and eggs", () => {
    expect(text("whoami")).toContain("You are lost");
    expect(text("pwd")).toBe("/tankwa-town/plot-43/blanket-fort");
    expect(text("cd /")).toContain("you can't leave");
    expect(text("echo  lost   again")).toBe("lost again");
    expect(text("hello")).toBe("Hello, lost one.");
    expect(text("hi")).toBe("Hello, lost one.");
    expect(text("rm -rf /")).toContain("MOOP detected");
    expect(text("404")).toBe("ERROR 404: YOU ARE HERE");
    expect(text("meow")).toContain("Now Now Meow Meow");
    expect(text("make coffee")).toContain("418");
    expect(text("coffee")).toContain("418");
    expect(text("cat quote")).toMatch(/^“.+”$/);
    expect(text("cat")).toContain("which file?");
    expect(text("cat nothing.txt")).toContain("No such file");
    expect(text("ls perks")).toBe(
      DEFAULT_JOIN_DATA.content.perks.files.map((f) => f.file).join("\n"),
    );
    expect(text("ls nowhere")).toContain("No such directory");
    const perk = DEFAULT_JOIN_DATA.content.perks.files[0]!;
    expect(runCommand(`cat ${perk.file}`).lines[0]?.text).toBe(perk.name);
  });

  it("keeps a secret: jinn-is-best opens INKBLOT.EXE, and help never says so", () => {
    expect(runCommand("jinn-is-best").open).toBe("inkblot");
    expect(runCommand("JINN-IS-BEST").open).toBe("inkblot");
    expect(text("help").toLowerCase()).not.toContain("inkblot");
    expect(text("ls").toLowerCase()).not.toContain("inkblot");
    expect(runCommand("open inkblot").open).toBeUndefined();
  });

  it("answers from the live data it is given", () => {
    const data: JoinData = {
      ...DEFAULT_JOIN_DATA,
      teams: [{ key: "sound", label: "Sound", description: "Bass." }],
      captains: [],
    };
    expect(runCommand("ls teams", data).lines.map((l) => l.text)).toEqual([
      "SOUND.WAV",
    ]);
    expect(runCommand("cat sound.wav", data).lines[1]?.text).toBe("Bass.");
    expect(runCommand("captains", data).lines[0]?.text).toContain("herded");
  });

  it("keeps the shell's own clear, exit and 404", () => {
    expect(runCommand("clear").clear).toBe(true);
    expect(runCommand("exit").exit).toBe(true);
    expect(text("frobnicate now")).toContain(
      "404: command not found: frobnicate",
    );
  });
});
