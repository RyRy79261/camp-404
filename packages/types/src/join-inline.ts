// Bold and italic inside the join site's paragraphs (the README's words, the
// text under the teams, each perk file's paragraphs). Captains write them in
// the WYSIWYG editor (owner, 2026-10-01: long text is a WYSIWYG Markdown
// editor with a preview), and both readers, About Camp 404 in the app and
// join.camp-404.com, show them the same way.
//
// The words are still stored one paragraph per string, as before, so a
// paragraph saved before this existed reads exactly as it did. Inside a
// paragraph two marks are understood, written the Markdown way: **bold** and
// *italic*. A backslash keeps the next character as typed (\* is a star).
// Nothing else is Markdown here: no links, headings or lists, so a stored "#"
// or "-" or "_" is just that character. A lone star with no partner stays a
// star. Pure, no parser dependency, so the join site can use it too.

export type InlineRun = { text: string; bold?: true; italic?: true };

const ESCAPABLE = /[\\*]/;

/** Find the closing marker for an opening one, skipping escaped characters. */
function findClose(text: string, from: number, marker: string): number {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1]!)) {
      i++;
      continue;
    }
    if (text.startsWith(marker, i)) {
      // "*" must not close on the first star of a "**".
      if (marker === "*" && text[i + 1] === "*" && text[i + 2] !== "*") {
        const inner = findClose(text, i + 2, "**");
        if (inner === -1) return -1;
        i = inner + 1;
        continue;
      }
      // An empty or space-bordered pair is not a mark ("2 * 3 * 4").
      if (i === from || /\s/.test(text[i - 1]!)) continue;
      return i;
    }
  }
  return -1;
}

function parseInto(
  text: string,
  marks: { bold?: true; italic?: true },
  out: InlineRun[],
): void {
  let plain = "";
  const flush = () => {
    if (plain) out.push({ text: plain, ...marks });
    plain = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1]!)) {
      plain += text[i + 1];
      i++;
      continue;
    }
    if (c === "*") {
      const marker = text.startsWith("***", i)
        ? "***"
        : text[i + 1] === "*"
          ? "**"
          : "*";
      const start = i + marker.length;
      const opensOnText = start < text.length && !/\s/.test(text[start]!);
      const close = opensOnText ? findClose(text, start, marker) : -1;
      if (close !== -1) {
        flush();
        parseInto(
          text.slice(start, close),
          marker === "***"
            ? { ...marks, bold: true, italic: true }
            : marker === "**"
              ? { ...marks, bold: true }
              : { ...marks, italic: true },
          out,
        );
        i = close + marker.length - 1;
        continue;
      }
    }
    plain += c;
  }
  flush();
}

/** One stored paragraph as runs of text, each bold, italic, both or neither. */
export function parseInline(text: string): InlineRun[] {
  const out: InlineRun[] = [];
  parseInto(text, {}, out);
  // Neighbours with the same marks become one run.
  return out.reduce<InlineRun[]>((acc, run) => {
    const last = acc[acc.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else {
      acc.push({ ...run });
    }
    return acc;
  }, []);
}

const escapeAll = (text: string) => text.replace(/[\\*]/g, (c) => `\\${c}`);

function merge(runs: readonly InlineRun[]): InlineRun[] {
  return runs.reduce<InlineRun[]>((acc, run) => {
    if (!run.text) return acc;
    const last = acc[acc.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) {
      last.text += run.text;
    } else {
      acc.push({ ...run });
    }
    return acc;
  }, []);
}

const same = (a: readonly InlineRun[], b: readonly InlineRun[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      r.text === b[i]!.text &&
      r.bold === b[i]!.bold &&
      r.italic === b[i]!.italic,
  );

function write(
  runs: readonly InlineRun[],
  escape: (text: string) => string,
): string {
  let out = "";
  for (const run of runs) {
    const marker = (run.bold ? "**" : "") + (run.italic ? "*" : "");
    if (!marker) {
      out += escape(run.text);
      continue;
    }
    const [, lead = "", core = "", trail = ""] =
      /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text) ?? [];
    if (!core) {
      out += run.text;
      continue;
    }
    const close = (run.italic ? "*" : "") + (run.bold ? "**" : "");
    out += `${lead}${marker}${escapeAll(core)}${close}${trail}`;
  }
  return out;
}

/**
 * Runs back to one stored paragraph: the opposite of parseInline. Spaces at
 * the edges of a marked run are moved outside its markers, as Markdown needs.
 * Plain words are written as typed when they read back the same ("2 * 3"
 * stays "2 * 3"), so a paragraph nobody marked is stored exactly as before;
 * only a star that would turn into a mark is escaped.
 */
export function serializeInline(runs: readonly InlineRun[]): string {
  const want = merge(runs);
  const asTyped = write(want, (t) => t);
  if (same(parseInline(asTyped), merge(want.map((r) => ({ ...r }))))) {
    return asTyped;
  }
  return write(want, escapeAll);
}

/** A stored paragraph's words with its marks taken off (for a short label). */
export function inlinePlainText(text: string): string {
  return parseInline(text)
    .map((r) => r.text)
    .join("");
}
