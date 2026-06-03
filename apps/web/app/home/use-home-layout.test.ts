import { describe, expect, it } from "vitest";
import { applyOrder } from "./use-home-layout";

// Pure reconcile logic behind the localStorage home layout: a saved tile order
// is replayed over the live catalogue, tolerating tiles added/removed across
// releases. (The drag interaction itself is @dnd-kit's concern.)

const tile = (id: string) => ({ id });

describe("applyOrder", () => {
  it("returns the tiles unchanged when there is no saved order", () => {
    const tiles = [tile("a"), tile("b"), tile("c")];
    expect(applyOrder(tiles, undefined)).toEqual(tiles);
    expect(applyOrder(tiles, [])).toEqual(tiles);
  });

  it("reorders tiles to match the saved id list", () => {
    const tiles = [tile("a"), tile("b"), tile("c")];
    expect(applyOrder(tiles, ["c", "a", "b"]).map((t) => t.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("drops saved ids that are no longer in the catalogue", () => {
    const tiles = [tile("a"), tile("b")];
    expect(applyOrder(tiles, ["b", "gone", "a"]).map((t) => t.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("appends new tiles (absent from the saved order) in catalogue order", () => {
    const tiles = [tile("a"), tile("b"), tile("c"), tile("d")];
    // Saved order only knew about c + a; b and d are new since.
    expect(applyOrder(tiles, ["c", "a"]).map((t) => t.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });
});
