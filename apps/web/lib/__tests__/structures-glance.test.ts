import { describe, expect, it } from "vitest";
import type { AttendancePhaseBoard } from "@camp404/core";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import { structuresGlance } from "../team-glance/structures";

// Structures' "The build" panel (approved mock-up 2026-11-12).

const NOW = new Date("2027-03-14T08:00:00Z");

function phase(
  p: LogisticsPhaseRow["phase"],
  startDate: string | null,
  endDate: string | null = startDate,
): LogisticsPhaseRow {
  return {
    cycle: 2027,
    phase: p,
    startDate,
    endDate,
    place: null,
    note: null,
    calendarEventId: null,
    calendarSyncedVersion: null,
    version: 1,
    updatedAt: NOW,
  };
}

function board(
  p: AttendancePhaseBoard["phase"],
  going: number,
  maybe = 0,
): AttendancePhaseBoard {
  const names = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  return {
    phase: p,
    names: { going: names(going), maybe: names(maybe), cant: [] },
    notAnswered: [],
  };
}

const EMPTY = { phases: [], notAnsweredCount: {} };

describe("structuresGlance", () => {
  it("says no plan and no days in an empty year", () => {
    const g = structuresGlance({
      layout: { version: 0, savedAt: null, shared: false },
      phases: [],
      attendance: EMPTY,
      canEditLayout: true,
      now: NOW,
    });
    expect(g.tiles.map((t) => [t.key, t.value])).toEqual([
      ["layout", "—"],
      ["build-crew", "0 going"],
      ["build-starts", "—"],
      ["strike-crew", "0 going"],
    ]);
    expect(g.attention).toEqual([
      expect.objectContaining({
        key: "layout",
        link: { href: "/camp-layout", label: "Start the plan" },
      }),
    ]);
  });

  it("reads the layout's version and when it was saved, and the neighbour page", () => {
    const g = structuresGlance({
      layout: {
        version: 7,
        savedAt: new Date("2027-03-11T09:00:00Z"),
        shared: true,
      },
      phases: [phase("build", "2027-04-13", "2027-04-19")],
      attendance: {
        phases: [board("build", 9, 3), board("strike", 6, 4)],
        notAnsweredCount: { build: 6, strike: 0 },
      },
      canEditLayout: false,
      now: NOW,
    });
    const tile = (k: string) => g.tiles.find((t) => t.key === k)!;
    expect([tile("layout").value, tile("layout").hint]).toEqual([
      "Version 7",
      "saved 3 days ago",
    ]);
    expect([tile("build-crew").hint, tile("build-crew").tone]).toEqual([
      "3 maybe · 6 not answered",
      "warn",
    ]);
    expect([tile("build-starts").value, tile("build-starts").hint]).toEqual([
      "in 30 days",
      "on 13 Apr",
    ]);
    expect(tile("strike-crew").hint).toBe("4 maybe");
    expect(g.attention.map((a) => a.text)).toEqual([
      "Build: 6 people coming have not said if they help.",
      "The neighbour page is on.",
    ]);
  });

  it("says Build is on now, then done", () => {
    const during = structuresGlance({
      layout: { version: 1, savedAt: NOW, shared: false },
      phases: [phase("build", "2027-03-10", "2027-03-20")],
      attendance: { phases: [], notAnsweredCount: { build: 5 } },
      canEditLayout: false,
      now: NOW,
    });
    const starts = during.tiles.find((t) => t.key === "build-starts")!;
    expect([starts.value, starts.hint]).toEqual(["On now", "until 20 Mar"]);
    // Build has started: its missing answers are no longer asked for.
    expect(during.attention.map((a) => a.key)).toEqual(["neighbours"]);
    expect(during.attention[0]?.text).toBe("The neighbour page is off.");

    const after = structuresGlance({
      layout: { version: 1, savedAt: NOW, shared: false },
      phases: [phase("build", "2027-03-01", "2027-03-05")],
      attendance: EMPTY,
      canEditLayout: false,
      now: NOW,
    });
    expect(after.tiles.find((t) => t.key === "build-starts")?.value).toBe(
      "Done",
    );
  });
});
