// The console's Terminal (owner, 2026-09-25: "We do need the terminal"): its
// command set, over the member's own manifest. The shell that runs it
// (parsing, clear, exit, history, the 404 for an unknown word) is
// @camp404/os/terminal's; this file is only what each command answers.
//
// A plain module, shipped to the browser with the Terminal window. It reads
// and writes no data: every answer comes from the context the page hands in,
// which is the member's client manifest (their own programs, already
// filtered on the server) and the name and rank the desktop already shows
// them. So `open` can only open a program the member has an icon for, and a
// program they do not have answers exactly as one that does not exist: the
// Terminal never says a captain program is there.
//
// Only type imports from lib/programs.ts, which is server-only.

import {
  err,
  hi,
  out,
  runCommand as run,
  type CommandTable,
  type TermLine,
  type TermResult,
} from "@camp404/os/terminal";
import type { ProgramManifest } from "./programs";

/** One program the member has, as the Terminal knows it. */
export interface TerminalProgram {
  id: string;
  label: string;
  fileName: string;
  href: string;
  /** The column it sits in: me, camp or captains. */
  group: string;
  /** The folder it is in, by name ("Kitchen"), or null on the desktop. */
  folder: string | null;
}

export interface TerminalContext {
  programs: readonly TerminalProgram[];
  /** The groups, in desktop order, as the Start menu names them. */
  groups: readonly { id: string; label: string }[];
  /** Their name and rank label, as the Start menu already shows them. */
  whoami: { name: string; rank: string };
}

/** What `open` hands the window: a program's id; INKBLOT is its own. */
export const INKBLOT_ID = "inkblot";
export const INKBLOT_HREF = "/terminal/inkblot";

/** INKBLOT.EXE's words (the game package holds no app's copy). */
export const INKBLOT_COPY = {
  title: "INKBLOT.EXE",
  tagline: "You are a black cat. Everything on every surface must go.",
  controls: "← → move · ↑ or Space jump · ↓ hop down · X swipe · R restart",
  touch: "Use the buttons below to move, jump and swipe.",
  start: "Press any key or tap to start",
  winTitle: "GOODEST BOI",
  winLine: "Everything is on the floor.",
  boardNote: "Scores live in this browser only.",
  againButton: "Knock it all over again",
} as const;

export const WELCOME: readonly TermLine[] = [
  hi("CAMP 404 OS — TERMINAL"),
  out("Type 'help' to see what this machine can do."),
];

// Never a cat or a game here (visual-language doc 4.6: "if you know you
// know"). The last line is the prototype's, and names nothing.
const HELP: readonly [string, string][] = [
  ["help", "this list"],
  ["ls [folder]", "list your programs, or what a folder holds"],
  ["open <program>", "open a program: open tasks"],
  ["whoami", "who is signed in"],
  ["clear", "clear the screen"],
  ["exit", "close the terminal"],
];
const HELP_TAIL = "…and a few things we're not telling you about.";

/** The password that opens INKBLOT, the same as on the Join site. */
export const INKBLOT_PASSWORD = "jinn-is-best";

/**
 * What a cat command asks the desktop for besides its lines (the approved
 * prototype's): paw prints behind the pointer ("meow", again to stop), or
 * Jinn peeking over the focused window at once ("sudo feed cat").
 */
export const TERMINAL_EFFECTS = ["paws", "peek"] as const;
export type TerminalEffect = (typeof TERMINAL_EFFECTS)[number];

export function isTerminalEffect(value: string): value is TerminalEffect {
  return (TERMINAL_EFFECTS as readonly string[]).includes(value);
}

/** A typed name, loosened: case, a trailing file extension, extra spaces. */
function loose(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function withoutExtension(text: string): string {
  return text.replace(/\.[a-z]{2,4}$/, "");
}

/** The member's program a typed name means, if they have one. */
export function findProgram(
  name: string,
  programs: readonly TerminalProgram[],
): TerminalProgram | undefined {
  const n = loose(name);
  if (!n) return undefined;
  return (
    programs.find(
      (p) =>
        loose(p.label) === n ||
        p.id === n ||
        loose(p.fileName) === n ||
        withoutExtension(loose(p.fileName)) === n,
    ) ?? programs.find((p) => loose(p.label) === withoutExtension(n))
  );
}

function ls(arg: string, ctx: TerminalContext): TermResult<string> {
  const folder = loose(arg).replace(/\/$/, "");
  // `ls -a` shows the hidden file too, and nothing else ever names it.
  if (folder === "-a" || folder === "-la" || folder === "-al") {
    const all = ls("", ctx);
    return { lines: [...all.lines, out(".cat")] };
  }
  if (folder) {
    const inside = ctx.programs.filter(
      (p) => p.folder !== null && loose(p.folder) === folder,
    );
    // A folder they do not have reads the same as one that is not there.
    if (inside.length === 0) {
      return { lines: [err(`ls: ${arg}: No such folder.`)] };
    }
    return { lines: [out(inside.map((p) => p.label).join("  "))] };
  }
  const lines: TermLine[] = [];
  for (const group of ctx.groups) {
    const inGroup = ctx.programs.filter((p) => p.group === group.id);
    if (inGroup.length === 0) continue;
    const names: string[] = [];
    for (const p of inGroup) {
      const name = p.folder === null ? p.label : `${p.folder}/`;
      if (!names.includes(name)) names.push(name);
    }
    lines.push(hi(group.label.toUpperCase()), out(`  ${names.join("  ")}`));
  }
  return { lines: lines.length ? lines : [out("Nothing here yet.")] };
}

// The two cats' files (the approved prototype's words), `cat` and `cat .cat`.
const CAT_ART: readonly string[] = [
  " /\\_/\\ ",
  "( o.o )   Two cats live here. Jinn, head of camp security,",
  " > ^ <    and Prince, asleep on the clock. Try 'cat jinn'.",
];

function catFile(arg: string): TermResult<string> {
  const file = loose(arg)
    .replace(/^~\//, "")
    .replace(/\.txt$/, "");
  if (!file) return { lines: CAT_ART.map(out) };
  if (file === "jinn") {
    return {
      lines: [
        hi("JINN.TXT"),
        out("Black. Shiny. Knocks things off tables for sport."),
        out("Has a password somewhere. It is not 'password'."),
      ],
    };
  }
  if (file === "prince") {
    return {
      lines: [
        hi("PRINCE.TXT"),
        out("White and fluffy, black cap, black tail like a feather duster."),
        out("Sleeps on the clock, so time passes. Do not wake him."),
      ],
    };
  }
  if (file === ".cat") {
    return {
      lines: [
        out("You found the hidden file. Jinn found it first."),
        out(`Hint: ${INKBLOT_PASSWORD.replace(/[aeiou]/g, "_")}`),
      ],
    };
  }
  return { lines: [err(`cat: ${arg}: No such file. A cat sat on it.`)] };
}

export const CONSOLE_COMMANDS: CommandTable<string, TerminalContext> = {
  // Whole phrases first: the easter eggs, which `help` never lists.
  phrases: [
    ({ lower }) =>
      lower === INKBLOT_PASSWORD
        ? {
            lines: [
              hi("ACCESS GRANTED. Jinn is, in fact, best."),
              out("Launching INKBLOT.EXE…"),
            ],
            open: INKBLOT_ID,
          }
        : undefined,
    ({ lower }) => {
      const said = lower.replace(/\s+/g, " ");
      if (said === "sudo feed cat" || said === "sudo feed the cat") {
        return {
          lines: [
            hi("[sudo] opening a tin…"),
            out("Jinn appears from nowhere. Jinn was always here."),
            out("Purring at 404 Hz. Watch the top of your windows."),
          ],
          effect: "peek" satisfies TerminalEffect,
        };
      }
      if (said === "feed cat" || said === "feed the cat") {
        return {
          lines: [
            err("Permission denied. Only captains with sudo may open the tin."),
          ],
        };
      }
      return undefined;
    },
    ({ cmd }) =>
      cmd === "meow"
        ? {
            lines: [
              out(
                "meow? =^.^=  Little paws follow your pointer now. 'meow' again stops them.",
              ),
            ],
            effect: "paws" satisfies TerminalEffect,
          }
        : undefined,
    ({ cmd, arg }) =>
      cmd === "pet" || cmd === "purr"
        ? {
            lines: [
              out("prrrrrrrrrrrrr…"),
              out(
                arg
                  ? `${arg} tolerates it. For now.`
                  : "Jinn leans into it, then bites you. Affectionately.",
              ),
            ],
          }
        : undefined,
    ({ cmd, arg }) => (cmd === "cat" ? catFile(arg) : undefined),
    ({ cmd }) =>
      cmd === "sudo"
        ? { lines: [err("Nice try. Even captains answer to the cat.")] }
        : undefined,
  ],
  commands: {
    help: () => ({
      lines: [
        ...HELP.map(([c, d]) => out(`${c.padEnd(16)} ${d}`)),
        out(HELP_TAIL),
      ],
    }),
    ls: ({ arg }, ctx) => ls(arg, ctx),
    open: ({ arg }, ctx) => {
      if (!arg.trim()) return { lines: [err("open: what? Try 'ls'.")] };
      const program = findProgram(arg, ctx.programs);
      // Not theirs and not there answer the same.
      if (!program) {
        return { lines: [err(`open: ${arg}: not found. Try 'ls'.`)] };
      }
      return { lines: [out(`Opening ${program.label}…`)], open: program.id };
    },
    whoami: (_line, ctx) => ({
      lines: [out(`${ctx.whoami.name} (${ctx.whoami.rank})`)],
    }),
    play: ({ arg }) =>
      loose(arg) === "inkblot"
        ? { lines: [out("Launching INKBLOT.EXE…")], open: INKBLOT_ID }
        : { lines: [err(`play: ${arg || "what"}: not found.`)] },
  },
};

/** Run one line of the console's Terminal. */
export function runConsoleCommand(
  input: string,
  ctx: TerminalContext,
): TermResult<string> {
  return run(input, CONSOLE_COMMANDS, ctx);
}

/** Where `open` goes for a program id the command answered with. */
export function terminalHref(
  id: string,
  ctx: TerminalContext,
): string | undefined {
  if (id === INKBLOT_ID) return INKBLOT_HREF;
  return ctx.programs.find((p) => p.id === id)?.href;
}

/**
 * The Terminal's context, from the member's manifest: every program they have
 * an icon for (folders and team pages included), with each folder by its
 * name. Built on the server by the page and handed to the window as plain
 * data.
 */
export function terminalContext(
  manifest: Pick<ProgramManifest, "programs" | "folders" | "startMenu">,
  whoami: { name: string; rank: string },
): TerminalContext {
  const programs: TerminalProgram[] = [];
  const seen = new Set<string>();
  const add = (
    p: ProgramManifest["programs"][number],
    folder: string | null,
    group: string,
  ) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    programs.push({
      id: p.id,
      label: p.label,
      fileName: p.fileName,
      href: p.href,
      group,
      folder,
    });
  };
  for (const p of manifest.programs) add(p, null, p.group);
  for (const f of manifest.folders) {
    for (const p of f.programs) add(p, f.label, f.group);
  }
  return {
    programs,
    groups: manifest.startMenu.map((s) => ({ id: s.group, label: s.label })),
    whoami,
  };
}
