import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { pieceKeys } from "@camp404/core";
import {
  LayoutPlan,
  areaLabelY,
  pieceDescription,
  scaleBarLength,
  type PlanPiece,
  type PlanPlot,
} from "../layout-plan";

// The drawing (#271, the approved redesign 2026-10-01): every piece wears its
// number, the roads are named round the plot, the side facing the other half
// of the block is hatched, and an area's name keeps clear of its tents.

afterEach(cleanup);

const font = 1.25;
const width = 16 * font * 0.6; // "2  Sleeping area"
const area: PlanPiece = {
  id: "a",
  kind: "sleeping_area",
  x: 2,
  y: 8,
  w: 21,
  h: 17,
};
const tent = (id: string, x: number, y: number): PlanPiece => ({
  id,
  kind: "tent",
  x,
  y,
  w: 3,
  h: 3,
});
const half: PlanPlot = { widthM: 28, depthM: 60, north: "top", part: "left" };
const edges = {
  top: "B Road",
  right: "4ish road",
  bottom: "A Road",
  left: "3ish road",
};

describe("areaLabelY", () => {
  it("writes an area's name along its bottom, as the Figma does", () => {
    const y = areaLabelY(area, [area, tent("t", 4, 9)], font, width);
    expect(y).toBeGreaterThan(area.y + area.h - font * 1.5);
  });

  it("moves the name to the top when tents line the bottom", () => {
    const pieces = [area, tent("t1", 3, 21.5)];
    const y = areaLabelY(area, pieces, font, width);
    expect(y).toBeLessThan(area.y + font * 3);
  });
});

describe("scaleBarLength", () => {
  it("is a round length about a third of the plot", () => {
    expect(scaleBarLength(28)).toBe(10);
    expect(scaleBarLength(56)).toBe(20);
    expect(scaleBarLength(6)).toBe(2);
  });
});

describe("pieceDescription", () => {
  it("names a piece by number and measures from the road along the top", () => {
    expect(
      pieceDescription(
        { id: "k", kind: "kitchen", label: "", x: 8, y: 28, w: 10, h: 7 },
        "4",
        "B Road",
      ),
    ).toBe(
      "4, Kitchen, 10 m by 7 m, 8 m from the left edge and 28 m from B Road",
    );
  });
});

describe("LayoutPlan", () => {
  const pieces: PlanPiece[] = [
    { id: "p", kind: "parking", label: "Car row", x: 1, y: 1, w: 26, h: 5 },
    { id: "g", kind: "generator", label: "", x: 24, y: 14, w: 3, h: 3 },
    tent("t1", 3, 9.5),
  ];

  /** What the drawing writes on itself (not the pieces' hover titles). */
  function words(plot: PlanPlot): string {
    return [...draw(plot).querySelectorAll("text")]
      .map((t) => t.textContent)
      .join("|");
  }

  function draw(plot: PlanPlot) {
    cleanup();
    return render(
      <LayoutPlan
        plot={plot}
        pieces={pieces}
        keys={pieceKeys(pieces)}
        edges={edges}
        label="Plan"
      />,
    ).container;
  }

  it("numbers every piece: a name where it fits, a ring where it does not, a tent's own number", () => {
    const text = words(half);
    expect(text).toContain("1  Car row");
    // The generator is too small for its name: its number alone, in a ring.
    expect(text).not.toContain("Generator");
    const ring = [...draw(half).querySelectorAll("circle")].map(
      (c) => c.nextElementSibling?.textContent,
    );
    expect(ring).toContain("2");
    expect(text).toContain("T1");
  });

  it("names the roads and hatches the other half instead of its road", () => {
    const text = words(half);
    expect(text).toContain("B ROAD");
    expect(text).toContain("A ROAD");
    expect(text).toContain("3ISH ROAD");
    expect(text).toContain("OTHER HALF OF THE BLOCK");
    // The left half's right side faces the other camp: no road is named there.
    expect(text).not.toContain("4ISH ROAD");
  });

  it("names every road round a whole-block plot", () => {
    const text = words({ ...half, part: "whole" });
    expect(text).toContain("4ISH ROAD");
    expect(text).not.toContain("OTHER HALF");
  });

  it("draws a scale bar and north", () => {
    const text = words(half);
    expect(text).toContain("10 m");
    expect(text).toContain("N");
  });
});
