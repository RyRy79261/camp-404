import { describe, expect, it } from "vitest";
import { CampLayout, Team, type LayoutPiece } from "@camp404/types";
import {
  DEFAULT_PLOT,
  LAYOUT_KIND_LABELS,
  LAYOUT_KIND_SIZES,
  LAYOUT_TEAM,
  arrivalDayCounts,
  canEditLayout,
  canShareLayout,
  emptyLayout,
  keepOnPlot,
  movePiece,
  neighbourView,
  newPiece,
  overlappingPieces,
  pieceCounts,
  pieceName,
  resizePlot,
  turnPiece,
} from "../camp-layout";

const PLOT = { ...DEFAULT_PLOT, widthM: 20, depthM: 10 };

function piece(overrides: Partial<LayoutPiece> = {}): LayoutPiece {
  return {
    id: "p-1",
    kind: "tent",
    label: "",
    x: 0,
    y: 0,
    w: 3,
    h: 2,
    ...overrides,
  };
}

describe("canEditLayout", () => {
  it("names a real team", () => {
    expect(Team.options).toContain(LAYOUT_TEAM);
  });

  it("lets a captain, and a lead of Structures, edit", () => {
    expect(canEditLayout("captain", [])).toBe(true);
    expect(canEditLayout("team_lead", [LAYOUT_TEAM])).toBe(true);
    expect(canEditLayout("team_lead", ["kitchen", LAYOUT_TEAM])).toBe(true);
  });

  it("refuses a lead of another team, a member, and an unknown rank", () => {
    expect(canEditLayout("team_lead", ["kitchen"])).toBe(false);
    expect(canEditLayout("team_lead", [])).toBe(false);
    // A member on Structures who does not lead it still only reads.
    expect(canEditLayout("camp_member", [LAYOUT_TEAM])).toBe(false);
    expect(canEditLayout("god", [LAYOUT_TEAM])).toBe(false);
    expect(canEditLayout("", [])).toBe(false);
  });
});

describe("canShareLayout", () => {
  it("is a captain's alone", () => {
    expect(canShareLayout("captain")).toBe(true);
    expect(canShareLayout("team_lead")).toBe(false);
    expect(canShareLayout("camp_member")).toBe(false);
    expect(canShareLayout("admin")).toBe(false);
  });
});

describe("the grid", () => {
  it("snaps to half metres and keeps a piece on the plot", () => {
    expect(keepOnPlot(piece({ x: 1.3, y: 0.74 }), PLOT)).toMatchObject({
      x: 1.5,
      y: 0.5,
    });
    expect(keepOnPlot(piece({ x: 19, y: 9 }), PLOT)).toMatchObject({
      x: 17,
      y: 8,
    });
    expect(keepOnPlot(piece({ x: -4, y: -1 }), PLOT)).toMatchObject({
      x: 0,
      y: 0,
    });
    // Bigger than the plot: cut to it.
    expect(keepOnPlot(piece({ w: 50, h: 50 }), PLOT)).toMatchObject({
      x: 0,
      y: 0,
      w: 20,
      h: 10,
    });
  });

  it("moves a piece and stops it at the edge", () => {
    const p = piece({ x: 5, y: 5 });
    expect(movePiece(p, 1, 0, PLOT)).toMatchObject({ x: 6, y: 5 });
    expect(movePiece(p, 0, -1, PLOT)).toMatchObject({ x: 5, y: 4 });
    expect(movePiece(p, 100, 100, PLOT)).toMatchObject({ x: 17, y: 8 });
  });

  it("turns a piece about its centre", () => {
    const turned = turnPiece(piece({ x: 5, y: 4, w: 4, h: 2 }), PLOT);
    expect(turned).toMatchObject({ w: 2, h: 4, x: 6, y: 3 });
  });

  it("places a new piece mid-plot at its kind's size", () => {
    const p = newPiece("generator", "p-9", PLOT);
    expect(p).toMatchObject({
      id: "p-9",
      kind: "generator",
      label: "",
      ...LAYOUT_KIND_SIZES.generator,
    });
    expect(p.x + p.w / 2).toBeCloseTo(10, 0);
  });

  it("pulls every piece back when the plot shrinks", () => {
    const layout = { plot: PLOT, pieces: [piece({ x: 15, y: 7 })] };
    const smaller = resizePlot(layout, { ...PLOT, widthM: 10, depthM: 5 });
    expect(smaller.pieces[0]).toMatchObject({ x: 7, y: 3 });
    expect(CampLayout.safeParse(smaller).success).toBe(true);
  });

  it("finds overlapping pieces, not touching ones", () => {
    const a = piece({ id: "a", x: 0, y: 0, w: 2, h: 2 });
    const b = piece({ id: "b", x: 2, y: 0, w: 2, h: 2 });
    const c = piece({ id: "c", x: 1, y: 1, w: 2, h: 2 });
    expect([...overlappingPieces([a, b])]).toEqual([]);
    expect([...overlappingPieces([a, b, c])].sort()).toEqual(["a", "b", "c"]);
  });

  it("does not count a piece inside an area, such as a tent in the sleeping area", () => {
    const area = piece({ id: "area", kind: "sleeping_area", w: 10, h: 8 });
    const tent = piece({ id: "t", x: 1, y: 1 });
    const shade = piece({ id: "s", kind: "shade", x: 0, y: 0, w: 6, h: 6 });
    expect([...overlappingPieces([area, tent, shade])]).toEqual([]);
    const tent2 = piece({ id: "t2", x: 2, y: 1 });
    expect([...overlappingPieces([area, tent, tent2])].sort()).toEqual([
      "t",
      "t2",
    ]);
  });

  it("names and counts pieces", () => {
    expect(pieceName(piece({ label: "  " }))).toBe("Tent");
    expect(pieceName(piece({ label: "Big shade" }))).toBe("Big shade");
    expect(
      pieceCounts([{ kind: "tent" }, { kind: "kitchen" }, { kind: "tent" }]),
    ).toEqual([
      { kind: "kitchen", count: 1 },
      { kind: "tent", count: 2 },
    ]);
  });

  it("gives every kind a label and a size that fits the default plot", () => {
    for (const kind of Object.keys(LAYOUT_KIND_LABELS)) {
      const size = LAYOUT_KIND_SIZES[kind as keyof typeof LAYOUT_KIND_SIZES];
      expect(size.w).toBeLessThanOrEqual(emptyLayout().plot.widthM);
      expect(size.h).toBeLessThanOrEqual(emptyLayout().plot.depthM);
    }
  });
});

describe("what leaves the camp", () => {
  it("keeps kinds and places, and drops every label and edge note", () => {
    const layout: CampLayout = {
      plot: {
        ...PLOT,
        edges: {
          top: "Road",
          right: "Sam Jones's camp",
          bottom: "",
          left: "Dune",
        },
      },
      pieces: [piece({ label: "Sam Jones's tent", x: 1, y: 2 })],
    };
    const view = neighbourView(layout);
    expect(view).toEqual({
      plot: { widthM: 20, depthM: 10, north: "top" },
      pieces: [{ kind: "tent", x: 1, y: 2, w: 3, h: 2 }],
    });
    expect(JSON.stringify(view)).not.toContain("Sam");
  });

  it("counts arrival days, earliest first, and skips blanks", () => {
    expect(
      arrivalDayCounts([
        new Date("2027-04-27T00:00:00Z"),
        null,
        new Date("2027-04-25T00:00:00Z"),
        new Date("2027-04-27T00:00:00Z"),
        new Date("not a date"),
      ]),
    ).toEqual([
      { day: "2027-04-25", count: 1 },
      { day: "2027-04-27", count: 2 },
    ]);
  });
});

describe("CampLayout", () => {
  it("refuses a piece off the plot, off the grid, or a repeated id", () => {
    const ok = { plot: PLOT, pieces: [piece()] };
    expect(CampLayout.safeParse(ok).success).toBe(true);
    expect(
      CampLayout.safeParse({ plot: PLOT, pieces: [piece({ x: 18 })] }).success,
    ).toBe(false);
    expect(
      CampLayout.safeParse({ plot: PLOT, pieces: [piece({ x: 0.3 })] }).success,
    ).toBe(false);
    expect(
      CampLayout.safeParse({ plot: PLOT, pieces: [piece(), piece()] }).success,
    ).toBe(false);
    expect(
      CampLayout.safeParse({ plot: { ...PLOT, widthM: 1 }, pieces: [] })
        .success,
    ).toBe(false);
  });
});
