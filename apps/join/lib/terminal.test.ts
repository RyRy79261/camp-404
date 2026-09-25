import { describe, expect, it } from "vitest";
import { APPLY_URL, TEAMS } from "./content";
import { runCommand } from "./terminal";

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

  it("apply prints the form link and opens APPLY.EXE", () => {
    const r = runCommand("apply");
    expect(r.open).toBe("apply");
    expect(text("apply")).toContain(APPLY_URL);
  });

  it("fee shows rands and opens the calculator", () => {
    const r = runCommand("fee");
    expect(r.open).toBe("fee");
    expect(text("fee")).toMatch(/R\d{1,2},\d{3}/);
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

  it("clear and exit say so; blank input does nothing", () => {
    expect(runCommand("clear").clear).toBe(true);
    expect(runCommand("exit").exit).toBe(true);
    expect(runCommand("   ").lines).toEqual([]);
  });

  it("answers an unknown command with a 404", () => {
    const r = runCommand("frobnicate now");
    expect(r.lines[0]).toMatchObject({ kind: "err" });
    expect(r.lines[0]!.text).toContain("404: command not found: frobnicate");
  });
});
