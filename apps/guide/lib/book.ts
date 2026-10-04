import {
  headingAnchor,
  printableDutyCard,
  publicExcerpt,
  publicHeadings,
  type PublicGuideChapter,
} from "@camp404/core";
import {
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_LABELS,
  GUIDE_SITE_HOST,
  type GuideCategory,
} from "@camp404/types";

// The public guide as a book (#250): its sections in reading order, each
// chapter numbered through the whole book, with the words every page shows.
// Pure, so it is unit-tested; everything here is built from chapters the
// database layer has already cut (toPublicChapter), never from raw text.

/** The camp app, where members read the whole guide. */
export const APP_ORIGIN = "https://camp-404.com";
export const APP_GUIDE_URL = `${APP_ORIGIN}/guide`;

export function appChapterUrl(slug: string): string {
  return `${APP_GUIDE_URL}/${encodeURIComponent(slug)}`;
}

/** "survival-guide.camp-404.com/getting-to-the-tankwa". */
export function siteChapterAddress(slug: string): string {
  return `${GUIDE_SITE_HOST}/${slug}`;
}

export interface BookChapter {
  slug: string;
  title: string;
  /** Its number through the whole book, from 1. */
  number: number;
  category: GuideCategory;
  kind: "chapter" | "duty_card";
  team: string | null;
  /** The first sentence of its public text. */
  excerpt: string;
  publishedAt: Date;
}

export interface BookSection {
  category: GuideCategory;
  label: string;
  /** Its number among the public sections, from 1. */
  number: number;
  chapters: BookChapter[];
}

/** The public sections that have chapters, in the guide's order. */
export function buildBook(
  chapters: readonly PublicGuideChapter[],
): BookSection[] {
  const sections: BookSection[] = [];
  let n = 0;
  for (const category of GUIDE_CATEGORIES) {
    const inSection = chapters
      .filter((c) => c.category === category)
      .sort(
        (a, b) => a.title.localeCompare(b.title) || (a.slug < b.slug ? -1 : 1),
      );
    if (inSection.length === 0) continue;
    sections.push({
      category,
      label: GUIDE_CATEGORY_LABELS[category],
      number: sections.length + 1,
      chapters: inSection.map((c) => ({
        slug: c.slug,
        title: c.title,
        number: (n += 1),
        category,
        kind: c.kind,
        team: c.team,
        excerpt:
          c.kind === "duty_card" && c.card
            ? cardExcerpt(c)
            : publicExcerpt(c.markdown),
        publishedAt: c.publishedAt,
      })),
    });
  }
  return sections;
}

function cardExcerpt(c: PublicGuideChapter): string {
  const text = publicExcerpt(c.markdown);
  return text || (c.card ? (c.card.steps[0] ?? "") : "");
}

/** Every chapter in reading order. */
export function bookOrder(book: readonly BookSection[]): BookChapter[] {
  return book.flatMap((s) => s.chapters);
}

/** The chapters either side of `slug`, in reading order. */
export function neighbours(
  book: readonly BookSection[],
  slug: string,
): { previous: BookChapter | null; next: BookChapter | null } {
  const all = bookOrder(book);
  const i = all.findIndex((c) => c.slug === slug);
  if (i < 0) return { previous: null, next: null };
  return { previous: all[i - 1] ?? null, next: all[i + 1] ?? null };
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});
const LONG_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Johannesburg",
});

/** "28 Sept 2026", in camp time. */
export function shortDay(at: Date): string {
  return SHORT_DAY.format(at);
}

/** "28 September 2026", in camp time. */
export function longDay(at: Date): string {
  return LONG_DAY.format(at);
}

/** "Checked for the 2027 burn", or null when no year was ever checked. */
export function checkedFor(cycleReviewed: number | null): string | null {
  return cycleReviewed !== null && cycleReviewed >= 2000
    ? `Checked for the ${cycleReviewed} burn`
    : null;
}

/** A team's name, or "Whole camp". */
export function teamName(
  team: string | null,
  labels: Readonly<Record<string, string>>,
): string {
  if (team === null) return "Whole camp";
  return (
    labels[team] ??
    team.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

/** The side rail's anchors for a chapter: its `##` headings after the cut. */
export function chapterHeadings(
  chapter: PublicGuideChapter,
): { id: string; text: string }[] {
  return chapter.kind === "chapter" ? publicHeadings(chapter.markdown) : [];
}

export { headingAnchor };

/** A duty card's parts as both its page and its print draw them. */
export function publicCardParts(chapter: PublicGuideChapter) {
  return chapter.card ? printableDutyCard(chapter.card) : null;
}

/**
 * Words from the server put into a CSS string (the running head, the card's
 * footer): quotes, backslashes and line ends become spaces, so nothing a
 * writer typed can end the string.
 */
export function cssString(text: string): string {
  return `"${text.replace(/["\\\n\r]/g, " ")}"`;
}

/**
 * The chapter's paper: A4, and from page 2 a running head in the margin (the
 * section on the left, the title on the right) and "Page N of M" at the foot.
 * Chromium draws the margin boxes; other browsers print the same pages
 * without them.
 */
export function chapterPageStyles(sectionLabel: string, title: string): string {
  const box =
    'font-family: "Guide Inter", sans-serif; font-size: 8pt; color: #555;';
  return [
    "@page chapter {",
    "  size: A4;",
    "  margin: 20mm 18mm 18mm 20mm;",
    `  @top-left { content: ${cssString(`Camp 404 Survival Guide · ${sectionLabel}`)}; ${box} vertical-align: bottom; padding-bottom: 4mm; }`,
    `  @top-right { content: ${cssString(title)}; ${box} font-weight: 600; color: #222; vertical-align: bottom; padding-bottom: 4mm; }`,
    `  @bottom-right { content: "Page " counter(page) " of " counter(pages); ${box} vertical-align: top; padding-top: 4mm; }`,
    "}",
    "@page chapter:first {",
    "  @top-left { content: none; }",
    "  @top-right { content: none; }",
    "}",
  ].join("\n");
}
