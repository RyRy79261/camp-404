import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import {
  leaping,
  pixelRuns,
  type LeapingCat,
  type Sprite,
} from "@camp404/games/cats/leaping";
import { explosion } from "./explosion";
import { SHARE_SIZE } from "./share-meta";

// survival-guide.camp-404.com's link preview (owner, 2026-11-15): the camp's
// four cats mid-leap, flying out of a 16-bit explosion, beside the guide's
// name. Drawn by next/og at build time; no image files. The cats are never
// named, here or in the alt text (easter eggs).

export { SHARE_ALT, SHARE_SIZE } from "./share-meta";

// Hex, because the image renderer does not read the site's oklch tokens.
const BG = "#140a24"; // --color-os-bg
const FG = "#f7ecf3"; // --color-os-fg
const MUTED = "#b7a3c4"; // --os-muted
const MAGENTA = "#ff008c";
const CYAN = "#00dcff";
const PINK = "#f02fc2"; // --color-os-primary

/** The cats' letters (@camp404/games/cats/leaping) as hex. */
const CAT_COLOURS: Record<string, string> = {
  O: "#4b3b66", // outline, lifted so the black cat reads on the dark
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

const BLAST_COLOURS: Record<string, string> = {
  W: "#fff6dc",
  Y: "#ffe14a",
  R: "#ff8a1f",
  M: MAGENTA,
  m: "#8a0f63",
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

const BLAST_CELLS = 50;
const BLAST_PX = 8;
const CAT_PX = 7;
/** Where the explosion's heart is. */
const CX = 850;
const CY = 315;

/** Each cat: where its middle is, and which way it flies out. */
const FLIGHTS: {
  cat: LeapingCat;
  x: number;
  y: number;
  facing: "left" | "right";
}[] = [
  { cat: "jinn", x: 640, y: 128, facing: "left" },
  { cat: "moda", x: 1080, y: 186, facing: "right" },
  { cat: "prince", x: 1062, y: 470, facing: "right" },
  { cat: "nipster", x: 662, y: 432, facing: "left" },
];

/** Jinn's outline, lifted further: a black cat on a dark sky. */
const JINN_COLOURS = { ...CAT_COLOURS, O: "#8a74ad" };

/** Speed lines behind a cat, in its pixels: which row, how long, how far back. */
const STREAKS = [
  { row: 3, len: 6, back: 2 },
  { row: 7, len: 10, back: 1 },
  { row: 11, len: 5, back: 3 },
];

/**
 * One cat mid-leap, facing the way it flies, with speed lines behind it.
 * Never tilted: a pixel sprite this small loses its legs when turned, and
 * 16-bit games kept theirs level.
 */
function FlyingCat({ cat, x, y, facing }: (typeof FLIGHTS)[number]) {
  const sprite = leaping(cat, facing);
  const w = sprite[0]!.length * CAT_PX;
  const left = Math.round(x - w / 2);
  const top = Math.round(y - (sprite.length * CAT_PX) / 2);
  return (
    <>
      {STREAKS.map((s) => {
        const len = s.len * CAT_PX;
        const gap = s.back * CAT_PX;
        return (
          <div
            key={s.row}
            style={{
              position: "absolute",
              top: top + s.row * CAT_PX,
              left: facing === "right" ? left - gap - len : left + w + gap,
              width: len,
              height: CAT_PX,
              backgroundColor: s.row === 7 ? "#ffe14a" : FG,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left, top, display: "flex" }}>
        <Pixels
          sprite={sprite}
          px={CAT_PX}
          colours={cat === "jinn" ? JINN_COLOURS : CAT_COLOURS}
        />
      </div>
    </>
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
  const blast = BLAST_CELLS * BLAST_PX;
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
      <div
        style={{
          position: "absolute",
          left: CX - blast / 2,
          top: CY - blast / 2,
          display: "flex",
        }}
      >
        <Pixels
          sprite={explosion(BLAST_CELLS)}
          px={BLAST_PX}
          colours={BLAST_COLOURS}
        />
      </div>
      {FLIGHTS.map((f) => (
        <FlyingCat key={f.cat} {...f} />
      ))}
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 0,
          bottom: 0,
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
