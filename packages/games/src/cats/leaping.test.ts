import { describe, expect, it } from "vitest";
import {
  LEAPING_CATS,
  LEAPING_LETTERS,
  leaping,
  mirrorSprite,
  outlined,
  type Sprite,
} from "./leaping";

/** Every way the link preview draws a cat. */
const POSES = LEAPING_CATS.flatMap((cat) =>
  (["right", "left"] as const).map((facing) => ({ cat, facing })),
);

/** Each filled pixel's neighbours: none of them may be the air. */
function leaks(sprite: Sprite): string[] {
  const at = (x: number, y: number) => sprite[y]?.[x] ?? ".";
  const found: string[] = [];
  sprite.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "." || ch === "O") return;
      const near = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      if (near.includes(".")) found.push(`${ch} at ${x},${y}`);
    }),
  );
  return found;
}

describe("the leaping cats", () => {
  it("are all four camp cats", () => {
    expect([...LEAPING_CATS].sort()).toEqual([
      "jinn",
      "moda",
      "nipster",
      "prince",
    ]);
  });

  it.each(POSES)(
    "$cat facing $facing is a rectangle in the known letters, outlined all round",
    ({ cat, facing }) => {
      const sprite = leaping(cat, facing);
      const w = sprite[0]!.length;
      for (const row of sprite) expect(row).toHaveLength(w);
      const allowed = new Set<string>([".", ...LEAPING_LETTERS]);
      for (const ch of sprite.join("")) expect(allowed).toContain(ch);
      expect(leaks(sprite)).toEqual([]);
    },
  );

  it("are four different cats", () => {
    const drawn = new Set(LEAPING_CATS.map((c) => leaping(c).join("\n")));
    expect(drawn.size).toBe(4);
  });

  it("face left as the mirror of facing right", () => {
    expect(leaping("moda", "left")).toEqual(mirrorSprite(leaping("moda")));
  });
});

describe("outlined", () => {
  it("rings the fill and keeps a pupil inside", () => {
    expect(outlined(["AAA", "AOA", "AAA"])).toEqual([
      ".OOO.",
      "OAAAO",
      "OAOAO",
      "OAAAO",
      ".OOO.",
    ]);
  });
});
