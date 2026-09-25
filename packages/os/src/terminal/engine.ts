// The terminal's shell: one line in, lines out, and sometimes a request to
// open a program. Pure, so every command is tested without a browser. The
// commands are the app's: it hands in a table, generic over its own program
// key and whatever data its answers read.

export type TermLine = { kind: "out" | "err" | "hi"; text: string };

export type TermResult<K extends string = string> = {
  lines: TermLine[];
  /** Open (or raise) this program once the output has shown. */
  open?: K;
  clear?: boolean;
  exit?: boolean;
};

export const out = (text: string): TermLine => ({ kind: "out", text });
export const hi = (text: string): TermLine => ({ kind: "hi", text });
export const err = (text: string): TermLine => ({ kind: "err", text });

export const PROMPT = "burner@404:~$";

/** One typed line, taken apart. */
export type ParsedLine = {
  /** Trimmed, as typed. */
  line: string;
  /** Trimmed and lower case, for whole-phrase matches. */
  lower: string;
  /** The first word, as typed and lower case. */
  rawCmd: string;
  cmd: string;
  /** Everything after the first word, single-spaced. */
  arg: string;
};

export type Command<K extends string, C> = (
  line: ParsedLine,
  context: C,
) => TermResult<K>;

export type CommandTable<K extends string, C> = {
  /**
   * Tried first, in order, before any command word: whole phrases and easter
   * eggs. The first to answer wins; undefined passes to the next.
   */
  phrases?: readonly ((
    line: ParsedLine,
    context: C,
  ) => TermResult<K> | undefined)[];
  /** One entry per command word, lower case. */
  commands: Readonly<Record<string, Command<K, C>>>;
  /** Any other word. The default is a 404. */
  unknown?: Command<K, C>;
};

/** Every terminal has these, unless the app's table says otherwise. */
const BUILT_IN: Readonly<Record<string, Command<never, unknown>>> = {
  clear: () => ({ lines: [], clear: true }),
  exit: () => ({ lines: [], exit: true }),
  logout: () => ({ lines: [], exit: true }),
};

const notFound = ({ rawCmd }: ParsedLine): TermResult<never> => ({
  lines: [err(`404: command not found: ${rawCmd}. Try 'help'.`)],
});

/** A line taken apart, or null when it is blank. */
export function parseLine(input: string): ParsedLine | null {
  const line = input.trim();
  if (!line) return null;
  const [rawCmd = "", ...rest] = line.split(/\s+/);
  return {
    line,
    lower: line.toLowerCase(),
    rawCmd,
    cmd: rawCmd.toLowerCase(),
    arg: rest.join(" "),
  };
}

/** Run one line against a command table. */
export function runCommand<K extends string, C>(
  input: string,
  table: CommandTable<K, C>,
  context: C,
): TermResult<K> {
  const parsed = parseLine(input);
  if (!parsed) return { lines: [] };
  for (const phrase of table.phrases ?? []) {
    const answer = phrase(parsed, context);
    if (answer) return answer;
  }
  // Own keys only: "constructor" or "toString" is not a command.
  const command = Object.hasOwn(table.commands, parsed.cmd)
    ? table.commands[parsed.cmd]
    : Object.hasOwn(BUILT_IN, parsed.cmd)
      ? BUILT_IN[parsed.cmd]
      : undefined;
  return (command ?? table.unknown ?? notFound)(parsed, context);
}

/** What was typed before, and where the arrow keys have got to in it. */
export type TermHistory = { entries: readonly string[]; cursor: number };

export const EMPTY_HISTORY: TermHistory = { entries: [], cursor: 0 };

/** After a line is run: keep it if it said anything, and start again at the end. */
export function remember(history: TermHistory, text: string): TermHistory {
  const entries = text.trim() ? [...history.entries, text] : history.entries;
  return { entries, cursor: entries.length };
}

/**
 * Up (-1) or down (+1) through what was typed. Past the newest line is an
 * empty prompt; with nothing typed yet there is nothing to recall (null).
 */
export function recall(
  history: TermHistory,
  step: number,
): { history: TermHistory; value: string } | null {
  const { entries } = history;
  if (!entries.length) return null;
  const cursor = Math.min(Math.max(history.cursor + step, 0), entries.length);
  return { history: { entries, cursor }, value: entries[cursor] ?? "" };
}
