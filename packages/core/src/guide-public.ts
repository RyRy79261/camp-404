import {
  CODE_FENCE,
  GuideCategory,
  type DutyCard,
  looksLikeMembersOpener,
} from "@camp404/types";
import { plainPreview } from "./markdown-text";
import { slugify } from "./text-utils";

// The Survival Guide's public site (survival-guide.camp-404.com, #250) and
// the "Members only" parts inside a chapter. Pure: no DB, no session.
//
// WHO READS WHAT (owner, 2026-10-04). A chapter is on the public site only
// when it is published, its section (topic) is public, and it is not marked
// "Keep this whole chapter members only". A section starts private; only a
// captain flips either switch.
//
// A part of a chapter can be kept for members: a `:::members … :::` block
// (the writer's rules are membersOnlyProblem in @camp404/types). The public
// site never trusts those rules. `publicMarkdown` cuts every part on the
// server, before anything public is built, and it FAILS CLOSED:
//   - anything that looks like an opener starts a cut, wherever it sits
//     (indented, quoted, in a list, inside a code block);
//   - a cut ends only at a bare `:::` line outside a code block opened inside
//     it, and an opener inside a cut needs its own closer (nesting counts);
//   - a cut that never closes runs to the end.
// It can remove too much; it can never remove too little. The members' reader
// in the app splits the text with the SAME scanner (splitMembersOnly), so what
// members see boxed is exactly what the public page leaves out.

/** Markdown with every members-only part cut out: the only kind the public site renders. */
export type PublicMarkdown = string & { readonly __publicMarkdown: true };

/**
 * The line put where a cut was. The public page draws one fixed sentence for
 * it, never anything of what was cut. It does not look like an opener, so the
 * text can be cut again and stays the same.
 */
export const MEMBERS_GAP_LINE = "%%members-only%%";

export interface MembersSegment {
  membersOnly: boolean;
  /** The segment's Markdown, without the fence lines. */
  markdown: string;
}

function closesFence(fence: string, line: string): boolean {
  const run = fence[0] === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}\\${run}{${fence.length},}\\s*$`).test(line);
}

/**
 * The text in order, each piece marked members-only or not. A members-only
 * piece holds what is between its fences (the fences are dropped); a piece
 * that never closed runs to the end.
 */
export function splitMembersOnly(markdown: string): MembersSegment[] {
  const segments: MembersSegment[] = [];
  let buffer: string[] = [];
  let cut = false;
  let depth = 0;
  let fence: string | null = null;

  const flush = (membersOnly: boolean) => {
    const text = buffer.join("\n");
    buffer = [];
    if (text.trim() === "") return;
    segments.push({ membersOnly, markdown: text.replace(/^\n+|\n+$/g, "") });
  };

  for (const line of markdown.split(/\r\n?|\n/)) {
    if (!cut) {
      // Outside a cut nothing is trusted: an opener inside a code block, a
      // quote or a list still starts one.
      if (looksLikeMembersOpener(line)) {
        flush(false);
        cut = true;
        depth = 1;
        fence = null;
        continue;
      }
      buffer.push(line);
      continue;
    }
    if (fence !== null) {
      if (closesFence(fence, line)) fence = null;
      buffer.push(line);
      continue;
    }
    const code = CODE_FENCE.exec(line);
    if (code) {
      fence = code[1]!;
      buffer.push(line);
      continue;
    }
    if (looksLikeMembersOpener(line)) {
      depth += 1;
      buffer.push(line);
      continue;
    }
    if (line.trimEnd() === ":::") {
      depth -= 1;
      if (depth === 0) {
        flush(true);
        cut = false;
        continue;
      }
    }
    buffer.push(line);
  }
  flush(cut);
  return segments;
}

/**
 * The chapter as the public may read it: every members-only part cut out,
 * one MEMBERS_GAP_LINE in its place (parts in a row share one).
 */
export function publicMarkdown(markdown: string): PublicMarkdown {
  const out: string[] = [];
  for (const segment of splitMembersOnly(markdown)) {
    if (segment.membersOnly) {
      if (out[out.length - 1] !== MEMBERS_GAP_LINE) out.push(MEMBERS_GAP_LINE);
    } else {
      out.push(segment.markdown);
    }
  }
  return out.join("\n\n") as PublicMarkdown;
}

/** How many members-only parts a text has (the publish audit row counts them). */
export function membersOnlyPartCount(markdown: string): number {
  return splitMembersOnly(markdown).filter((s) => s.membersOnly).length;
}

export type PublicPiece = { gap: true } | { gap: false; markdown: string };

/** The public text in pieces: Markdown to render, and the gaps between. */
export function publicPieces(markdown: PublicMarkdown): PublicPiece[] {
  const pieces: PublicPiece[] = [];
  markdown.split(/\n*^%%members-only%%$\n*/m).forEach((part, i) => {
    if (i > 0) pieces.push({ gap: true });
    if (part.trim() !== "") pieces.push({ gap: false, markdown: part });
  });
  return pieces.filter(
    (p, i, all) => !(p.gap && i > 0 && all[i - 1]!.gap === true),
  );
}

/** A heading's anchor on the public page, from its words. */
export function headingAnchor(text: string): string {
  return slugify(text) || "section";
}

/**
 * The public text's section headings (`## `), for the page's side rail. Read
 * from the cut text, so a heading inside a members-only part is never listed.
 */
export function publicHeadings(
  markdown: PublicMarkdown,
): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    if (fence !== null) {
      if (closesFence(fence, line)) fence = null;
      continue;
    }
    const code = CODE_FENCE.exec(line);
    if (code) {
      fence = code[1]!;
      continue;
    }
    const heading = /^ {0,3}##[ \t]+(.+?)[ \t#]*$/.exec(line);
    if (!heading) continue;
    const text = plainPreview(heading[1]!, 200);
    if (text === "") continue;
    const base = headingAnchor(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ id: n === 0 ? base : `${base}-${n + 1}`, text });
  }
  return out;
}

/**
 * The public text's first sentence, as plain words: the contents' line under a
 * title and the page's description. Empty when the text has none.
 */
export function publicExcerpt(markdown: PublicMarkdown, max = 160): string {
  const firstPiece = publicPieces(markdown).find(
    (p): p is { gap: false; markdown: string } => !p.gap,
  );
  if (!firstPiece) return "";
  const paragraphs = firstPiece.markdown
    .split(/\n{2,}/)
    .filter((block) => !/^ {0,3}(#|`{3}|~{3}|[-*+] |\d+[.)] |>)/.test(block));
  const words = plainPreview(paragraphs[0] ?? "", 2000);
  if (words === "") return "";
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(words)?.[1] ?? words;
  return sentence.length <= max
    ? sentence
    : `${sentence.slice(0, max).trimEnd()}…`;
}

/** One published chapter as the public site gets it from the database layer. */
export interface PublicGuideChapter {
  slug: string;
  title: string;
  category: GuideCategory;
  team: string | null;
  kind: "chapter" | "duty_card";
  /** Already cut: members-only parts never leave the server. */
  markdown: PublicMarkdown;
  card: DutyCard | null;
  version: number;
  publishedAt: Date;
  cycleReviewed: number | null;
}

/**
 * The public reads' one funnel: a published version's row in, the public
 * chapter out, its text cut. Both the database reads and the guide app's test
 * fixtures go through it, so the cut cannot be skipped on either path.
 */
export function toPublicChapter(row: {
  slug: string;
  title: string;
  category: string;
  team: string | null;
  kind: "chapter" | "duty_card";
  markdown: string;
  card: DutyCard | null;
  version: number;
  publishedAt: Date;
  cycleReviewed: number | null;
}): PublicGuideChapter | null {
  const category = GuideCategory.safeParse(row.category);
  if (!category.success) return null;
  return {
    slug: row.slug,
    title: row.title,
    category: category.data,
    team: row.team,
    kind: row.kind,
    markdown: publicMarkdown(row.markdown),
    card: row.kind === "duty_card" ? row.card : null,
    version: row.version,
    publishedAt: row.publishedAt,
    cycleReviewed: row.cycleReviewed,
  };
}
