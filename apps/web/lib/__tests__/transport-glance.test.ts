import { describe, expect, it } from "vitest";
import type { AttendancePhaseBoard } from "@camp404/core";
import type { LogisticsPhaseRow } from "@camp404/db/logistics";
import type { TrailerRow, TransportCar } from "@camp404/db/transport";
import { nextPhase, transportGlance } from "../team-glance/transport";

// Transport and Logistics' "Getting there" panel (approved mock-up
// 2026-11-12): counts from the Transport board, the lift requests (an editor
// only), the Logistics days and the attendance view.

// 10:00 in Cape Town on 14 Mar 2027.
const NOW = new Date("2027-03-14T08:00:00Z");

function car(over: Partial<TransportCar> = {}): TransportCar {
  return {
    driverUserId: "d1",
    driverName: "Driver",
    vehicle: null,
    vehicleMake: null,
    departureCity: null,
    seatsOffered: 3,
    canTow: false,
    riders: [],
    trailer: null,
    ...over,
  };
}

function trailer(over: Partial<TrailerRow> = {}): TrailerRow {
  return {
    id: "t1",
    name: "Big trailer",
    notes: null,
    version: 1,
    towedByUserId: null,
    towedByName: null,
    ...over,
  };
}

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
  cant = 0,
): AttendancePhaseBoard {
  const names = (n: number, tag: string) =>
    Array.from({ length: n }, (_, i) => `${tag}${i}`);
  return {
    phase: p,
    names: {
      going: names(going, "g"),
      maybe: names(maybe, "m"),
      cant: names(cant, "c"),
    },
    notAnswered: [],
  };
}

const EMPTY_ATTENDANCE = { phases: [], notAnsweredCount: {} };

describe("transportGlance", () => {
  it("says nothing is set up in an empty year", () => {
    const g = transportGlance({
      cars: [],
      trailers: [],
      openRequests: null,
      phases: [],
      attendance: EMPTY_ATTENDANCE,
      now: NOW,
    });
    expect(g.tiles.map((t) => [t.key, t.value, t.hint])).toEqual([
      ["seats", "—", "No cars this year yet"],
      ["riders", "0", "in the cars so far"],
      ["trailers", "0", "none this year"],
      ["next-phase", "—", "No days ahead are set yet"],
    ]);
    expect(g.attention).toEqual([]);
    expect(g.bars?.[0]?.rows.map((r) => r.value)).toEqual([
      "0 going",
      "0 going",
      "0 going",
      "0 going",
    ]);
  });

  it("counts free seats after riders, and untowed trailers", () => {
    const g = transportGlance({
      cars: [
        car({ seatsOffered: 3, riders: [{} as never] }),
        car({ driverUserId: "d2", seatsOffered: 4 }),
        // Seats not said: counts as a car, not as seats.
        car({ driverUserId: "d3", seatsOffered: null }),
      ],
      trailers: [trailer(), trailer({ id: "t2", towedByUserId: "d2" })],
      openRequests: 2,
      phases: [],
      attendance: EMPTY_ATTENDANCE,
      now: NOW,
    });
    const seats = g.tiles.find((t) => t.key === "seats")!;
    expect(seats.value).toBe("6");
    expect(seats.hint).toBe("of 7 offered, in 3 cars, after riders");
    const lifts = g.tiles.find((t) => t.key === "lifts")!;
    expect([lifts.value, lifts.tone]).toEqual(["2", "warn"]);
    const trailers = g.tiles.find((t) => t.key === "trailers")!;
    expect([trailers.value, trailers.hint, trailers.tone]).toEqual([
      "2",
      "1 with no car to tow it",
      "warn",
    ]);
    expect(g.attention.map((a) => a.text)).toEqual([
      "2 lift requests are waiting for an answer.",
      "1 trailer has no car to tow it.",
    ]);
  });

  it("gives a viewer who is not an editor the riders, never the requests", () => {
    const g = transportGlance({
      cars: [car({ riders: [{} as never, {} as never] })],
      trailers: [],
      openRequests: null,
      phases: [],
      attendance: EMPTY_ATTENDANCE,
      now: NOW,
    });
    expect(g.tiles.some((t) => t.key === "lifts")).toBe(false);
    expect(g.tiles.find((t) => t.key === "riders")?.value).toBe("2");
    expect(g.attention.some((a) => a.key === "lifts")).toBe(false);
  });

  it("names the next phase and the days to it, on the camp's clock", () => {
    const g = transportGlance({
      cars: [],
      trailers: [],
      openRequests: null,
      phases: [
        phase("pack", "2027-04-06"),
        phase("build", "2027-04-13", "2027-04-19"),
      ],
      attendance: EMPTY_ATTENDANCE,
      now: NOW,
    });
    const next = g.tiles.find((t) => t.key === "next-phase")!;
    expect([next.label, next.value, next.hint]).toEqual([
      "Next phase",
      "Pack",
      "in 23 days, on 6 Apr",
    ]);
  });

  it("says which phase is on now", () => {
    expect(
      nextPhase([phase("build", "2027-03-10", "2027-03-20")], "2027-03-14"),
    ).toMatchObject({ kind: "now", phase: { phase: "build" } });
    expect(
      nextPhase([phase("build", "2027-03-01", "2027-03-05")], "2027-03-14"),
    ).toBeNull();
  });

  it("stacks who helps per phase, and flags open phases with answers missing", () => {
    const g = transportGlance({
      cars: [],
      trailers: [],
      openRequests: null,
      // Pack has started: its missing answers are no longer asked for.
      phases: [
        phase("pack", "2027-03-10", "2027-03-20"),
        phase("build", "2027-04-13"),
      ],
      attendance: {
        phases: [board("pack", 2), board("build", 9, 3, 1)],
        notAnsweredCount: { pack: 4, build: 6 },
      },
      now: NOW,
    });
    const build = g.bars![0]!.rows.find((r) => r.key === "build")!;
    expect(build.value).toBe("9 going");
    expect(build.segments?.map((s) => s.count)).toEqual([9, 3, 1, 6]);
    expect(g.attention.map((a) => a.text)).toEqual([
      "Build: 6 people coming have not said if they help.",
    ]);
  });
});
