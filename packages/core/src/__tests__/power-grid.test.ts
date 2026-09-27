import { describe, expect, it } from "vitest";
import {
  cableBand,
  downstreamIds,
  gridRuns,
  runAmps,
  suggestedAmpsForGauge,
  treeOrder,
  wouldLoop,
  type GridLoad,
  type GridPoint,
} from "../power-grid";

// The grid plan (#256). A run carries everything at or beyond its far end, at
// full draw, at mains voltage: summed through two levels of junctions, with
// the duty cycle left out and time windows respected. A cable warns from 80%
// of its rating and fails above 100%; a run with no rating is unknown, never
// guessed.

const point = (
  id: string,
  parentId: string | null,
  cableRatedAmps: number | null = null,
): GridPoint => ({ id, parentId, cableRatedAmps });

// gen ─ main ─ right ─ kitchen
//          └─ lounge
//     └ charging
const GRID = [
  point("gen", null),
  point("main", "gen", 16),
  point("right", "main", 10),
  point("kitchen", "right", 10),
  point("lounge", "main", 10),
  point("charging", "gen", 10),
];

function load(
  gridNodeId: string | null,
  wattsEach: number,
  more: Partial<GridLoad> = {},
): GridLoad {
  return {
    area: "camp",
    category: "other",
    quantity: 1,
    wattsEach,
    dutyPct: 100,
    schedule: "full_time",
    gridNodeId,
    ...more,
  };
}

const LOADS = [
  load("kitchen", 1150),
  load("lounge", 460),
  load("charging", 230),
  load(null, 5000),
];

describe("downstream of a point", () => {
  it("is the point and everything beyond it", () => {
    expect([...downstreamIds(GRID, "main")].sort()).toEqual([
      "kitchen",
      "lounge",
      "main",
      "right",
    ]);
    expect([...downstreamIds(GRID, "kitchen")]).toEqual(["kitchen"]);
  });

  it("knows a point beyond cannot feed it", () => {
    expect(wouldLoop(GRID, "main", "kitchen")).toBe(true);
    expect(wouldLoop(GRID, "main", "main")).toBe(true);
    expect(wouldLoop(GRID, "kitchen", "lounge")).toBe(false);
  });
});

describe("runAmps", () => {
  it("sums the loads through two levels of junctions: 1150 + 460 W is 7 A", () => {
    expect(runAmps(GRID, LOADS, "main", 11)).toBeCloseTo(7, 6);
    expect(runAmps(GRID, LOADS, "right", 11)).toBeCloseTo(5, 6);
    expect(runAmps(GRID, LOADS, "kitchen", 11)).toBeCloseTo(5, 6);
    expect(runAmps(GRID, LOADS, "charging", 11)).toBeCloseTo(1, 6);
  });

  it("leaves out a load not on the grid", () => {
    // The 5000 W load has no point: nothing carries it.
    expect(runAmps(GRID, LOADS, "gen", 11)).toBeCloseTo(8, 6);
  });

  it("takes the full draw, not the duty cycle: a compressor pulls it all while it runs", () => {
    const fridge = load("kitchen", 230, { dutyPct: 40 });
    expect(runAmps(GRID, [fridge], "kitchen", 11)).toBeCloseTo(1, 6);
  });

  it("does not add loads that never run at the same time", () => {
    const night = load("lounge", 460, {
      schedule: "windows",
      windows: [{ fromHour: 18, toHour: 2 }],
    });
    const day = load("kitchen", 690, {
      schedule: "windows",
      windows: [{ fromHour: 8, toHour: 16 }],
    });
    // 3 A in the day, 2 A at night; never 5.
    expect(runAmps(GRID, [night, day], "main", 11)).toBeCloseTo(3, 6);
  });

  it("is mains current whatever the load's own voltage", () => {
    const strip = load("lounge", 460, { volts: 12 } as Partial<GridLoad>);
    expect(runAmps(GRID, [strip], "lounge", 11)).toBeCloseTo(2, 6);
  });
});

describe("cableBand", () => {
  it("warns from 80% and fails above 100%", () => {
    expect(cableBand(7.99, 10)).toBe("ok");
    expect(cableBand(8, 10)).toBe("warn");
    expect(cableBand(10, 10)).toBe("warn");
    expect(cableBand(10.01, 10)).toBe("over");
  });

  it("never guesses a rating", () => {
    expect(cableBand(1, null)).toBe("unknown");
    expect(cableBand(1, 0)).toBe("unknown");
  });

  it("puts every run's figures together", () => {
    const runs = gridRuns(GRID, LOADS, 11);
    expect(runs.map((r) => r.id)).toEqual([
      "main",
      "right",
      "kitchen",
      "lounge",
      "charging",
    ]);
    const main = runs.find((r) => r.id === "main")!;
    expect(main.band).toBe("ok");
    expect(main.pct).toBeCloseTo(43.75, 6);
  });
});

describe("the tree", () => {
  it("lists a parent before its children, with depths", () => {
    expect(treeOrder(GRID).map((t) => `${t.depth}:${t.point.id}`)).toEqual([
      "0:gen",
      "1:main",
      "2:right",
      "3:kitchen",
      "2:lounge",
      "1:charging",
    ]);
  });

  it("draws a point whose parent is missing as a root", () => {
    expect(treeOrder([point("lost", "nowhere")])).toEqual([
      { point: point("lost", "nowhere"), depth: 0 },
    ]);
  });
});

describe("suggestedAmpsForGauge", () => {
  it("suggests a usual rating for a listed size only", () => {
    expect(suggestedAmpsForGauge(1.5)).toBe(15);
    expect(suggestedAmpsForGauge(2.5)).toBe(20);
    expect(suggestedAmpsForGauge(3)).toBeNull();
    expect(suggestedAmpsForGauge(null)).toBeNull();
  });
});
