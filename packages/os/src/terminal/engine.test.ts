import { describe, expect, it } from "vitest";
import {
  EMPTY_HISTORY,
  err,
  hi,
  out,
  parseLine,
  recall,
  remember,
  runCommand,
  type CommandTable,
} from "./engine";

type Program = "readme" | "game";

// A small app's commands, standing in for Join's or the console's.
const TABLE: CommandTable<Program, { name: string }> = {
  phrases: [
    ({ lower }) =>
      lower === "open sesame"
        ? { lines: [hi("A secret.")], open: "game" }
        : undefined,
    () => undefined,
  ],
  commands: {
    whoami: (_line, { name }) => ({ lines: [out(name)] }),
    echo: ({ arg }) => ({ lines: [out(arg)] }),
    read: () => ({ lines: [], open: "readme" }),
  },
};

const run = (input: string) => runCommand(input, TABLE, { name: "Jinn" });

describe("parseLine", () => {
  it("splits the command word from the rest, and keeps what was typed", () => {
    expect(parseLine("  ECHO   hello   there ")).toEqual({
      line: "ECHO   hello   there",
      lower: "echo   hello   there",
      rawCmd: "ECHO",
      cmd: "echo",
      arg: "hello there",
    });
  });

  it("says a blank line is nothing", () => {
    expect(parseLine("   ")).toBeNull();
  });
});

describe("runCommand", () => {
  it("runs a command from the table, with the app's data", () => {
    expect(run("whoami").lines).toEqual([out("Jinn")]);
    expect(run("WhoAmI").lines).toEqual([out("Jinn")]);
    expect(run("echo a  b").lines).toEqual([out("a b")]);
    expect(run("read").open).toBe("readme");
  });

  it("tries whole phrases before command words", () => {
    expect(run("Open Sesame")).toEqual({
      lines: [hi("A secret.")],
      open: "game",
    });
  });

  it("clear and exit say so; blank input does nothing", () => {
    expect(run("clear").clear).toBe(true);
    expect(run("exit").exit).toBe(true);
    expect(run("logout").exit).toBe(true);
    expect(run("   ").lines).toEqual([]);
  });

  it("lets the app's own table replace a built-in", () => {
    const table: CommandTable<Program, null> = {
      commands: { exit: () => ({ lines: [err("You can't leave.")] }) },
    };
    expect(runCommand("exit", table, null)).toEqual({
      lines: [err("You can't leave.")],
    });
  });

  it("answers an unknown command with a 404", () => {
    const r = run("frobnicate now");
    expect(r.lines[0]).toMatchObject({ kind: "err" });
    expect(r.lines[0]!.text).toContain("404: command not found: frobnicate");
  });

  it("never runs an object's inherited keys as commands", () => {
    for (const word of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(run(word).lines[0]!.text).toContain("404: command not found");
    }
  });

  it("uses the app's own answer for an unknown word", () => {
    const table: CommandTable<Program, null> = {
      commands: {},
      unknown: ({ rawCmd }) => ({ lines: [out(`What is ${rawCmd}?`)] }),
    };
    expect(runCommand("Zap", table, null).lines).toEqual([out("What is Zap?")]);
  });
});

describe("history", () => {
  it("keeps what was typed, and skips blank lines", () => {
    const h = remember(remember(remember(EMPTY_HISTORY, "ls"), "  "), "fee");
    expect(h).toEqual({ entries: ["ls", "fee"], cursor: 2 });
  });

  it("walks back with up and forward with down, to an empty prompt", () => {
    let h = remember(remember(EMPTY_HISTORY, "ls"), "fee");
    const steps: string[] = [];
    for (const by of [-1, -1, -1, 1, 1]) {
      const next = recall(h, by)!;
      h = next.history;
      steps.push(next.value);
    }
    expect(steps).toEqual(["fee", "ls", "ls", "fee", ""]);
  });

  it("recalls nothing before anything was typed", () => {
    expect(recall(EMPTY_HISTORY, -1)).toBeNull();
  });
});
