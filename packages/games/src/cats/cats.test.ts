import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAT_FRAMES } from "../inkblot/cat";
import { petLine, PRINCE_PETTED } from "./clock-cat";
import { nextPaw, PAW_STRIDE } from "./paw-trail";
import { nextPeekDelay, PEEK_MAX_MS, PEEK_MIN_MS } from "./peek";
import { feedSecretKey, KONAMI } from "./secrets";
import {
  DESK_COLOURS,
  JINN_HEAD,
  JINN_SITTING,
  JINN_SLEEPING,
  PRINCE_SLEEPING,
  pixelRuns,
  spriteWidth,
} from "./sprites";

function feed(keys: readonly string[]) {
  let buffer: string[] = [];
  const found: string[] = [];
  for (const k of keys) {
    const r = feedSecretKey(buffer, k);
    buffer = r.buffer;
    if (r.secret) found.push(r.secret);
  }
  return found;
}

describe("the cats' sprites", () => {
  it("draws Prince 21 x 12, outlined all round, black cap and tail", () => {
    expect(PRINCE_SLEEPING).toHaveLength(12);
    for (const row of PRINCE_SLEEPING) expect(row).toHaveLength(21);
    // Outlined: the first and last drawn pixel of every row is outline.
    for (const row of PRINCE_SLEEPING) {
      const drawn = row.replace(/^\.+|\.+$/g, "");
      expect(drawn[0]).toBe("O");
      expect(drawn.at(-1)).toBe("O");
    }
    // White fur, and black (cap, patch, tail).
    const all = PRINCE_SLEEPING.join("");
    expect(all).toContain("W");
    expect(all).toContain("K");
  });

  it("cuts Jinn from INKBLOT's own frames", () => {
    expect(JINN_HEAD[0]).toBe(CAT_FRAMES.idle[0]![4]!.slice(6, 16));
    expect(JINN_HEAD).toHaveLength(9);
    expect(JINN_SITTING).toHaveLength(12);
    expect(spriteWidth(JINN_SITTING)).toBe(13);
    expect(JINN_SLEEPING.join("")).not.toContain("W"); // all black
  });

  it("lifts the outline so a black cat reads on the dark desktop", () => {
    expect(DESK_COLOURS.O).toBe("var(--os-muted)");
    expect(DESK_COLOURS.W).toBe("var(--os-fg)");
    expect(DESK_COLOURS.K).toMatch(/^oklch/);
  });

  it("merges each row's like pixels into runs, and skips the clear", () => {
    expect(pixelRuns(["..KKO.", "K..."], DESK_COLOURS)).toEqual([
      { x: 2, y: 0, w: 2, ch: "K" },
      { x: 4, y: 0, w: 1, ch: "O" },
      { x: 0, y: 1, w: 1, ch: "K" },
    ]);
    // Unknown letters are skipped like "."
    expect(pixelRuns(["ZZ"], DESK_COLOURS)).toEqual([]);
    // Every drawn pixel is in exactly one run.
    const runs = pixelRuns(PRINCE_SLEEPING, DESK_COLOURS);
    const pixels = PRINCE_SLEEPING.join("").replace(/\./g, "").length;
    expect(runs.reduce((n, r) => n + r.w, 0)).toBe(pixels);
    expect(runs.length).toBeLessThan(pixels / 2);
  });
});

describe("Prince, petted", () => {
  it("answers in turn, round and round", () => {
    expect(petLine(PRINCE_PETTED, 0)).toBe("");
    expect(petLine(PRINCE_PETTED, 1)).toBe("prrr");
    expect(petLine(PRINCE_PETTED, 5)).toBe("(Prince ignores you)");
    expect(petLine(PRINCE_PETTED, 6)).toBe("prrr");
  });
});

describe("Jinn's peeks", () => {
  it("come 50 to 110 seconds apart", () => {
    expect(nextPeekDelay(0)).toBe(PEEK_MIN_MS);
    expect(nextPeekDelay(0.999999)).toBeLessThan(PEEK_MAX_MS);
    expect(nextPeekDelay(0.5)).toBe(80_000);
  });
});

describe("the desktop's secret keys", () => {
  it("finds the Konami code", () => {
    expect(feed(KONAMI)).toEqual(["konami"]);
    expect(feed(["x", "ArrowUp", ...KONAMI.slice(0, 9), "A"])).toEqual([
      "konami",
    ]);
  });

  it("finds 'meow', in any case, and each one once", () => {
    expect(feed([..."meow"])).toEqual(["meow"]);
    expect(feed([..."MEOW"])).toEqual(["meow"]);
    expect(feed([..."meowmeow"])).toEqual(["meow", "meow"]);
    expect(feed([..."meo w"])).toEqual([]);
  });

  it("finds nothing in ordinary typing", () => {
    expect(feed([..."homework"])).toEqual([]);
    expect(feed(KONAMI.slice(0, 9))).toEqual([]);
  });
});

describe("paw prints", () => {
  it("leaves one every stride, on alternate feet, pointing the way", () => {
    expect(nextPaw({ x: 0, y: 0 }, PAW_STRIDE - 1, 0, 0)).toBeNull();
    const right = nextPaw({ x: 0, y: 0 }, PAW_STRIDE, 0, 0)!;
    expect(right).toMatchObject({ x: PAW_STRIDE, y: 0, angle: 90, side: -1 });
    const down = nextPaw({ x: 0, y: 0 }, 0, 40, 1)!;
    expect(down.angle).toBe(180);
    expect(down.side).toBe(1);
  });
});

// Under reduced motion the kit finishes every animation at once, which would
// leave Prince's bubble on its last frame (gone) before it was ever seen.
describe("cats.css under reduced motion", () => {
  const css = readFileSync(path.join(__dirname, "cats.css"), "utf8");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion"));

  it("gives the bubble still keyframes that show it first, with its own !important timing", () => {
    expect(reduced).toMatch(
      /\.cat-bubble\s*\{[^}]*animation:\s*cat-bubble-still[^;]*!important/,
    );
    expect(reduced).toMatch(/animation-duration:\s*1\.6s !important/);
    const still = /@keyframes cat-bubble-still\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(still?.[1]).toMatch(/0%,\s*90%\s*\{\s*opacity:\s*1/);
    // No movement in it: opacity only.
    expect(still?.[1]).not.toMatch(/transform/);
  });
});
