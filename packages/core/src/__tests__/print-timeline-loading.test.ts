import { describe, expect, it } from "vitest";
import { INVENTORY_CATEGORIES } from "@camp404/types";
import { loadingChecklist } from "../inventory";
import { burnTimeline, type TimelinePhase } from "../logistics";

// Two of the #249 prints (Option A, owner 2026-10-02): the burn timeline's
// day strip (counts only, never names) and the loading checklist, grouped by
// the inventory's categories (the owner: "We have categories of stuff that we
// own", not shelves).

describe("burnTimeline", () => {
  const phases: TimelinePhase[] = [
    { phase: "pack", startDate: "2027-04-17", endDate: "2027-04-17" },
    { phase: "travel", startDate: "2027-04-21", endDate: "2027-04-21" },
    { phase: "build", startDate: "2027-04-22", endDate: "2027-04-24" },
    { phase: "burn", startDate: "2027-04-25", endDate: "2027-05-01" },
    { phase: "strike", startDate: "2027-05-02", endDate: "2027-05-03" },
    { phase: "unpack", startDate: "2027-05-08", endDate: "2027-05-08" },
  ];
  const answers = {
    pack: { going: 9, maybe: 3 },
    build: { going: 31, maybe: 6 },
    strike: { going: 27, maybe: 9 },
    unpack: { going: 7, maybe: 2 },
  };
  const strip = burnTimeline({ phases, answers, accepted: 58 });

  it("runs Pack to Unpack, a run of days with nothing on as one column", () => {
    expect(
      strip.map((c) => (c.kind === "gap" ? `gap ${c.from}..${c.to}` : c.date)),
    ).toEqual([
      "2027-04-17",
      "gap 2027-04-18..2027-04-20",
      "2027-04-21",
      "2027-04-22",
      "2027-04-23",
      "2027-04-24",
      "2027-04-25",
      "2027-04-26",
      "2027-04-27",
      "2027-04-28",
      "2027-04-29",
      "2027-04-30",
      "2027-05-01",
      "2027-05-02",
      "2027-05-03",
      "gap 2027-05-04..2027-05-07",
      "2027-05-08",
    ]);
  });

  it("counts going and maybe on the days asked, accepted members on burn days, nothing for travel", () => {
    const days = strip.flatMap((c) => (c.kind === "day" ? [c] : []));
    const at = (date: string) => days.find((d) => d.date === date)!;
    expect(at("2027-04-17")).toMatchObject({
      phase: "pack",
      allHands: true,
      people: 9,
      maybe: 3,
      first: true,
    });
    expect(at("2027-04-21")).toMatchObject({
      phase: "travel",
      allHands: false,
      people: null,
      maybe: null,
    });
    // Attendance is asked per phase: every Build day shows the Build count.
    expect(at("2027-04-23")).toMatchObject({
      phase: "build",
      people: 31,
      maybe: 6,
      first: false,
    });
    expect(at("2027-04-26")).toMatchObject({
      phase: "burn",
      allHands: false,
      people: 58,
      maybe: null,
    });
    expect(at("2027-05-08")).toMatchObject({
      phase: "unpack",
      people: 7,
      maybe: 2,
      first: true,
    });
    // A band's label goes on its first day only.
    expect(days.filter((d) => d.first).map((d) => d.phase)).toEqual([
      "pack",
      "travel",
      "build",
      "burn",
      "strike",
      "unpack",
    ]);
  });

  it("counts 0 for a phase nobody answered, and gives a shared day to the later phase", () => {
    const strip2 = burnTimeline({
      phases: [
        { phase: "pack", startDate: "2027-04-20", endDate: "2027-04-21" },
        { phase: "travel", startDate: "2027-04-21", endDate: "2027-04-21" },
      ],
      answers: {},
      accepted: 0,
    });
    expect(strip2).toEqual([
      {
        kind: "day",
        date: "2027-04-20",
        phase: "pack",
        first: true,
        allHands: true,
        people: 0,
        maybe: 0,
      },
      {
        kind: "day",
        date: "2027-04-21",
        phase: "travel",
        first: true,
        allHands: false,
        people: null,
        maybe: null,
      },
    ]);
  });

  it("is empty when no phase has days, and skips a phase with bad or missing days", () => {
    expect(burnTimeline({ phases: [], answers, accepted: 1 })).toEqual([]);
    expect(
      burnTimeline({
        phases: [
          { phase: "pack", startDate: null, endDate: null },
          { phase: "build", startDate: "2027-04-24", endDate: "2027-04-22" },
          { phase: "burn", startDate: "2027-04-25", endDate: "2027-04-25" },
        ],
        answers,
        accepted: 40,
      }),
    ).toEqual([
      {
        kind: "day",
        date: "2027-04-25",
        phase: "burn",
        first: true,
        allHands: false,
        people: 40,
        maybe: null,
      },
    ]);
  });
});

describe("loadingChecklist", () => {
  const item = (
    name: string,
    category: (typeof INVENTORY_CATEGORIES)[number],
    weightKg: number | null,
  ) => ({ name, category, weightKg });

  it("groups every item by the Gear tab's categories, by name inside each, with the weight where known", () => {
    const list = loadingChecklist([
      item("Potjies, 25 L", "kitchen", 54),
      item("Generator, 5.5 kVA", "power", 78),
      item("Shade cloth", "structures", 48.1),
      item("Extension reels", "power", null),
      item("Gas burners", "kitchen", 36.2),
      item("Cooler boxes", "cooling", null),
      item("neon cat sign", "decor", 18),
    ]);
    expect(
      list.groups.map((g) => [g.category, g.items.map((i) => i.name)]),
    ).toEqual([
      ["kitchen", ["Gas burners", "Potjies, 25 L"]],
      ["cooling", ["Cooler boxes"]],
      ["structures", ["Shade cloth"]],
      ["power", ["Extension reels", "Generator, 5.5 kVA"]],
      ["decor", ["neon cat sign"]],
    ]);
    expect(list.count).toBe(7);
    expect(list.weightKg).toBe(234.3);
    expect(list.weighed).toBe(true);
  });

  it("follows INVENTORY_CATEGORIES' order whatever the items' order", () => {
    const all = [...INVENTORY_CATEGORIES]
      .reverse()
      .map((c) => item(c, c, null));
    expect(loadingChecklist(all).groups.map((g) => g.category)).toEqual([
      ...INVENTORY_CATEGORIES,
    ]);
  });

  it("says when nothing is weighed", () => {
    expect(loadingChecklist([item("Rope", "tools", null)])).toMatchObject({
      count: 1,
      weightKg: 0,
      weighed: false,
    });
    expect(loadingChecklist([])).toEqual({
      groups: [],
      count: 0,
      weightKg: 0,
      weighed: false,
    });
  });
});
