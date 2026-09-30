import { describe, expect, it } from "vitest";
import { DESK_COLOURS, type Sprite } from "../cats/sprites";
import { CLOUD_LOOK } from "./cloud";
import { DUST_COLOURS, DUST_FRAMES, DUST_H, DUST_W } from "./dust";
import {
  buildCharacter,
  characterPalette,
  HUMAN_LETTERS,
  TEMPLATE_LETTERS,
  withLapCat,
  type CharacterLook,
  type HumanPose,
} from "./human";
import {
  HUMAN_H,
  HUMAN_TEMPLATES,
  HUMAN_W,
  SIT_HANDS,
  SIT_W,
} from "./human-frames";
import {
  inlaid,
  laidOver,
  lettersOf,
  mirrored,
  outlined,
  padded,
} from "./pixels";
import {
  PRINCE_LAP,
  PRINCE_LAP_FLICK,
  PRINCE_LEAP,
  PRINCE_RUN,
} from "./prince";
import {
  beatStart,
  DUST_ORDER,
  REUNION_BEATS,
  REUNION_CALLS,
  REUNION_MS,
  reunionFrames,
} from "./prince-reunion";

/** Another camp member, as unlike Cloud as the options allow. */
const OTHER: CharacterLook = {
  id: "other",
  skin: { base: "oklch(0.5 0.08 50)", shade: "oklch(0.42 0.08 45)" },
  hair: {
    root: "oklch(0.2 0 0)",
    mid: "oklch(0.25 0 0)",
    tips: "oklch(0.3 0 0)",
    length: "short",
    style: "straight",
  },
  eyes: "oklch(0.2 0 0)",
  mouth: "oklch(0.4 0.1 20)",
  top: {
    kind: "tee",
    colour: "oklch(0.6 0.2 140)",
    shade: "oklch(0.5 0.2 140)",
  },
  bottoms: {
    kind: "shorts",
    colour: "oklch(0.5 0.1 60)",
    shade: "oklch(0.4 0.1 60)",
  },
  feet: "oklch(0.3 0.02 60)",
};

function isRectangular(s: Sprite): boolean {
  return s.length > 0 && s.every((r) => r.length === s[0]!.length);
}

/** The drawn pixels on a sprite's border: only outline may touch it. */
function borderLetters(s: Sprite): Set<string> {
  const edge = [s[0]!, s.at(-1)!, ...s.map((r) => r[0]! + r.at(-1)!)];
  return lettersOf([edge]);
}

function everyFrame(frames: ReturnType<typeof reunionFrames>): Sprite[] {
  return [
    ...frames.walk,
    ...frames.call,
    ...frames.look,
    frames.idle,
    frames.surprised,
    ...frames.run,
    frames.leap,
    ...frames.dust,
    ...frames.together,
    frames.tapped,
    frames.heart,
  ];
}

describe("the human template", () => {
  it("draws every pose on its canvas, in template letters only", () => {
    for (const [pose, frames] of Object.entries(HUMAN_TEMPLATES)) {
      for (const t of frames) {
        expect(t).toHaveLength(HUMAN_H);
        const w = pose === "sit" ? SIT_W : HUMAN_W;
        for (const row of t) expect(row).toHaveLength(w);
        for (const ch of lettersOf([t])) expect(TEMPLATE_LETTERS).toContain(ch);
        // A clear border, for the outline to land on.
        expect(borderLetters(t).size).toBe(0);
      }
    }
    expect(SIT_HANDS).toHaveLength(HUMAN_H);
  });
});

describe("a person built from a look", () => {
  for (const look of [CLOUD_LOOK, OTHER]) {
    it(`gives ${look.id} every frame rectangular, outlined, in palette`, () => {
      const person = buildCharacter(look);
      const palette = { ...DESK_COLOURS, ...person.palette };
      const frames = Object.values(person.frames).flat();
      expect(frames.length).toBe(12);
      for (const f of frames) {
        expect(isRectangular(f)).toBe(true);
        for (const ch of borderLetters(f)) expect(ch).toBe("O");
        for (const ch of lettersOf([f])) expect(palette).toHaveProperty(ch);
      }
    });
  }

  it("never uses a cat's letter, so a person and a cat share a sprite", () => {
    for (const ch of ["K", "D", "W", "G", "E", "O"])
      expect(HUMAN_LETTERS).not.toContain(ch);
    for (const ch of Object.keys(characterPalette(CLOUD_LOOK)))
      expect(HUMAN_LETTERS).toContain(ch);
  });

  it("trims long hair to the look's length", () => {
    const long = lettersOf(
      Object.values(buildCharacter(CLOUD_LOOK).frames).flat(),
    );
    const short = lettersOf(Object.values(buildCharacter(OTHER).frames).flat());
    expect(long).toContain("h"); // the bright lengths
    expect(short).not.toContain("h");
    const count = (look: CharacterLook) =>
      buildCharacter(look)
        .frames.idle[0]!.join("")
        .replace(/[^rHh]/g, "").length;
    const shoulder = {
      ...CLOUD_LOOK,
      hair: { ...CLOUD_LOOK.hair, length: "shoulder" as const },
    };
    expect(count(OTHER)).toBeLessThan(count(shoulder));
    expect(count(shoulder)).toBeLessThan(count(CLOUD_LOOK));
  });

  it("wears the look's accessories and print, and only those", () => {
    const cloud = lettersOf(
      Object.values(buildCharacter(CLOUD_LOOK).frames).flat(),
    );
    for (const ch of ["C", "N", "J", "X", "x", "P", "Q", "U"])
      expect(cloud).toContain(ch);
    const other = lettersOf(Object.values(buildCharacter(OTHER).frames).flat());
    for (const ch of ["C", "N", "J", "X", "x", "P", "Q", "U"])
      expect(other).not.toContain(ch);
  });

  it("shows two legs under trousers and one skirt under a maxi skirt", () => {
    const drawn = (look: CharacterLook) =>
      buildCharacter(look).frames.idle[0]!.join("").replace(/\./g, "").length;
    const skirted = {
      ...OTHER,
      bottoms: { ...OTHER.bottoms, kind: "maxi-skirt" as const },
    };
    const trousered = {
      ...OTHER,
      bottoms: { ...OTHER.bottoms, kind: "trousers" as const },
    };
    expect(drawn(trousered)).toBeLessThan(drawn(skirted));
    // Between the knees: cloth under a skirt, a gap (outlined) under trousers.
    const between = (look: CharacterLook) =>
      buildCharacter(look).frames.idle[0]![21]![8];
    expect(between(trousered)).toBe("O");
    expect(["B", "P", "Q", "U"]).toContain(between(skirted));
    // Shorts show skin below the knee where trousers show cloth.
    const shins = (look: CharacterLook) =>
      buildCharacter(look).frames.idle[0]!.join("").replace(/[^S]/g, "").length;
    expect(shins(OTHER)).toBeGreaterThan(shins(trousered));
  });

  it("covers a tattoo with a tee's sleeve", () => {
    const inked: CharacterLook = {
      ...OTHER,
      accessories: { tattoo: ["oklch(0.5 0.2 250)", "oklch(0.7 0.2 60)"] },
    };
    expect(lettersOf(buildCharacter(inked).frames.idle)).not.toContain("X");
    const bare = { ...inked, top: { ...inked.top, kind: "tank" as const } };
    expect(lettersOf(buildCharacter(bare).frames.idle)).toContain("X");
  });

  it("bares the waist on a crop top, in every pose", () => {
    const topPixels = (look: CharacterLook, pose: HumanPose) =>
      buildCharacter(look).frames[pose].flat().join("").replace(/[^Tt]/g, "")
        .length;
    const full = { ...OTHER, top: { ...OTHER.top, crop: false } };
    const crop = { ...OTHER, top: { ...OTHER.top, crop: true } };
    for (const pose of Object.keys(HUMAN_TEMPLATES) as HumanPose[]) {
      expect(topPixels(crop, pose), pose).toBeLessThan(topPixels(full, pose));
    }
  });
});

describe("Prince, for the reunion", () => {
  it("wears his markings in every frame: white fur and black cap and tail", () => {
    for (const f of [...PRINCE_RUN, PRINCE_LEAP]) {
      expect(isRectangular(f)).toBe(true);
      for (const ch of borderLetters(f)) expect(ch).toBe("O");
      const used = lettersOf([f]);
      expect(used).toContain("W");
      expect(used).toContain("K");
      for (const ch of used) expect(DESK_COLOURS).toHaveProperty(ch);
    }
    expect(PRINCE_RUN).toHaveLength(4);
  });

  it("curls up in a lap as fill, laid in the person's lap and outlined once", () => {
    for (const lap of [PRINCE_LAP, PRINCE_LAP_FLICK]) {
      expect(isRectangular(lap)).toBe(true);
      expect(lettersOf([lap])).not.toContain("O");
    }
    const together = withLapCat(CLOUD_LOOK, PRINCE_LAP);
    expect(together).toHaveLength(2);
    for (const f of together) {
      expect(f).toHaveLength(HUMAN_H);
      expect(f[0]).toHaveLength(SIT_W);
      const used = lettersOf([f]);
      expect(used).toContain("W"); // him
      expect(used).toContain("h"); // her hair
    }
  });
});

describe("the dust cloud", () => {
  it("has four frames of its size, outlined, in its palette and the pair's", () => {
    const palette = reunionFrames().palette;
    expect(DUST_FRAMES).toHaveLength(4);
    for (const f of DUST_FRAMES) {
      expect(f).toHaveLength(DUST_H);
      for (const row of f) expect(row).toHaveLength(DUST_W);
      for (const ch of borderLetters(f)) expect(ch).toBe("O");
      for (const ch of lettersOf([f])) expect(palette).toHaveProperty(ch);
      expect(lettersOf([f])).toContain("*"); // a star in every frame
    }
    for (const ch of Object.keys(DUST_COLOURS)) {
      expect(HUMAN_LETTERS).not.toContain(ch);
      expect(DESK_COLOURS).not.toHaveProperty(ch);
    }
    for (const i of DUST_ORDER) expect(DUST_FRAMES[i]).toBeDefined();
  });
});

describe("the reunion scene", () => {
  it("has every frame rectangular and every letter in its one palette", () => {
    const frames = reunionFrames();
    for (const f of everyFrame(frames)) {
      expect(isRectangular(f)).toBe(true);
      for (const ch of lettersOf([f]))
        expect(frames.palette).toHaveProperty(ch);
    }
  });

  it("faces her left for the walk in and the calls, towards where he comes from", () => {
    const frames = reunionFrames();
    const cloud = buildCharacter(CLOUD_LOOK);
    expect(frames.walk[0]).toEqual(mirrored(cloud.frames.walk[0]!));
    expect(frames.call[0]).toEqual(mirrored(cloud.frames.call[0]!));
  });

  it("calls 'Prince, prince, prince' quickly, then asks where he is, and lasts about 10 s", () => {
    expect(REUNION_CALLS).toEqual([
      "Prince, prince, prince",
      "Prince, where are you?",
    ]);
    const ids = REUNION_BEATS.map((b) => b.id);
    // One quick call, a look about, the question, then he comes.
    expect(ids.slice(2, 7)).toEqual([
      "call-1",
      "look-1",
      "look-2",
      "call-2",
      "sprint",
    ]);
    const ms = (id: string) => REUNION_BEATS.find((b) => b.id === id)!.ms;
    expect(ms("call-1")).toBe(1200);
    expect(ms("call-2")).toBe(1500);
    expect(ms("look-1") + ms("look-2")).toBeLessThanOrEqual(1000);
    expect(REUNION_MS).toBeGreaterThan(9_000);
    expect(REUNION_MS).toBeLessThan(11_000);
    expect(beatStart("walk-in")).toBe(0);
    expect(beatStart("sprint")).toBe(5_800);
    expect(() => beatStart("nope")).toThrow();
  });
});

describe("the pixel tools", () => {
  it("outlines across edges, not corners", () => {
    expect(outlined(["...", ".S.", "..."])).toEqual([".O.", "OSO", ".O."]);
  });

  it("pads, mirrors and lays one sprite over another", () => {
    expect(padded(["S"])).toEqual(["...", ".S.", "..."]);
    expect(mirrored(["AB."])).toEqual([".BA"]);
    expect(mirrored(mirrored(["AB.", "C.."]))).toEqual(["AB.", "C.."]);
    expect(laidOver(["....", "...."], ["X.", "XX"], 1, 0)).toEqual([
      ".X..",
      ".XX.",
    ]);
  });

  it("inlays with a line only where the top meets something drawn", () => {
    expect(inlaid(["SSS", "..."], ["W"], 1, 1, "l")).toEqual(["SlS", ".W."]);
  });
});
