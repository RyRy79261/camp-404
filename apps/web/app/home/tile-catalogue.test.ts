import { describe, expect, it } from "vitest";
import { TILE_CATALOGUE } from "./tile-catalogue";

// Every tile either opens something or says why it can't. The type demands a
// reason on a parked tile; this pins that the words are real.

const tiles = TILE_CATALOGUE.flatMap((group) => group.tiles);

describe("home tile catalogue", () => {
  it("gives every parked tile a reason a member can read", () => {
    const parked = tiles.filter((tile) => tile.comingSoon);
    expect(parked.length).toBeGreaterThan(0);
    for (const tile of parked) {
      expect(`${tile.id}: ${tile.reason?.trim() ? "ok" : "no reason"}`).toBe(
        `${tile.id}: ok`,
      );
    }
  });

  it("gives every live tile a destination and no reason", () => {
    for (const tile of tiles.filter((t) => !t.comingSoon)) {
      expect(tile.href).toMatch(/^\//);
      expect(tile.reason).toBeUndefined();
    }
  });
});
