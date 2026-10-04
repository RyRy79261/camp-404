import { describe, expect, it } from "vitest";
import type { SearchEntryRow } from "@camp404/db/search";
import { matchProgram } from "../program-routes";
import { entryHref, presentEntry } from "../search-entries";

// What a search result says and where it goes (#326, step 2). The address
// must open the right 404 OS window: every kind's href is checked against the
// desktop's route table.

const LABELS = {
  kitchen: "Kitchen",
  power_and_lighting: "Power and Lighting",
  finance: "Finance",
};

function row(over: Partial<SearchEntryRow>): SearchEntryRow {
  return {
    kind: "recipe",
    id: "11111111-1111-4111-8111-111111111111",
    title: "T",
    team: null,
    at: null,
    num: null,
    num2: null,
    label: null,
    extra: null,
    ref: null,
    flag: false,
    match: null,
    ...over,
  };
}

const detail = (over: Partial<SearchEntryRow>) =>
  presentEntry(row(over), LABELS).detail;

describe("presentEntry", () => {
  it("says what each page already shows, in plain words", () => {
    expect(detail({ kind: "recipe", num: 40 })).toBe("40 plates");
    expect(detail({ kind: "recipe", label: "suggested", flag: true })).toBe(
      "Your suggestion · Suggested",
    );
    expect(
      detail({ kind: "chapter", label: "chapter", extra: "arrival" }),
    ).toMatch(/^Chapter · /);
    expect(
      detail({ kind: "chapter", label: "duty_card", team: "kitchen" }),
    ).toBe("Duty card · Kitchen");
    expect(detail({ kind: "chapter", label: "duty_card" })).toBe(
      "Duty card · Whole camp",
    );
    expect(
      detail({
        kind: "meeting",
        at: Date.UTC(2026, 8, 12, 16),
        team: null,
      }),
    ).toMatch(/^12 Sep.* · Whole camp$/);
    expect(
      detail({
        kind: "task",
        team: "kitchen",
        at: Date.UTC(2026, 3, 20, 10),
        label: "open",
      }),
    ).toMatch(/^Kitchen · due 20 Apr.* · To do$/);
    expect(
      detail({
        kind: "inventory",
        team: "kitchen",
        num: 4,
        extra: "box",
        label: "storage_unit",
      }),
    ).toBe("Kitchen · 4 boxes · Storage unit");
    expect(
      detail({ kind: "shift", team: "kitchen", num: 19 * 60, num2: 120 }),
    ).toBe("Kitchen · 19:00–21:00");
    expect(detail({ kind: "gear", flag: true, num: 2 })).toBe(
      "To rent · tent, sleeps 2",
    );
    expect(detail({ kind: "lounge", num: 3, num2: 17 * 60 })).toBe(
      "Day 3 · 17:00",
    );
    expect(detail({ kind: "lounge", flag: true, label: "offered" })).toBe(
      "Your offer · Offered",
    );
    expect(
      detail({
        kind: "person",
        label: "member",
        extra: "kitchen,finance",
        flag: true,
      }),
    ).toBe("Kitchen, Finance · Team Lead");
    expect(detail({ kind: "person", label: "captain" })).toBe("Captain");
    expect(
      detail({
        kind: "announcement",
        at: Date.UTC(2026, 9, 2, 8),
        label: "team",
        team: "power_and_lighting",
      }),
    ).toMatch(/^2 Oct.* · to the Power and Lighting team$/);
    expect(detail({ kind: "questionnaire", label: "draft" })).toBe("Draft");
  });

  it("marks a duty card, for its own icon", () => {
    expect(
      presentEntry(row({ kind: "chapter", label: "duty_card", ref: "x" }), {})
        .card,
    ).toBe(true);
    expect(
      presentEntry(row({ kind: "chapter", label: "chapter", ref: "x" }), {})
        .card,
    ).toBeUndefined();
  });
});

describe("entryHref", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const cases: [Parameters<typeof entryHref>, string, string][] = [
    [["recipe", id, null], `/kitchen/recipes/${id}`, "recipe"],
    [["chapter", id, "potable-water"], "/guide/potable-water", "guide"],
    [["meeting", id, null], `/meetings/${id}`, "meeting"],
    [["task", id, null], `/tasks?task=${id}`, "tasks"],
    [["inventory", id, null], `/inventory/${id}`, "inventory"],
    [["shift", id, null], `/shifts?shift=${id}`, "shifts"],
    [["gear", id, null], `/gear?item=${id}`, "gear"],
    [["lounge", id, null], `/lounge?offer=${id}`, "lounge"],
    [
      ["person", id, null],
      `/captains/camp-management?member=${id}`,
      "camp-management",
    ],
    [["announcement", id, null], `/announcements/${id}`, "announcement"],
    [
      ["questionnaire", "pot-survey", null],
      "/captains/questionnaires/pot-survey",
      "questionnaire",
    ],
  ];

  it.each(cases)("%j opens %s in a desktop window", (args, href) => {
    expect(entryHref(...args)).toBe(href);
    // A real route, so it opens in a window rather than nowhere.
    expect(matchProgram(href)).not.toBeNull();
  });
});

describe("a text hit (#350)", () => {
  it("carries its line and nothing of the text it came from", () => {
    const entry = presentEntry(
      row({
        kind: "meeting",
        title: "Power plan review",
        at: Date.UTC(2026, 8, 30, 16),
        team: "power_and_lighting",
        match: {
          where: "in the notes",
          membersOnly: false,
          text: "…We need 40 L of fuel a day",
          marks: [{ start: 17, length: 4 }],
        },
      }),
      LABELS,
    );
    expect(Object.keys(entry).sort()).toEqual(
      ["detail", "href", "id", "kind", "match", "title"].sort(),
    );
    expect(Object.keys(entry.match!).sort()).toEqual(
      ["marks", "membersOnly", "text", "where"].sort(),
    );
    expect(entry.match!.text).toBe("…We need 40 L of fuel a day");
  });

  it("a title hit has no match at all", () => {
    expect("match" in presentEntry(row({}), LABELS)).toBe(false);
  });
});
