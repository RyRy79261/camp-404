import { describe, expect, it } from "vitest";
import { campDayKey, groupByDay } from "../notification-days";

// Camp time is SAST (UTC+2, no daylight saving). The instants below sit either
// side of camp midnight, which is 22:00 UTC, so a grouping done in the
// server's UTC would put them under the wrong day.
const at = (iso: string) => ({ createdAt: new Date(iso), id: iso });

describe("campDayKey", () => {
  it("reads the calendar day in camp time, not UTC", () => {
    expect(campDayKey(new Date("2026-09-15T21:59:00Z"))).toBe("2026-09-15");
    expect(campDayKey(new Date("2026-09-15T22:00:00Z"))).toBe("2026-09-16");
  });
});

describe("groupByDay", () => {
  const NOW = new Date("2026-09-16T10:00:00Z"); // Wed 16 Sep, 12:00 in camp

  it("labels today and yesterday, then dates", () => {
    const groups = groupByDay(
      [
        at("2026-09-16T09:00:00Z"),
        at("2026-09-15T22:30:00Z"), // 00:30 on the 16th in camp: today
        at("2026-09-15T21:30:00Z"), // 23:30 on the 15th in camp: yesterday
        at("2026-09-14T08:00:00Z"),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Mon 14 Sept", 1],
    ]);
  });

  it("names the year for a day in another year", () => {
    const [group] = groupByDay([at("2025-12-31T08:00:00Z")], NOW);
    expect(group!.label).toBe("31 Dec 2025");
  });

  it("finds yesterday across a month and a year boundary", () => {
    const newYear = new Date("2027-01-01T08:00:00Z");
    const groups = groupByDay([at("2026-12-31T08:00:00Z")], newYear);
    expect(groups[0]!.label).toBe("Yesterday");
    const march = new Date("2028-03-01T08:00:00Z"); // 2028 is a leap year
    expect(groupByDay([at("2028-02-29T08:00:00Z")], march)[0]!.label).toBe(
      "Yesterday",
    );
  });

  it("keeps order and returns nothing for nothing", () => {
    expect(groupByDay([], NOW)).toEqual([]);
    const groups = groupByDay(
      [at("2026-09-16T09:00:00Z"), at("2026-09-16T08:00:00Z")],
      NOW,
    );
    expect(groups[0]!.items.map((i) => i.id)).toEqual([
      "2026-09-16T09:00:00Z",
      "2026-09-16T08:00:00Z",
    ]);
  });
});
