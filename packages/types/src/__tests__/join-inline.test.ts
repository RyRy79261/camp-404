import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOIN_CONTENT,
  inlinePlainText,
  parseInline,
  serializeInline,
  type InlineRun,
} from "../index";

// The join site's paragraphs may carry **bold** and *italic* (the WYSIWYG
// editor writes them). Words saved before that existed must read exactly as
// they did, and what the editor writes must read back as it was written.

describe("parseInline", () => {
  it("reads plain words as one plain run", () => {
    expect(parseInline("Prep takes MONTHS; the final weeks.")).toEqual([
      { text: "Prep takes MONTHS; the final weeks." },
    ]);
  });

  it("reads bold, italic and both", () => {
    expect(parseInline("In the desert **everyone** builds, *really*.")).toEqual(
      [
        { text: "In the desert " },
        { text: "everyone", bold: true },
        { text: " builds, " },
        { text: "really", italic: true },
        { text: "." },
      ],
    );
    expect(parseInline("***all***")).toEqual([
      { text: "all", bold: true, italic: true },
    ]);
  });

  it("keeps a lone star, a spaced star and Markdown it does not know as typed", () => {
    for (const text of [
      "2 * 3 * 4",
      "a*b",
      "**open but never closed",
      "# Not a heading",
      "- not a list",
      "x_y_z [✓] R2,000–R8,000",
    ]) {
      expect(inlinePlainText(text)).toBe(text);
    }
  });

  it("reads a backslash-escaped star as a star", () => {
    expect(parseInline("a \\*literal\\* star")).toEqual([
      { text: "a *literal* star" },
    ]);
  });

  it("reads every stored default paragraph as plain text, unchanged", () => {
    const paragraphs = [
      ...DEFAULT_JOIN_CONTENT.readme.paragraphs,
      ...DEFAULT_JOIN_CONTENT.teams.outro,
      ...DEFAULT_JOIN_CONTENT.perks.files.flatMap((f) => f.paragraphs),
    ];
    for (const p of paragraphs) {
      expect(parseInline(p)).toEqual([{ text: p }]);
    }
  });
});

describe("serializeInline", () => {
  const cases: [string, InlineRun[]][] = [
    ["plain", [{ text: "Just words." }]],
    [
      "bold and italic",
      [
        { text: "In the desert " },
        { text: "everyone", bold: true },
        { text: " builds and " },
        { text: "everyone", italic: true },
        { text: " packs." },
      ],
    ],
    ["both marks", [{ text: "loud", bold: true, italic: true }]],
    [
      "italic next to bold-italic",
      [
        { text: "a", italic: true },
        { text: " " },
        { text: "b", bold: true, italic: true },
      ],
    ],
    ["stars and backslashes typed as words", [{ text: "2*3 = 6 \\ a * b" }]],
    ["a star inside bold", [{ text: "R5*", bold: true }]],
  ];

  it.each(cases)("round-trips %s", (_what, runs) => {
    expect(parseInline(serializeInline(runs))).toEqual(runs);
  });

  it("stores plain stars as typed, and escapes only one that would become a mark", () => {
    expect(serializeInline([{ text: "2 * 3 a*b" }])).toBe("2 * 3 a*b");
    expect(serializeInline([{ text: "*hi*" }])).toBe("\\*hi\\*");
  });

  it("moves the spaces at a mark's edges outside its markers", () => {
    expect(
      serializeInline([
        { text: "go" },
        { text: " now ", bold: true },
        { text: "!" },
      ]),
    ).toBe("go **now** !");
  });
});
