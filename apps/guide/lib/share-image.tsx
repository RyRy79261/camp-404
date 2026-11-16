import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  PET_PORTRAITS,
  trimSprite,
  type PetModuleKey,
} from "@camp404/games/pets";
import { FIRE, glow, stars } from "./campfire";

/** A sprite: one letter a pixel, "." see-through. */
type Sprite = readonly string[];

/** Each row's neighbouring pixels of one colour, as one rectangle. */
function pixelRuns(
  sprite: Sprite,
  colours: Record<string, string>,
): { x: number; y: number; w: number; ch: string }[] {
  const runs: { x: number; y: number; w: number; ch: string }[] = [];
  sprite.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (colours[ch]) runs.push({ x, y, w: end - x, ch });
      x = end;
    }
  });
  return runs;
}
import { SHARE_SIZE } from "./share-meta";

// survival-guide.camp-404.com's link preview (owner, 2026-11-16, after a
// first draft of the cats flying out of an explosion): the camp's four cats
// round a campfire under the stars, from the Camp pets portraits
// (PET_PORTRAITS): Jinn's sitting one, recoloured for Moda and Nipster, and
// Prince asleep by the fire. Beside the guide's name. Drawn by
// next/og at build time; no image files. The cats are never named, here or in
// the alt text (easter eggs).

export { SHARE_ALT, SHARE_SIZE } from "./share-meta";

// Hex, because the image renderer does not read the site's oklch tokens.
const BG = "#140a24"; // --color-os-bg
const FG = "#f7ecf3"; // --color-os-fg
const MUTED = "#af94b0"; // --os-muted
const MAGENTA = "#ff008c";
const CYAN = "#00dcff";
const PINK = "#f02fc2"; // --color-os-primary

/**
 * The portraits' letters as hex: their palettes use the desktop's CSS
 * variables and oklch, which the image renderer does not read.
 */
const CAT_COLOURS: Record<string, string> = {
  O: MUTED, // the outline, as the pet cards draw it
  K: "#0b0714", // Jinn's coat
  D: "#3a2d55", // Jinn's sheen
  E: "#ff3fb4", // Jinn's eye
  A: "#e98a3a", // orange
  a: "#b0532a", // orange stripe
  W: FG, // white
  G: "#b9adbf", // white's shade
  L: "#c9d65a", // eyes
  P: "#e8a0ae", // nose
};

const FIRE_COLOURS: Record<string, string> = {
  W: "#fff6dc",
  Y: "#ffe14a",
  R: "#ff8a1f",
  M: MAGENTA,
  B: "#7a4326", // log
  b: "#4a2617", // log, shadow
  S: "#4a3e5e", // stone
};

/** The firelight on the ground, warm tints of it from the middle out. */
const GLOW_COLOURS: Record<string, string> = {
  L: "#5c2a3e",
  l: "#43203d",
  g: "#2f1838",
};

/** A sprite as one absolutely placed square per run of a colour. */
function Pixels({
  sprite,
  px,
  colours,
}: {
  sprite: Sprite;
  px: number;
  colours: Record<string, string>;
}) {
  const w = Math.max(...sprite.map((r) => r.length));
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: w * px,
        height: sprite.length * px,
      }}
    >
      {pixelRuns(sprite, colours).map((r) => (
        <div
          key={`${r.x}-${r.y}`}
          style={{
            position: "absolute",
            left: r.x * px,
            top: r.y * px,
            width: r.w * px,
            height: px,
            backgroundColor: colours[r.ch],
          }}
        />
      ))}
    </div>
  );
}

const PX = 9;
/** The ground's top edge, and the middle of the fire's base. */
const GROUND = 440;
const FIRE_X = 872;
const FIRE_BASE = 512;

/**
 * Each cat: the middle of its feet, and whether it is turned round. Two sit
 * close to the fire, two further out and nearer the viewer.
 */
const SEATS: { cat: PetModuleKey; x: number; y: number; flip?: boolean }[] = [
  { cat: "moda", x: 722, y: 500 },
  { cat: "nipster", x: 1020, y: 500, flip: true },
  { cat: "jinn", x: 616, y: 584 },
  { cat: "prince", x: 1084, y: 584 },
];

/** Embers rising off the fire, in pixels from the top of its flames. */
const EMBERS = [
  { dx: -3, dy: -3, c: "#ffe14a" },
  { dx: 4, dy: -6, c: "#ff8a1f" },
  { dx: -1, dy: -9, c: "#ffe14a" },
  { dx: 6, dy: -12, c: MAGENTA },
  { dx: 1, dy: -15, c: "#ff8a1f" },
];

/** A sprite placed by the middle of its bottom row. */
function Standing({
  sprite,
  x,
  y,
  colours,
}: {
  sprite: Sprite;
  x: number;
  y: number;
  colours: Record<string, string>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: Math.round(x - (sprite[0]!.length * PX) / 2),
        top: y - sprite.length * PX,
        display: "flex",
      }}
    >
      <Pixels sprite={sprite} px={PX} colours={colours} />
    </div>
  );
}

function Night() {
  const sky = stars(Math.floor(620 / PX), Math.floor(GROUND / PX) - 6, 26);
  const light = glow(62, 14);
  const flamesTop = FIRE_BASE - FIRE.length * PX;
  return (
    <>
      {sky.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 570 + s.x * PX,
            top: 14 + s.y * PX,
            width: PX,
            height: PX,
            backgroundColor: s.bright ? FG : MUTED,
            opacity: s.bright ? 1 : 0.55,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: GROUND,
          width: SHARE_SIZE.width,
          height: SHARE_SIZE.height - GROUND,
          backgroundColor: "#1f1033",
          borderTop: `${PX}px solid #2b1844`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: FIRE_X - (light[0]!.length * PX) / 2,
          top: FIRE_BASE - (light.length * PX) / 2 - PX,
          display: "flex",
        }}
      >
        <Pixels sprite={light} px={PX} colours={GLOW_COLOURS} />
      </div>
      {SEATS.slice(0, 2).map((s) => (
        <Cat key={s.cat} {...s} />
      ))}
      <Standing sprite={FIRE} x={FIRE_X} y={FIRE_BASE} colours={FIRE_COLOURS} />
      {EMBERS.map((e) => (
        <div
          key={e.dy}
          style={{
            position: "absolute",
            left: FIRE_X + e.dx * PX,
            top: flamesTop + e.dy * PX,
            width: PX,
            height: PX,
            backgroundColor: e.c,
          }}
        />
      ))}
      {SEATS.slice(2).map((s) => (
        <Cat key={s.cat} {...s} />
      ))}
    </>
  );
}

/**
 * Moda and Nipster in Jinn's art style (owner, 2026-11-16: their desktop
 * sprites are "a different artstyle"): Jinn's own sitting portrait, every
 * pixel where it is, only its coat (K), the sheen on his back and tail (D)
 * and his eye (E) recoloured to theirs.
 */
const RECOATS: Partial<Record<PetModuleKey, Record<string, string>>> = {
  moda: { K: "A", D: "a", E: "L" }, // orange tabby, a darker back
  nipster: { K: "K", D: "A", E: "L" }, // tortoiseshell: black, orange back
};

function portrait(cat: PetModuleKey): Sprite {
  const coat = RECOATS[cat];
  const sprite = coat ? PET_PORTRAITS.jinn.sprite : PET_PORTRAITS[cat].sprite;
  return trimSprite(
    coat ? sprite.map((r) => r.replace(/[KDE]/g, (c) => coat[c]!)) : sprite,
  );
}

function Cat({ cat, x, y, flip }: (typeof SEATS)[number]) {
  const sprite = portrait(cat);
  return (
    <Standing
      sprite={flip ? sprite.map((r) => [...r].reverse().join("")) : sprite}
      x={x}
      y={y}
      colours={CAT_COLOURS}
    />
  );
}

/** Text with the landing page's magenta/cyan split. */
function GlitchText({ text, size }: { text: string; size: number }) {
  const layer = (color: string, dx: number) =>
    ({
      position: "absolute",
      left: dx,
      top: 0,
      color,
      fontSize: size,
      lineHeight: 1,
      display: "flex",
      whiteSpace: "nowrap",
    }) as const;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <div style={layer(MAGENTA, -5)}>{text}</div>
      <div style={layer(CYAN, 5)}>{text}</div>
      <div
        style={{
          display: "flex",
          position: "relative",
          color: FG,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Layout() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        backgroundColor: BG,
        fontFamily: "Silkscreen",
        overflow: "hidden",
      }}
    >
      <Night />
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 0,
          height: GROUND,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: PINK,
            letterSpacing: 4,
          }}
        >
          CAMP 404
        </div>
        <GlitchText text="SURVIVAL" size={76} />
        <GlitchText text="GUIDE" size={76} />
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontSize: 22,
            color: MUTED,
            letterSpacing: 1,
          }}
        >
          survival-guide.camp-404.com
        </div>
      </div>
    </div>
  );
}

export async function renderShareImage(): Promise<ImageResponse> {
  const font = await readFile(
    join(process.cwd(), "assets/Silkscreen-Regular.ttf"),
  );
  return new ImageResponse(<Layout />, {
    ...SHARE_SIZE,
    fonts: [{ name: "Silkscreen", data: font, style: "normal", weight: 400 }],
  });
}
