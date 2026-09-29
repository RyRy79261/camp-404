import { describe, expect, it } from "vitest";
import {
  DecideLoungeOfferInput,
  LoungeOfferInput,
  PlaceLoungeOfferInput,
} from "@camp404/types";
import {
  DEFAULT_LOUNGE_DAYS,
  LOUNGE_TEAM,
  bandOf,
  bandRange,
  canRunLounge,
  cellKey,
  clockText,
  durationText,
  loungeDayOf,
  loungeDays,
  loungeOverlaps,
  outsidePreferences,
  programmeGrid,
  programmeMinute,
  type PlacedItem,
} from "../lounge";

describe("canRunLounge", () => {
  it("lets a captain run the lounge without leading any team", () => {
    expect(canRunLounge("captain", [])).toBe(true);
  });

  it("lets a lead of the Ministry of Vibes run it", () => {
    expect(canRunLounge("team_lead", [LOUNGE_TEAM])).toBe(true);
    expect(canRunLounge("team_lead", ["kitchen", LOUNGE_TEAM])).toBe(true);
  });

  it("refuses a lead of another team", () => {
    expect(canRunLounge("team_lead", ["kitchen"])).toBe(false);
    expect(canRunLounge("team_lead", [])).toBe(false);
  });

  it("refuses a plain member, even one who names the team", () => {
    expect(canRunLounge("camp_member", [LOUNGE_TEAM])).toBe(false);
  });

  it("fails closed on a rank it does not know", () => {
    expect(canRunLounge("member", [LOUNGE_TEAM])).toBe(false);
    expect(canRunLounge("god", [LOUNGE_TEAM])).toBe(false);
    expect(canRunLounge("", [])).toBe(false);
  });
});

describe("time", () => {
  it("counts the programme day from 06:00", () => {
    expect(programmeMinute(6 * 60)).toBe(0);
    expect(programmeMinute(5 * 60 + 45)).toBe(1425);
    expect(programmeMinute(0)).toBe(18 * 60);
  });

  it("puts a start time in its band", () => {
    expect(bandOf(6 * 60)).toBe("morning");
    expect(bandOf(9 * 60 + 45)).toBe("morning");
    expect(bandOf(10 * 60)).toBe("midday");
    expect(bandOf(18 * 60)).toBe("sunset");
    expect(bandOf(22 * 60)).toBe("night");
    expect(bandOf(1 * 60)).toBe("night");
    expect(bandOf(2 * 60)).toBe("late_night");
    expect(bandOf(5 * 60 + 45)).toBe("late_night");
  });

  it("gives each band's hours", () => {
    expect(bandRange("morning")).toEqual({ from: 360, to: 600 });
    expect(bandRange("night")).toEqual({ from: 1320, to: 120 });
    expect(bandRange("late_night")).toEqual({ from: 120, to: 360 });
  });

  it("writes times and lengths plainly", () => {
    expect(clockText(0)).toBe("00:00");
    expect(clockText(21 * 60 + 30)).toBe("21:30");
    expect(durationText(45)).toBe("45 min");
    expect(durationText(120)).toBe("2 h");
    expect(durationText(90)).toBe("1 h 30 min");
  });
});

describe("loungeDays", () => {
  it("numbers the default days when the Burn has no dates", () => {
    const days = loungeDays(null);
    expect(days).toHaveLength(DEFAULT_LOUNGE_DAYS);
    expect(days[0]).toEqual({
      day: 1,
      date: null,
      label: "Day 1",
      short: "Day 1",
    });
  });

  it("dates each day of the Burn, across a month's end", () => {
    const days = loungeDays({ start: "2027-04-28", end: "2027-05-03" });
    expect(days.map((d) => d.date)).toEqual([
      "2027-04-28",
      "2027-04-29",
      "2027-04-30",
      "2027-05-01",
      "2027-05-02",
      "2027-05-03",
    ]);
    expect(days[0]!.label).toBe("Day 1 · Wed 28 Apr");
    expect(days[3]!.short).toBe("Sat 1 May");
  });

  it("falls back to numbered days on dates that make no sense", () => {
    expect(loungeDays({ start: "2027-05-03", end: "2027-04-28" })).toHaveLength(
      DEFAULT_LOUNGE_DAYS,
    );
    expect(loungeDays({ start: "nope", end: "2027-04-28" })[0]!.date).toBe(
      null,
    );
  });

  it("finds today's programme day in camp time, the small hours on the night before", () => {
    const days = loungeDays({ start: "2027-04-28", end: "2027-05-03" });
    // 09:00 camp time on 29 Apr is day 2.
    expect(loungeDayOf(new Date("2027-04-29T07:00:00Z"), days)).toBe(2);
    // 02:00 camp time on 30 Apr is still the night of day 2.
    expect(loungeDayOf(new Date("2027-04-30T00:00:00Z"), days)).toBe(2);
    // Before the Burn, and without dates, there is no day.
    expect(loungeDayOf(new Date("2027-04-01T10:00:00Z"), days)).toBe(null);
    expect(loungeDayOf(new Date(), loungeDays(null))).toBe(null);
  });
});

function item(overrides: Partial<PlacedItem> & { id: string }): PlacedItem {
  return {
    day: 1,
    startMinute: 20 * 60,
    durationMinutes: 60,
    hostId: null,
    ...overrides,
  };
}

describe("loungeOverlaps", () => {
  it("finds two things on at once", () => {
    const overlaps = loungeOverlaps([
      item({ id: "a", startMinute: 20 * 60, durationMinutes: 90 }),
      item({ id: "b", startMinute: 21 * 60 }),
      item({ id: "c", startMinute: 22 * 60 }),
    ]);
    expect(overlaps.get("a")).toEqual(["b"]);
    expect(overlaps.get("b")).toEqual(["a"]);
    expect(overlaps.has("c")).toBe(false);
  });

  it("does not count back-to-back items", () => {
    const overlaps = loungeOverlaps([
      item({ id: "a", startMinute: 20 * 60, durationMinutes: 60 }),
      item({ id: "b", startMinute: 21 * 60 }),
    ]);
    expect(overlaps.size).toBe(0);
  });

  it("sees a late set on day 1 running into day 2's morning", () => {
    const overlaps = loungeOverlaps([
      item({ id: "late", day: 1, startMinute: 5 * 60, durationMinutes: 120 }),
      item({ id: "yoga", day: 2, startMinute: 6 * 60 + 30 }),
    ]);
    expect(overlaps.get("yoga")).toEqual(["late"]);
  });

  it("keeps the same time on different days apart", () => {
    expect(
      loungeOverlaps([item({ id: "a", day: 1 }), item({ id: "b", day: 2 })])
        .size,
    ).toBe(0);
  });
});

describe("outsidePreferences", () => {
  const offer = { preferredDays: [2, 3], preferredBands: ["sunset" as const] };

  it("is quiet when the placement is what the host asked for", () => {
    expect(outsidePreferences(offer, { day: 2, startMinute: 18 * 60 })).toEqual(
      { day: false, band: false },
    );
  });

  it("flags a day and a band the host did not tick", () => {
    expect(outsidePreferences(offer, { day: 5, startMinute: 9 * 60 })).toEqual({
      day: true,
      band: true,
    });
  });

  it("treats no ticks as any day and any time", () => {
    expect(
      outsidePreferences(
        { preferredDays: [], preferredBands: [] },
        { day: 7, startMinute: 3 * 60 },
      ),
    ).toEqual({ day: false, band: false });
  });
});

describe("programmeGrid", () => {
  it("files items by day and band, in programme order, and leaves off days outside the grid", () => {
    const days = loungeDays(null).slice(0, 2);
    const grid = programmeGrid(
      [
        item({ id: "two-am", day: 1, startMinute: 2 * 60 }),
        item({ id: "sunset", day: 1, startMinute: 18 * 60 }),
        item({ id: "later-sunset", day: 1, startMinute: 19 * 60 }),
        item({ id: "gone", day: 9 }),
      ],
      days,
    );
    expect(grid.get(cellKey(1, "late_night"))!.map((i) => i.id)).toEqual([
      "two-am",
    ]);
    expect(grid.get(cellKey(1, "sunset"))!.map((i) => i.id)).toEqual([
      "sunset",
      "later-sunset",
    ]);
    expect([...grid.values()].flat().some((i) => i.id === "gone")).toBe(false);
  });
});

describe("the input shapes", () => {
  it("takes a DJ set with blanks as no answer", () => {
    const parsed = LoungeOfferInput.parse({
      title: " Sunset set ",
      description: "  ",
      kind: "dj_set",
      durationMinutes: 90,
      needs: ["sound", "power"],
      preferredDays: [2],
      preferredBands: ["sunset"],
    });
    expect(parsed.title).toBe("Sunset set");
    expect(parsed.description).toBe(null);
    expect(parsed.recurring).toBe(false);
    expect(parsed.publicGuide).toBe(false);
  });

  it("refuses a length off the 15-minute steps and a repeated day", () => {
    expect(
      LoungeOfferInput.safeParse({
        title: "x",
        kind: "activity",
        durationMinutes: 50,
      }).success,
    ).toBe(false);
    expect(
      LoungeOfferInput.safeParse({
        title: "x",
        kind: "activity",
        durationMinutes: 60,
        preferredDays: [2, 2],
      }).success,
    ).toBe(false);
  });

  it("needs a reason to decline or ask for changes, but not to accept", () => {
    const base = {
      offerId: "o1",
      expectedStatus: "offered",
      expectedVersion: 1,
    } as const;
    expect(
      DecideLoungeOfferInput.safeParse({ ...base, decision: "accepted" })
        .success,
    ).toBe(true);
    expect(
      DecideLoungeOfferInput.safeParse({ ...base, decision: "declined" })
        .success,
    ).toBe(false);
    expect(
      DecideLoungeOfferInput.safeParse({
        ...base,
        decision: "needs_changes",
        reason: "Shorter, please",
      }).success,
    ).toBe(true);
  });

  it("refuses a decision that changes nothing", () => {
    expect(
      DecideLoungeOfferInput.safeParse({
        offerId: "o1",
        decision: "accepted",
        expectedStatus: "accepted",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
  });

  it("places on 15-minute steps within the day", () => {
    expect(
      PlaceLoungeOfferInput.safeParse({ offerId: "o", day: 1, startMinute: 0 })
        .success,
    ).toBe(true);
    expect(
      PlaceLoungeOfferInput.safeParse({ offerId: "o", day: 1, startMinute: 10 })
        .success,
    ).toBe(false);
    expect(
      PlaceLoungeOfferInput.safeParse({
        offerId: "o",
        day: 1,
        startMinute: 24 * 60,
      }).success,
    ).toBe(false);
  });
});
