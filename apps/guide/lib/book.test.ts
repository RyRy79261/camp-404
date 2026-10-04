import { describe, expect, it } from "vitest";
import { toPublicChapter, type PublicGuideChapter } from "@camp404/core";
import {
  buildBook,
  chapterPageStyles,
  checkedFor,
  cssString,
  neighbours,
  teamName,
} from "./book";
import { CANARY, fixturePublicChapters } from "./fixtures";

function chapter(
  slug: string,
  category: string,
  over: Partial<Parameters<typeof toPublicChapter>[0]> = {},
): PublicGuideChapter {
  return toPublicChapter({
    slug,
    title: slug,
    category,
    team: null,
    kind: "chapter",
    markdown: `About ${slug}. More words.`,
    card: null,
    version: 1,
    publishedAt: new Date("2026-09-28T08:00:00Z"),
    cycleReviewed: 2027,
    ...over,
  })!;
}

describe("the public book", () => {
  const book = buildBook([
    chapter("washing-up", "kitchen"),
    chapter("packing", "before_you_come"),
    chapter("gate", "before_you_come"),
    chapter("moop", "on_site"),
  ]);

  it("orders sections as the guide does and numbers chapters through the book", () => {
    expect(book.map((s) => [s.number, s.label])).toEqual([
      [1, "Before you come"],
      [2, "On site"],
      [3, "Kitchen"],
    ]);
    expect(
      book.flatMap((s) => s.chapters.map((c) => [c.number, c.slug])),
    ).toEqual([
      [1, "gate"],
      [2, "packing"],
      [3, "moop"],
      [4, "washing-up"],
    ]);
    expect(book[0]!.chapters[0]!.excerpt).toBe("About gate.");
  });

  it("turns the page across sections", () => {
    expect(neighbours(book, "packing")).toMatchObject({
      previous: { slug: "gate" },
      next: { slug: "moop" },
    });
    expect(neighbours(book, "gate").previous).toBeNull();
    expect(neighbours(book, "washing-up").next).toBeNull();
  });

  it("builds nothing from a members-only word", () => {
    const text = JSON.stringify(buildBook(fixturePublicChapters()));
    expect(text).not.toContain(CANARY);
    expect(text).toContain("Getting to the Tankwa");
  });
});

describe("the page's words", () => {
  it("names a team, or the whole camp", () => {
    expect(teamName(null, {})).toBe("Whole camp");
    expect(teamName("kitchen", { kitchen: "Kitchen" })).toBe("Kitchen");
    expect(teamName("mutant_vehicle", {})).toBe("Mutant vehicle");
  });

  it("says which burn it was checked for, only for a real year", () => {
    expect(checkedFor(2027)).toBe("Checked for the 2027 burn");
    expect(checkedFor(1)).toBeNull();
    expect(checkedFor(null)).toBeNull();
  });
});

describe("the chapter's paper", () => {
  it("keeps a writer's quotes and line ends out of the running head", () => {
    expect(cssString('Say "hi"\\\n} body { color: red')).toBe(
      '"Say  hi   } body { color: red"',
    );
    const css = chapterPageStyles("Before you come", 'The "gate"');
    expect(css).toContain('@top-right { content: "The  gate ";');
    expect(css).toContain("@page chapter:first");
    expect(css).toContain("size: A4;");
    expect(css).toContain("margin: 20mm 18mm 18mm 20mm;");
  });
});
