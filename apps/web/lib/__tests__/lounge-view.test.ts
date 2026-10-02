import { describe, expect, it } from "vitest";
import { cellKey, loungeDays } from "@camp404/core";
import type { LoungeProgramme } from "@camp404/db/lounge";
import { printName } from "../lounge-copy";
import {
  alreadyThen,
  buildProgramme,
  dayHeadings,
  dayItems,
  dayRows,
  dayWarnings,
  filterCounts,
  filterOf,
  firstName,
  guideEntries,
  guideText,
  offerStage,
  openingDay,
  placedText,
  suggestPlacement,
  wantsText,
} from "../lounge-view";

// How the lounge programme is drawn (#269): warnings on the grid, the
// preferences shown only when given, the event guide list and paper names.

const PROGRAMME: LoungeProgramme = {
  offers: [
    {
      id: "yoga",
      kind: "activity",
      title: "Sunrise yoga",
      description: "Bring a mat.",
      durationMinutes: 60,
      recurring: true,
      publicGuide: true,
      hostName: "Sam Moon",
    },
    {
      id: "set",
      kind: "dj_set",
      title: "Sunset set",
      description: null,
      durationMinutes: 120,
      recurring: false,
      publicGuide: false,
      hostName: "DJ Kat",
    },
  ],
  slots: [
    { id: "s1", offerId: "yoga", day: 2, startMinute: 7 * 60 },
    { id: "s2", offerId: "yoga", day: 3, startMinute: 7 * 60 },
    { id: "s3", offerId: "set", day: 2, startMinute: 6 * 60 + 30 },
    // A slot whose offer is not accepted any more is left out.
    { id: "s4", offerId: "gone", day: 1, startMinute: 7 * 60 },
  ],
};

const DAYS = loungeDays({ start: "2027-04-28", end: "2027-05-03" });

describe("buildProgramme", () => {
  it("files items into cells with their overlaps", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    expect(view.items.map((i) => i.id)).toEqual(["s3", "s1", "s2"]);
    expect(view.cells.get(cellKey(2, "morning"))!.map((i) => i.id)).toEqual([
      "s3",
      "s1",
    ]);
    expect(view.items.find((i) => i.id === "s1")!.clashesWith).toEqual([
      "Sunset set",
    ]);
    expect(view.items.find((i) => i.id === "s2")!.clashesWith).toEqual([]);
  });

  it("says nothing about the host's wishes without the preferences", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    expect(view.items.every((i) => i.outside === null)).toBe(true);
  });

  it("flags a placement outside the host's wishes for someone who runs the lounge", () => {
    const view = buildProgramme(
      PROGRAMME,
      DAYS,
      new Map([["yoga", { preferredDays: [2], preferredBands: ["morning"] }]]),
    );
    expect(view.items.find((i) => i.id === "s2")!.outside).toEqual({
      day: true,
      band: false,
    });
    expect(view.items.find((i) => i.id === "s1")!.outside).toEqual({
      day: false,
      band: false,
    });
  });

  it("lists items on a day past the grid apart", () => {
    const view = buildProgramme(PROGRAMME, DAYS.slice(0, 2));
    expect(view.offGrid.map((i) => i.id)).toEqual(["s2"]);
    expect(dayItems(view, 2).map((i) => i.id)).toEqual(["s3", "s1"]);
  });
});

describe("the event guide", () => {
  it("lists only offers for the guide, with their times", () => {
    const entries = guideEntries(PROGRAMME, DAYS);
    expect(entries.map((e) => e.title)).toEqual(["Sunrise yoga"]);
    expect(entries[0]!.times).toEqual([
      "Day 2 · Thu 29 Apr, 07:00–08:00",
      "Day 3 · Fri 30 Apr, 07:00–08:00",
    ]);
    expect(entries[0]!.when).toBe("Day 2, 3 · 07:00–08:00");
    expect(guideText(entries)).toBe(
      "Sunrise yoga (Activity, recurring)\nBring a mat.\nDay 2 · Thu 29 Apr, 07:00–08:00; Day 3 · Fri 30 Apr, 07:00–08:00",
    );
  });
});

describe("printName", () => {
  it("prints a first name and a surname initial, never an address", () => {
    expect(printName("Sam Moon")).toBe("Sam M.");
    expect(printName("Sam van der Moon")).toBe("Sam M.");
    expect(printName("Kat")).toBe("Kat");
    expect(printName("sam@example.com")).toBe("Camp member");
    expect(printName("Unnamed member")).toBe("Camp member");
  });
});

// --- The redesign (option A, owner 2026-10-01) ---------------------------------

describe("one day's warnings", () => {
  it("marks an overlap once, on the item that starts inside the other", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    const warnings = dayWarnings(dayItems(view, 2));
    expect(warnings.get("s3")).toBe("");
    expect(warnings.get("s1")).toBe("Overlaps Sunset set.");
  });

  it("tells a placement outside the host's wishes on its own item", () => {
    const view = buildProgramme(
      PROGRAMME,
      DAYS,
      new Map([["yoga", { preferredDays: [2], preferredBands: ["morning"] }]]),
    );
    expect(dayWarnings(dayItems(view, 3)).get("s2")).toBe(
      "Not a day the host ticked.",
    );
  });
});

describe("one day's rows", () => {
  it("puts the free time between items as gap rows, 06:00 to 06:00", () => {
    const view = buildProgramme(PROGRAMME, DAYS);
    const rows = dayRows(dayItems(view, 2));
    expect(
      rows.map((r) =>
        r.kind === "gap" ? `gap ${r.from}-${r.to}` : `item ${r.item.id}`,
      ),
    ).toEqual([
      // 06:00–06:30 is free, then the set (06:30–08:30) and the yoga inside it.
      "gap 360-390",
      "item s3",
      "item s1",
      // From the end of the set to 06:00 the next morning.
      "gap 510-360",
    ]);
  });

  it("says a day with nothing on is free all day", () => {
    expect(dayRows([])).toEqual([
      { kind: "gap", from: 360, to: 360, all: true },
    ]);
  });

  it("keeps an item after midnight at the end of its day", () => {
    const late = {
      ...buildProgramme(PROGRAMME, DAYS).items[0]!,
      id: "late",
      startMinute: 60,
      durationMinutes: 60,
    };
    const rows = dayRows([late]);
    expect(
      rows.map((r) => (r.kind === "gap" ? [r.from, r.to] : "late")),
    ).toEqual([[360, 60], "late", [120, 360]]);
  });
});

describe("the day the programme opens on", () => {
  it("is today during the Burn, else the first day with anything on", () => {
    const items = [{ day: 3 }, { day: 5 }];
    expect(openingDay(items, DAYS, 4)).toBe(4);
    expect(openingDay(items, DAYS, null)).toBe(3);
    expect(openingDay([], DAYS, null)).toBe(1);
  });
});

describe("the offers table's stages and filters", () => {
  it("tells an accepted offer to place from one on the programme", () => {
    expect(offerStage("offered", 0)).toBe("new");
    expect(offerStage("accepted", 0)).toBe("to_place");
    expect(offerStage("accepted", 2)).toBe("on");
    expect(offerStage("needs_changes", 0)).toBe("changes");
    expect(offerStage("declined", 0)).toBe("declined");
  });

  it("counts new and unplaced offers as the Ministry's to act on", () => {
    expect(filterOf("new")).toBe("act");
    expect(filterOf("to_place")).toBe("act");
    expect(
      filterCounts(["new", "to_place", "on", "on", "changes", "declined"]),
    ).toEqual({ all: 6, act: 2, on: 2, changes: 1, declined: 1 });
  });
});

describe("the table's words", () => {
  it("says what the host asked for", () => {
    expect(
      wantsText({ preferredDays: [6, 4], preferredBands: ["afternoon"] }),
    ).toEqual({ days: "Day 4 or 6", times: "Afternoon" });
    expect(wantsText({ preferredDays: [2, 3, 4], preferredBands: [] })).toEqual(
      { days: "Day 2, 3 or 4", times: "Any time" },
    );
    expect(wantsText({ preferredDays: [], preferredBands: [] }).days).toBe(
      "Any day",
    );
  });

  it("says where an offer is on, sharing a start time", () => {
    const slots = [
      { day: 3, startMinute: 420 },
      { day: 2, startMinute: 420 },
      { day: 5, startMinute: 1080 },
    ];
    expect(placedText(slots)).toBe("Day 2, 3 · 07:00; Day 5 · 18:00");
    expect(placedText(slots.slice(0, 2), 60)).toBe("Day 2, 3 · 07:00–08:00");
  });

  it("names a host by their first name", () => {
    expect(firstName("Thandi Nkosi")).toBe("Thandi");
    expect(firstName("  Kat ")).toBe("Kat");
  });

  it("names each day by its date once the Burn's dates are set", () => {
    const [first] = dayHeadings(DAYS);
    expect(first).toEqual({
      day: 1,
      chip: "Wed 28",
      title: "Day 1 · Wednesday 28 April",
      shortTitle: "Day 1 · 28 April",
    });
    expect(dayHeadings(loungeDays(null))[0]).toEqual({
      day: 1,
      chip: null,
      title: "Day 1",
      shortTitle: "Day 1",
    });
  });
});

describe("where the place panel starts", () => {
  const DAY_NUMBERS = DAYS.map((d) => d.day);
  const offer = {
    id: "breath",
    durationMinutes: 45,
    preferredDays: [5],
    preferredBands: ["afternoon" as const],
  };

  it("is the host's day at the start of their time when it is free", () => {
    expect(suggestPlacement(offer, DAY_NUMBERS, [])).toEqual({
      day: 5,
      startMinute: 14 * 60,
    });
  });

  it("is the first free start in their time when something is on", () => {
    const placed = [
      {
        id: "x",
        offerId: "other",
        day: 5,
        startMinute: 14 * 60,
        durationMinutes: 60,
        title: "Kombucha tasting",
      },
    ];
    expect(suggestPlacement(offer, DAY_NUMBERS, placed)).toEqual({
      day: 5,
      startMinute: 15 * 60,
    });
  });

  it("is another day for another time, never a day the offer is on", () => {
    const yoga = {
      id: "yoga",
      durationMinutes: 60,
      preferredDays: [2, 3, 4],
      preferredBands: ["morning" as const],
    };
    const placed = [2, 3].map((day) => ({
      id: `y${day}`,
      offerId: "yoga",
      day,
      startMinute: 7 * 60,
      durationMinutes: 60,
      title: "Sunrise yoga",
    }));
    expect(suggestPlacement(yoga, DAY_NUMBERS, placed)).toEqual({
      day: 4,
      startMinute: 6 * 60,
    });
  });

  it("lists what is already on that day in the same band", () => {
    const placed = [
      {
        id: "a",
        day: 3,
        startMinute: 18 * 60,
        durationMinutes: 120,
        title: "Sunset deep house",
      },
      {
        id: "b",
        day: 3,
        startMinute: 7 * 60,
        durationMinutes: 60,
        title: "Sunrise yoga",
      },
    ];
    expect(alreadyThen(3, 19 * 60, placed).map((p) => p.id)).toEqual(["a"]);
    expect(alreadyThen(4, 19 * 60, placed)).toEqual([]);
  });
});
