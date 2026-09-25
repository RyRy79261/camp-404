// TERMINAL's shell: one line in, lines out, and sometimes a request to open a
// window. Pure, so every command and easter egg is tested without a browser.

import { formatRands, formatUsdLabel } from "./fee";
import { APP_LABELS, INKBLOT, SIGNUP_URL } from "./content";
import type { JoinData } from "./join-data";
import { teamFile } from "./teams";
import { APP_IDS, type AppId } from "./window-manager";

export type TermLine = { kind: "out" | "err" | "hi"; text: string };

export type TermResult = {
  lines: TermLine[];
  open?: AppId;
  clear?: boolean;
  exit?: boolean;
};

const out = (text: string): TermLine => ({ kind: "out", text });
const hi = (text: string): TermLine => ({ kind: "hi", text });
const err = (text: string): TermLine => ({ kind: "err", text });

export const PROMPT = "burner@404:~$";

export const WELCOME: readonly TermLine[] = [
  hi("CAMP 404 OS — TERMINAL"),
  out("Type 'help' to see what this machine can do."),
];

const HELP: readonly [string, string][] = [
  ["help", "this list"],
  ["whoami", "who you are (roughly)"],
  ["ls [teams|perks]", "list files"],
  ["cat <file>", "read a file: cat mission, cat quote, cat KITCHEN.EXE"],
  ["open <program>", "open a window: open map.gps"],
  ["captains", "who herds the cats"],
  ["fee", "what it costs"],
  ["apply", "join Camp 404"],
  ["clear", "clear the screen"],
  ["exit", "close the terminal"],
];

const DUCK = [
  "      __",
  "  ___( o)>   quack.",
  "  \\ <_. )",
  "   `---'   grey water emptied. the duck thanks you.",
];

function findApp(name: string): (typeof APP_IDS)[number] | undefined {
  const n = name.toLowerCase().replace(/\/$/, "");
  return APP_IDS.find(
    (id) => id === n || APP_LABELS[id].toLowerCase().replace(/\/$/, "") === n,
  );
}

function cat(target: string, data: JoinData): TermResult {
  const { readme, perks } = data.content;
  const t = target.toLowerCase();
  if (!t) return { lines: [err("cat: which file? try 'cat mission'")] };
  if (["mission", "readme", "readme.txt"].includes(t)) {
    return { lines: [hi(readme.heading), ...readme.paragraphs.map(out)] };
  }
  if (t === "quote") return { lines: [out(`“${readme.quote}”`)] };
  const team = data.teams.find((x) => teamFile(x).toLowerCase() === t);
  if (team) return { lines: [hi(team.label), out(team.description)] };
  const perk = perks.files.find((x) => x.file.toLowerCase() === t);
  if (perk) return { lines: [hi(perk.name), ...perk.paragraphs.map(out)] };
  return { lines: [err(`cat: ${target}: No such file. Lost, like us.`)] };
}

/** Run one line. `data` is the site's live data, so answers match the windows. */
export function runCommand(input: string, data: JoinData): TermResult {
  const { fee } = data.content;
  const line = input.trim();
  if (!line) return { lines: [] };
  const [rawCmd = "", ...rest] = line.split(/\s+/);
  const cmd = rawCmd.toLowerCase();
  const arg = rest.join(" ");
  const lower = line.toLowerCase();

  // Easter eggs first: they are whole phrases, not commands.
  if (lower === INKBLOT.password) {
    return {
      lines: INKBLOT.unlocked.map((t, i) => (i === 0 ? hi(t) : out(t))),
      open: "inkblot",
    };
  }
  if (lower === "sudo coup chef" || lower === "sudo overthrow chef") {
    return {
      lines: [
        hi("[sudo] staging a coup to overthrow the chef…"),
        out("The chef has been overthrown. You are the chef now."),
        out("Dinner is at ~5. Nobody told you? Better get chopping."),
      ],
    };
  }
  if (lower === "walk duck" || lower === "walk the duck") {
    return { lines: DUCK.map(out) };
  }
  if (cmd === "sudo") {
    return {
      lines: [
        err(
          "Nice try. This incident will be reported to the Chief Cat Herder.",
        ),
      ],
    };
  }
  if (cmd === "rm") {
    return {
      lines: [
        err("MOOP detected. Nothing leaves a trace here, not even files."),
      ],
    };
  }
  if (lower === "404") return { lines: [hi("ERROR 404: YOU ARE HERE")] };
  if (cmd === "meow") {
    return {
      lines: [out("Now Now Meow Meow is warming up its engine. =^.^=")],
    };
  }
  if (cmd === "coffee" || lower === "make coffee") {
    return { lines: [err("418: I'm a teapot. Bring your own coffee gear.")] };
  }

  switch (cmd) {
    case "help":
      return {
        lines: [
          ...HELP.map(([c, d]) => out(`${c.padEnd(18)} ${d}`)),
          out("…and a few things we're not telling you about."),
        ],
      };
    case "whoami":
      return {
        lines: [
          out(
            "uid=404(burner) gid=404(misfits) groups=lost,tomfoolery,nonsense",
          ),
          out("You are lost. That's the point. You're in the right place."),
        ],
      };
    case "pwd":
      return { lines: [out("/tankwa-town/plot-43/blanket-fort")] };
    case "cd":
      return {
        lines: [err("cd: you can't leave. Nobody finds their way out.")],
      };
    case "ls": {
      const dir = arg.toLowerCase().replace(/\/$/, "");
      if (!dir)
        return { lines: [out(APP_IDS.map((id) => APP_LABELS[id]).join("  "))] };
      if (dir === "teams")
        return { lines: data.teams.map((t) => out(teamFile(t))) };
      if (dir === "perks")
        return { lines: data.content.perks.files.map((f) => out(f.file)) };
      return { lines: [err(`ls: ${arg}: No such directory.`)] };
    }
    case "cat":
      return cat(arg, data);
    case "open": {
      const id = findApp(arg);
      if (!id) return { lines: [err(`open: ${arg || "what"}? Try 'ls'.`)] };
      return { lines: [out(`Opening ${APP_LABELS[id]}…`)], open: id };
    }
    case "captains":
      return {
        lines: data.captains.length
          ? data.captains.map((c) => out(`${c.name.padEnd(8)} ${c.title}`))
          : [out("Still being herded.")],
      };
    case "fee":
      return {
        lines: [
          hi("Camp fee: a floating scale, not a fixed fee."),
          ...fee.tiers.map((t) =>
            out(
              `${t.name.padEnd(14)} ${formatRands(t.rands).padStart(8)}  ${formatUsdLabel(t.rands, fee.usdRate.randsPerDollar)}`,
            ),
          ),
          out(fee.subsidy.note),
          out(fee.intro),
          out("Budget your Burn: open fee.calc"),
        ],
        open: "fee",
      };
    case "apply":
      return {
        lines: [
          hi("Launching APPLY.EXE…"),
          out("You need an invite code. Then sign up:"),
          out(SIGNUP_URL),
        ],
        open: "apply",
      };
    case "echo":
      return { lines: [out(arg)] };
    case "hello":
    case "hi":
      return { lines: [out("Hello, lost one.")] };
    case "clear":
      return { lines: [], clear: true };
    case "exit":
    case "logout":
      return { lines: [], exit: true };
    default:
      return {
        lines: [err(`404: command not found: ${rawCmd}. Try 'help'.`)],
      };
  }
}
