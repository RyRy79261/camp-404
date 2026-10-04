import { describe, expect, it } from "vitest";
import type { DutyCard } from "@camp404/types";
import {
  MEMBERS_GAP_LINE,
  membersOnlyPartCount,
  publicExcerpt,
  publicHeadings,
  publicMarkdown,
  publicPieces,
  splitMembersOnly,
  toPublicChapter,
  type PublicMarkdown,
} from "../guide-public";

// The public site's cut (#250). It must fail closed: whatever the writer
// typed, a word inside anything that looks like a members-only part never
// comes out. Each case below names the shape that would leak if the scanner
// trusted the writer's rules. The unclosed case was broken on purpose once
// (the tail kept) and went red.

const SECRET = "CANARY-7f3a91";

function cut(lines: string[]): string {
  return publicMarkdown(lines.join("\n"));
}

describe("publicMarkdown", () => {
  it("cuts a part and leaves one gap line in its place", () => {
    const out = cut([
      "Before.",
      "",
      ":::members",
      "## The convoy plan",
      `${SECRET} meets at Ceres.`,
      ":::",
      "",
      "After.",
    ]);
    expect(out).toBe(`Before.\n\n${MEMBERS_GAP_LINE}\n\nAfter.`);
  });

  it("leaves text with no part as it was", () => {
    const text =
      "## Heading\n\nWords, a [link](https://x.org).\n\n- one\n- two";
    expect(publicMarkdown(text)).toBe(text);
  });

  it("cuts to the end when a part is never closed", () => {
    const out = cut(["Open.", ":::members", SECRET, "", "More words."]);
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("More words.");
    expect(out).toBe(`Open.\n\n${MEMBERS_GAP_LINE}`);
  });

  it.each([
    ["indented", ["  :::members", SECRET, ":::", "Kept."]],
    ["quoted", ["> :::members", `> ${SECRET}`, ":::", "Kept."]],
    ["in a list", ["- :::members", `  ${SECRET}`, ":::", "Kept."]],
    ["in a numbered list", ["1. :::members", SECRET, ":::", "Kept."]],
    ["upper case and spaced", ["::: MEMBERS", SECRET, ":::", "Kept."]],
    ["four colons", ["::::members", SECRET, ":::", "Kept."]],
  ])("starts a cut at an opener %s", (_shape, lines) => {
    const out = cut(lines);
    expect(out).not.toContain(SECRET);
    expect(out).toContain("Kept.");
  });

  it("starts a cut at an opener inside a code block, and may cut too much", () => {
    const out = cut(["```", ":::members", SECRET, "```", ":::", "Lost."]);
    expect(out).not.toContain(SECRET);
    // The code block's closing fence opened one inside the cut, so the cut
    // runs to the end: too much is the safe way to be wrong.
    expect(out).toBe(`\`\`\`\n\n${MEMBERS_GAP_LINE}`);
  });

  it("does not end a cut at a closer the rules would refuse", () => {
    // An indented or quoted ::: is not a closer: the cut runs on.
    for (const closer of ["  :::", "> :::", "- :::"]) {
      const out = cut([":::members", "Private.", closer, SECRET]);
      expect(out).not.toContain(SECRET);
    }
  });

  it("counts a nested opener, so the outer part's tail stays cut", () => {
    const out = cut([
      ":::members",
      ":::members",
      "Inner.",
      ":::",
      SECRET,
      ":::",
      "Kept.",
    ]);
    expect(out).not.toContain(SECRET);
    expect(out).toBe(`${MEMBERS_GAP_LINE}\n\nKept.`);
  });

  it("does not end a cut at a ::: inside a code block in the part", () => {
    const out = cut([
      ":::members",
      "```",
      ":::",
      SECRET,
      "```",
      ":::",
      "Kept.",
    ]);
    expect(out).not.toContain(SECRET);
    expect(out).toContain("Kept.");
  });

  it("merges two parts in a row into one gap", () => {
    const out = cut([
      "A.",
      ":::members",
      "One.",
      ":::",
      "",
      ":::members",
      SECRET,
      ":::",
      "B.",
    ]);
    expect(out).toBe(`A.\n\n${MEMBERS_GAP_LINE}\n\nB.`);
  });

  it("reads Windows line ends", () => {
    expect(
      cut([":::members\r", `${SECRET}\r`, ":::\r", "Kept."]),
    ).not.toContain(SECRET);
    expect(publicMarkdown(`:::members\r\n${SECRET}\r\n:::\r\nKept.`)).toBe(
      `${MEMBERS_GAP_LINE}\n\nKept.`,
    );
  });

  it("gives the same text when cut twice", () => {
    const once = cut(["A.", ":::members", SECRET, ":::", "B."]);
    expect(publicMarkdown(once)).toBe(once);
  });
});

describe("splitMembersOnly", () => {
  it("marks each piece, without the fence lines, as the app's reader boxes them", () => {
    expect(
      splitMembersOnly(
        "Intro.\n\n:::members\n## Plan\n\n- a\n- b\n:::\n\nOutro.",
      ),
    ).toEqual([
      { membersOnly: false, markdown: "Intro." },
      { membersOnly: true, markdown: "## Plan\n\n- a\n- b" },
      { membersOnly: false, markdown: "Outro." },
    ]);
  });

  it("boxes exactly what the public page cuts", () => {
    const text = "x\n:::members\n> y\n:::\nz\n  :::members\nw";
    const kept = splitMembersOnly(text)
      .filter((s) => !s.membersOnly)
      .map((s) => s.markdown);
    expect(kept).toEqual(["x", "z"]);
    expect(membersOnlyPartCount(text)).toBe(2);
  });
});

describe("the public page's derived words", () => {
  const text = publicMarkdown(
    [
      "The drive is part of the burn. It is also where it breaks.",
      "",
      "## Tickets and passes",
      "",
      ":::members",
      "## The convoy plan",
      SECRET,
      ":::",
      "",
      "## The **dirt** road",
      "",
      "```",
      "## not a heading",
      "```",
      "",
      "## Tickets and passes",
    ].join("\n"),
  );

  it("lists only the headings left after the cut", () => {
    expect(publicHeadings(text)).toEqual([
      { id: "tickets-and-passes", text: "Tickets and passes" },
      { id: "the-dirt-road", text: "The dirt road" },
      { id: "tickets-and-passes-2", text: "Tickets and passes" },
    ]);
  });

  it("takes the first sentence for the excerpt", () => {
    expect(publicExcerpt(text)).toBe("The drive is part of the burn.");
    expect(publicExcerpt(publicMarkdown(`:::members\n${SECRET}\n:::`))).toBe(
      "",
    );
    expect(publicExcerpt("## Only a heading" as PublicMarkdown)).toBe("");
  });

  it("splits the text into pieces around each gap", () => {
    expect(publicPieces(text).map((p) => p.gap)).toEqual([false, true, false]);
    expect(
      publicPieces(publicMarkdown(`:::members\n${SECRET}\n:::\nAfter.`)),
    ).toEqual([{ gap: true }, { gap: false, markdown: "After." }]);
  });
});

describe("toPublicChapter", () => {
  const row = {
    slug: "washing-up",
    title: "Washing up",
    category: "kitchen",
    team: "kitchen",
    kind: "chapter" as const,
    markdown: `Three tubs.\n\n:::members\n${SECRET}\n:::`,
    card: { askRole: "x" } as unknown as DutyCard,
    version: 4,
    publishedAt: new Date("2026-10-02T10:00:00Z"),
    cycleReviewed: 2027,
  };

  it("cuts the text and drops a card a chapter should not have", () => {
    const out = toPublicChapter(row);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(out).toMatchObject({ category: "kitchen", card: null, version: 4 });
  });

  it("refuses a topic that is not one of the guide's sections", () => {
    expect(toPublicChapter({ ...row, category: "manual" })).toBeNull();
  });
});
