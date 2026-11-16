import { describe, expect, it } from "vitest";
import { PRINCE_SITTING } from "./sprites";
import { SITTING, SITTING_LETTERS, mirrorSprite, type Sprite } from "./sitting";

const CATS = Object.entries(SITTING);

/** Filled pixels that touch the air: an outline with a gap. */
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

describe("the sitting cats", () => {
  it("are all four camp cats, each a different picture", () => {
    expect(Object.keys(SITTING).sort()).toEqual([
      "jinn",
      "moda",
      "nipster",
      "prince",
    ]);
    expect(new Set(CATS.map(([, s]) => s.join("\n"))).size).toBe(4);
  });

  it.each(CATS)(
    "%s is a trimmed rectangle in the known letters, outlined all round",
    (_, sprite) => {
      const w = sprite[0]!.length;
      for (const row of sprite) expect(row).toHaveLength(w);
      expect(sprite[0]).toMatch(/[^.]/);
      expect(sprite.at(-1)).toMatch(/[^.]/);
      const allowed = new Set<string>([".", ...SITTING_LETTERS]);
      for (const ch of sprite.join("")) expect(allowed).toContain(ch);
      expect(leaks(sprite)).toEqual([]);
    },
  );

  it("draws Prince on rows of one width", () => {
    const w = PRINCE_SITTING[0]!.length;
    for (const row of PRINCE_SITTING) expect(row).toHaveLength(w);
  });

  it("turn round without changing size", () => {
    const back = mirrorSprite(SITTING.jinn);
    expect(back[0]).toBe([...SITTING.jinn[0]!].reverse().join(""));
    expect(mirrorSprite(back)).toEqual(SITTING.jinn);
  });
});
