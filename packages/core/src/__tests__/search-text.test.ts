import { describe, expect, it } from "vitest";
import {
  SNIPPET_LENGTH,
  TEXT_WHERE,
  announcementTextParts,
  chapterTextParts,
  cutSnippet,
  findTextMatch,
  markWords,
  meetingTextParts,
  recipeTextParts,
  underHeading,
} from "../search-text";

// Ctrl+K search inside text (#350): the words each kind gives search, and the
// one line a text hit shows.

const marked = (r: {
  text: string;
  marks: { start: number; length: number }[];
}) => r.marks.map((m) => r.text.slice(m.start, m.start + m.length));

const NIGHT =
  "At night load the generator burns about 4 L an hour. We need 40 L of fuel a day, plus one spare can that stays full and never leaves the cage.";

describe("cutSnippet", () => {
  it("starts at the sentence that holds the word, and keeps the rest when it fits", () => {
    const r = cutSnippet(NIGHT, ["fuel"])!;
    expect(r.text).toBe(
      "…We need 40 L of fuel a day, plus one spare can that stays full and never leaves the cage.",
    );
    expect(marked(r)).toEqual(["fuel"]);
  });

  it("starts at a whole word when no sentence starts in the lead, and ends at one with an ellipsis", () => {
    const text =
      "Bring a headlamp with spare batteries and a red filter so the dome stays dark while the projector runs all night long and nobody trips over the cables on the way out to the toilets behind the kitchen tent";
    const r = cutSnippet(text, ["projector"])!;
    expect(r.text.startsWith("…")).toBe(true);
    expect(r.text.endsWith("…")).toBe(true);
    const inner = r.text.slice(1, -1);
    // Whole words at both ends.
    expect(text.includes(inner)).toBe(true);
    const at = text.indexOf(inner);
    expect(text[at - 1]).toBe(" ");
    expect(text[at + inner.length]).toBe(" ");
    expect(inner.length).toBeLessThanOrEqual(SNIPPET_LENGTH);
    // About 35 characters of lead.
    expect(inner.indexOf("projector")).toBeLessThanOrEqual(35);
  });

  it("needs no ellipsis for a match at the start of a short text", () => {
    expect(cutSnippet("Fuel the generator at dusk.", ["fuel"])).toEqual({
      text: "Fuel the generator at dusk.",
      marks: [{ start: 0, length: 4 }],
    });
  });

  it("near the end of a text, takes more before the match", () => {
    const r = cutSnippet(NIGHT, ["cage"])!;
    expect(r.text).toBe(
      "…We need 40 L of fuel a day, plus one spare can that stays full and never leaves the cage.",
    );
  });

  it("takes a match at the very end", () => {
    const text = `${"word ".repeat(40)}then the fuel`;
    const r = cutSnippet(text, ["fuel"])!;
    expect(r.text.endsWith("then the fuel")).toBe(true);
    expect(r.text.startsWith("…")).toBe(true);
    expect(marked(r)).toEqual(["fuel"]);
  });

  it("prefers where the word starts a word, and marks every typed word in the window", () => {
    const r = cutSnippet(
      "Refuel at night. Fuel cans live in the cage with the fuel funnel.",
      ["fuel", "cage"],
    )!;
    expect(marked(r)).toEqual(["fuel", "Fuel", "cage", "fuel"]);
  });

  it("finds any case and non-ASCII letters, and never splits an emoji", () => {
    const r = cutSnippet(`${"🔥".repeat(30)} Crème brûlée for the burn`, [
      "brûlée",
    ])!;
    expect(marked(r)).toEqual(["brûlée"]);
    // No lone surrogate anywhere.
    expect(r.text).toBe(r.text.normalize());
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(r.text)).toBe(false);
    expect(cutSnippet("ÉTÉ SALAD", ["été"])!.marks).toEqual([
      { start: 0, length: 3 },
    ]);
  });

  it("is null when no word is there", () => {
    expect(cutSnippet("Nothing here", ["fuel"])).toBeNull();
  });
});

describe("markWords", () => {
  it("lets the longer word win where two overlap", () => {
    expect(markWords("potjie pot", ["pot", "potjie"])).toEqual([
      { start: 0, length: 6 },
      { start: 7, length: 3 },
    ]);
  });
});

const BODY = {
  title: "Lamb potjie",
  summary: "A slow stew for a cold night.",
  plates: 40,
  totalTimeMinutes: 240,
  activeTimeMinutes: 60,
  ingredients: [
    {
      component: "Marinade",
      name: "Lamb shoulder",
      category: "protein",
      quantity: 8,
      quantityMax: null,
      unit: "kg",
      preparation: "cubed",
      note: "ask the butcher",
      optional: false,
      allergens: ["mustard"],
    },
    {
      component: null,
      name: "Onions",
      category: "produce",
      quantity: 10,
      quantityMax: null,
      unit: null,
      preparation: null,
      note: null,
      optional: false,
    },
  ],
  steps: [
    {
      phase: "Cook",
      instruction: "Brown the lamb in the big potjie on the second gas burner.",
      uses: [],
      durationMinutes: 20,
      durationMaxMinutes: null,
      temperatureC: null,
      equipment: [],
      note: "Do it in batches.",
    },
  ],
  notes: [
    { kind: "make_ahead", title: "Ahead", body: "Brown it the day before." },
  ],
};

describe("recipeTextParts", () => {
  it("gives the values a reader sees, part by part", () => {
    expect(recipeTextParts(BODY)).toEqual([
      {
        where: TEXT_WHERE.summary,
        membersOnly: false,
        text: "A slow stew for a cold night.",
      },
      {
        where: TEXT_WHERE.ingredients,
        membersOnly: false,
        text: "Marinade: Lamb shoulder, cubed (ask the butcher); Onions",
      },
      {
        where: TEXT_WHERE.method,
        membersOnly: false,
        text: "Brown the lamb in the big potjie on the second gas burner. Do it in batches.",
      },
      {
        where: TEXT_WHERE.notes,
        membersOnly: false,
        text: "Ahead: Brown it the day before.",
      },
    ]);
  });

  it("never gives a key, an enum or a number", () => {
    const all = recipeTextParts(BODY)
      .map((p) => p.text)
      .join(" ");
    for (const absent of [
      "protein",
      "produce",
      "mustard",
      "kg",
      "make_ahead",
      "instruction",
      "240",
      "Cook",
      "40",
    ]) {
      expect(all).not.toContain(absent);
    }
  });

  it("reads an odd or missing body as nothing", () => {
    expect(recipeTextParts(null)).toEqual([]);
    expect(recipeTextParts({ steps: "no" })).toEqual([]);
  });
});

describe("chapterTextParts", () => {
  it("cuts the Markdown at its headings, keeps a members-only part apart, and reads a card", () => {
    const parts = chapterTextParts(
      [
        "Intro words.",
        "",
        "## Water",
        "",
        "Bring **20 L** each. See [the list](https://example.com/fuel).",
        "",
        ":::members",
        "The key to the fuel cage is in the red box.",
        ":::",
        "",
        "## Shade",
        "Nets.",
      ].join("\n"),
      {
        subRoles: [{ name: "Runner", min: 1, max: 2 }],
        steps: ["Check the oil", "Open the fuel tap"],
        hardRules: ["Never refuel hot"],
        checklist: ["Log the hours"],
        askRole: "Power lead",
      },
    );
    expect(parts).toEqual([
      {
        where: TEXT_WHERE.steps,
        membersOnly: false,
        text: "Check the oil · Open the fuel tap",
      },
      {
        where: TEXT_WHERE.hardRules,
        membersOnly: false,
        text: "Never refuel hot",
      },
      {
        where: TEXT_WHERE.checklist,
        membersOnly: false,
        text: "Log the hours",
      },
      { where: TEXT_WHERE.subRoles, membersOnly: false, text: "Runner" },
      { where: TEXT_WHERE.askRole, membersOnly: false, text: "Power lead" },
      { where: TEXT_WHERE.chapter, membersOnly: false, text: "Intro words." },
      {
        where: underHeading("Water"),
        membersOnly: false,
        text: "Water Bring 20 L each. See the list.",
      },
      {
        where: TEXT_WHERE.membersOnly,
        membersOnly: true,
        text: "The key to the fuel cage is in the red box.",
      },
      { where: underHeading("Shade"), membersOnly: false, text: "Shade Nets." },
    ]);
  });
});

describe("meeting and announcement parts", () => {
  it("names each part of a meeting, and strips the Markdown", () => {
    expect(
      meetingTextParts({
        agenda: "- Gas\n- **Fuel**",
        notes: "",
        decisions: ["Power pays for the fuel"],
        actions: ["Buy cans", "Book the service"],
      }),
    ).toEqual([
      { where: TEXT_WHERE.agenda, membersOnly: false, text: "Gas Fuel" },
      {
        where: TEXT_WHERE.decisions,
        membersOnly: false,
        text: "Power pays for the fuel",
      },
      {
        where: TEXT_WHERE.actions,
        membersOnly: false,
        text: "Buy cans · Book the service",
      },
    ]);
    expect(announcementTextParts("Gate opens at **9**.")).toEqual([
      {
        where: TEXT_WHERE.message,
        membersOnly: false,
        text: "Gate opens at 9.",
      },
    ]);
  });
});

describe("findTextMatch", () => {
  const parts = recipeTextParts(BODY);

  it("finds the part that holds the first word, with its line", () => {
    const m = findTextMatch("Lamb potjie", parts, ["burner"])!;
    expect(m.where).toBe(TEXT_WHERE.method);
    expect(m.membersOnly).toBe(false);
    expect(m.text).toContain("second gas burner");
    expect(marked(m)).toEqual(["burner"]);
  });

  it("lets the words fall across the title and the text", () => {
    const m = findTextMatch("Lamb potjie", parts, ["lamb", "butcher"])!;
    expect(m.where).toBe(TEXT_WHERE.ingredients);
  });

  it("prefers a part where the first word starts a word", () => {
    const m = findTextMatch(
      "x",
      [
        { where: "a", membersOnly: false, text: "Refuel nightly" },
        { where: "b", membersOnly: false, text: "Fuel cans" },
      ],
      ["fuel"],
    )!;
    expect(m.where).toBe("b");
  });

  it("is no hit when a word is only in markup, such as a link's address", () => {
    const chapter = chapterTextParts(
      "See [the list](https://example.com/zebra).",
      null,
    );
    expect(findTextMatch("Packing", chapter, ["zebra"])).toBeNull();
  });

  it("is no hit when a word is nowhere", () => {
    expect(findTextMatch("Lamb potjie", parts, ["lamb", "zzz"])).toBeNull();
  });

  it("says a members-only part is one", () => {
    const chapter = chapterTextParts(
      ":::members\nThe fuel cage key.\n:::",
      null,
    );
    expect(findTextMatch("Arrival", chapter, ["fuel"])).toMatchObject({
      where: TEXT_WHERE.membersOnly,
      membersOnly: true,
    });
  });
});
