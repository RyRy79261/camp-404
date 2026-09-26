// No full prefetch of a program URL (migration plan, PR C). A full prefetch
// renders the page with no one asking: it would mark the inbox and
// announcements read, reset stale recipe runs and kick due work. Icons, Start
// rows, taskbar buttons, folder windows and the pin strip keep `<Link>`'s
// default prefetch (which renders no page, as there is no loading.tsx), and
// never `prefetch={true}`, a bare `prefetch`, `prefetch: true` or
// `router.prefetch(...)`.
//
// A source check, for a unit test to run over the files that draw the shell.
// Exported on its own path (`@camp404/os/prefetch-guard`), never from the
// package's main entry, so it stays out of the browser bundle.

export type PrefetchFinding = {
  /** 1-based line of the finding. */
  line: number;
  /** The offending text, trimmed. */
  text: string;
};

/** JSX `prefetch` values that keep the default: nothing more is fetched. */
const SAFE_VALUE =
  /^(?:\{\s*(?:false|null|undefined|"auto"|'auto')\s*\}|"auto"|'auto')$/;

/**
 * The source with comments and the insides of strings blanked to spaces
 * (quotes and line breaks kept, so every offset and line number holds). A
 * comment that names `router.prefetch` to forbid it, or a sentence in a
 * string, is then not a finding. A regex literal holding a quote can confuse
 * it; the shell's files have none that matter.
 */
function blank(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  const keep = (ch: string) => (ch === "\n" ? "\n" : " ");
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (quote) {
      if (ch === "\\") {
        out += keep(ch) + keep(next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
        out += ch;
      } else {
        out += keep(ch);
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (
        i < source.length &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        out += keep(source[i]!);
        i++;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Every full prefetch in one source file. Empty when it has none. */
export function findFullPrefetches(source: string): PrefetchFinding[] {
  const code = blank(source).split("\n");
  const real = source.split("\n");
  const found: PrefetchFinding[] = [];
  code.forEach((line, i) => {
    const original = real[i] ?? "";
    const text = (m: RegExpMatchArray) =>
      original.slice(m.index!, m.index! + m[0].length).trim();
    // router.prefetch(...), or any .prefetch( call.
    for (const m of line.matchAll(/\.\s*prefetch\s*\(/g)) {
      found.push({ line: i + 1, text: text(m) });
    }
    // An options object: { prefetch: true }, or any value but a safe one.
    for (const m of line.matchAll(
      /(?<![.\w-])prefetch\s*:\s*(?:"[^"]*"|'[^']*'|[^,}\s]+)/g,
    )) {
      const value = text(m).replace(/^prefetch\s*:\s*/, "");
      if (!/^(?:false|null|undefined|"auto"|'auto')$/.test(value)) {
        found.push({ line: i + 1, text: text(m) });
      }
    }
    // A JSX attribute: a bare prefetch, prefetch={true}, prefetch={x}.
    for (const m of line.matchAll(
      /(?<![.\w-])prefetch(?![\w-]|\s*[:(?])(\s*=\s*(\{[^}]*\}|"[^"]*"|'[^']*'))?/g,
    )) {
      const value = m[2] ? text(m).replace(/^prefetch\s*=\s*/, "") : "";
      if (!value || !SAFE_VALUE.test(value)) {
        found.push({ line: i + 1, text: text(m) });
      }
    }
  });
  return found;
}
